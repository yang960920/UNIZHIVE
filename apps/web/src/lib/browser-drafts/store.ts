/** Browser-only drafts. No network calls or server credentials belong in this store. */
const DATABASE = "uniz-hive-browser-drafts";
const STORE = "drafts";
const RETENTION = 30 * 24 * 60 * 60 * 1000;
const PUBLISHED = "uniz-hive-published-drafts";
type PublicationReceipt = { id: string; revision: number; at: number };

function publicationReceipts(): PublicationReceipt[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PUBLISHED) ?? "[]");
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is PublicationReceipt =>
            !!entry &&
            typeof entry.id === "string" &&
            Number.isInteger(entry.revision) &&
            typeof entry.at === "number" &&
            entry.at > Date.now() - RETENTION,
        )
      : [];
  } catch {
    return [];
  }
}

/** Small independent receipt prevents restoring a published draft if IDB cleanup temporarily fails. */
export function markBrowserDraftPublished(record: BrowserDraftRecord): void {
  try {
    localStorage.setItem(
      PUBLISHED,
      JSON.stringify(
        [
          ...publicationReceipts().filter((entry) => entry.id !== record.id),
          { id: record.id, revision: record.revision, at: Date.now() },
        ].slice(-100),
      ),
    );
  } catch {
    /* Blocked browser storage must never turn publication into failure. */
  }
}

export interface BrowserDraftRecord<T = unknown> {
  id: string;
  owner: string;
  scope: string;
  writer: string;
  revision: number;
  savedAt: number;
  fingerprint: string;
  value: T;
}

export function draftFingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof Blob !== "undefined" && item instanceof Blob) {
      const file = item as File;
      return {
        file: file.name ?? "",
        size: file.size,
        type: file.type,
        modified: file.lastModified ?? 0,
      };
    }
    return typeof item === "string" && item.startsWith("blob:") ? "blob:local-preview" : item;
  });
}

export function browserDraftError(error: unknown): string {
  if (error instanceof Error && error.name === "QuotaExceededError") {
    return "브라우저 저장 공간이 부족해 임시저장하지 못했어요. 작성 내용은 현재 화면에 남아 있습니다.";
  }
  return "브라우저에 임시저장하지 못했어요. 작성 내용을 유지한 채 다시 시도해주세요.";
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Browser storage unavailable"));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    let finished = false;
    const timer = setTimeout(() => {
      finished = true;
      reject(new Error("Browser storage blocked"));
    }, 4000);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("ownerScope", ["owner", "scope"]);
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (finished) request.result.close();
      else {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      }
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error ?? new Error("Cannot open browser storage"));
    };
  });
}

export async function readBrowserDrafts<T>(
  owner: string,
  scope: string,
): Promise<BrowserDraftRecord<T>[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).index("ownerScope").getAll([owner, scope]);
    transaction.oncomplete = () => {
      db.close();
      const receipts = publicationReceipts();
      resolve(
        (request.result as BrowserDraftRecord<T>[])
          .filter((record) => record.savedAt > Date.now() - RETENTION)
          .filter(
            (record) =>
              !receipts.some(
                (receipt) => receipt.id === record.id && receipt.revision >= record.revision,
              ),
          )
          .sort((left, right) => right.savedAt - left.savedAt),
      );
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? new Error("Cannot read browser drafts"));
    };
  });
}

/** Compare the loaded revision in the same transaction. Concurrent tabs fork instead of overwriting. */
export async function writeBrowserDraft<T>(input: {
  owner: string;
  scope: string;
  writer: string;
  value: T;
  previous: BrowserDraftRecord<T> | null;
}): Promise<BrowserDraftRecord<T>> {
  const fingerprint = draftFingerprint(input.value);
  if (fingerprint.length > 1_000_000) throw new Error("Draft document too large");
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    let record: BrowserDraftRecord<T>;
    const previous = input.previous;
    const request = store.get(previous?.id ?? "");
    request.onsuccess = () => {
      const current = request.result as BrowserDraftRecord<T> | undefined;
      const mayReplace =
        current &&
        current.owner === input.owner &&
        current.scope === input.scope &&
        current.revision === previous?.revision;
      record = {
        id: mayReplace ? current.id : crypto.randomUUID(),
        owner: input.owner,
        scope: input.scope,
        writer: input.writer,
        revision: mayReplace ? current.revision + 1 : 1,
        savedAt: Date.now(),
        fingerprint,
        value: input.value,
      };
      store.put(record);
    };
    // Expire only old records; never evict another tab's recent draft to make space.
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (!item) return;
      if ((item.value as BrowserDraftRecord).savedAt <= Date.now() - RETENTION) item.delete();
      item.continue();
    };
    transaction.oncomplete = () => {
      db.close();
      resolve(record);
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? new Error("Cannot save browser draft"));
    };
  });
}

/** Successful publication must not delete a newer draft written by a different tab. */
export async function deleteBrowserDraft(record: BrowserDraftRecord): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    const request = store.get(record.id);
    request.onsuccess = () => {
      const current = request.result as BrowserDraftRecord | undefined;
      if (
        current?.owner === record.owner &&
        current.scope === record.scope &&
        current.revision === record.revision
      )
        store.delete(record.id);
    };
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
  });
}
