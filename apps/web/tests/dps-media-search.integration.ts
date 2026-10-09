import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyGearLoadout } from "@uniz/build-engine";
import type { CurrentUser } from "../src/lib/auth-policy";
import { dpsSaveSchema } from "../src/lib/dps-research";
import { CONTENT_SCHEMA_VERSION, type ContentDocument } from "../src/lib/content-document";

vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({
  transaction: null as unknown,
  actor: null as CurrentUser | null,
}));
vi.mock("../src/lib/auth", () => ({
  getCurrentAuthState: async () => ({
    user: boundary.actor,
    status: boundary.actor ? "AUTHENTICATED" : "GUEST",
  }),
}));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getSessionGuildEligibilityState: async () => ({ status: "MEMBER" }),
}));
vi.mock("../src/lib/server/steam-overview", () => ({
  getSteamOverview: async () => ({ news: { items: [] } }),
}));
vi.mock("@uniz/db", async (original) => {
  const actual = await original<typeof import("@uniz/db")>();
  return { ...actual, getDb: () => boundary.transaction ?? actual.getDb() };
});
import {
  accounts,
  builds,
  buildVersions,
  buildShareRequests,
  buildPublications,
  contentImages,
  contentImageReferences,
  dpsResearchRecords,
  dpsResearchVersions,
  dpsResearchPublications,
  dpsResearchVerifications,
  eq,
  getDb,
  sql,
  users,
} from "@uniz/db";
import {
  bindContentImages,
  readContentImage,
  stageContentImage,
} from "../src/lib/server/content-media";
import { getUnifiedSearch } from "../src/lib/server/unified-search";
import { GET as getImage } from "../src/app/api/content/image/[id]/route";

process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
)
  throw new Error("DPS media/search verification requires the local uniz_hive database.");
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Fixture = { owner: CurrentUser; other: CurrentUser; officer: CurrentUser; admin: CurrentUser };
class FixtureRollback extends Error {}

async function flushDeferredGuards(tx: Transaction) {
  // The final fixture rollback does not execute commit-time constraint triggers.
  await tx.execute(sql`set constraints all immediate`);
  await tx.execute(sql`set constraints all deferred`);
}
afterEach(() => vi.unstubAllEnvs());

async function withFixture(check: (tx: Transaction, actors: Fixture) => Promise<void>) {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  const actors: Fixture = {
    owner: { id: randomUUID(), name: "DPS image owner", role: "MEMBER", isMock: false },
    other: { id: randomUUID(), name: "DPS image member", role: "MEMBER", isMock: false },
    officer: { id: randomUUID(), name: "DPS image officer", role: "OFFICER", isMock: false },
    admin: { id: randomUUID(), name: "DPS image administrator", role: "ADMIN", isMock: false },
  };
  try {
    await actual.getDb().transaction(async (tx) => {
      boundary.transaction = tx;
      vi.stubEnv("GAME_INFO_EXAMPLES", "off");
      for (const actor of Object.values(actors)) {
        await tx.insert(users).values({ id: actor.id, name: actor.name, role: actor.role });
        await tx.insert(accounts).values({
          userId: actor.id,
          provider: "discord",
          providerAccountId: `dps-media-${actor.id}`,
          access_token: "private-dps-media-fixture-token",
        });
      }
      await check(tx, actors);
      throw new FixtureRollback();
    });
  } catch (error) {
    if (!(error instanceof FixtureRollback)) throw error;
  } finally {
    boundary.transaction = null;
    boundary.actor = null;
  }
  for (const actor of Object.values(actors)) {
    expect(
      await actual.getDb().select({ id: users.id }).from(users).where(eq(users.id, actor.id)),
    ).toHaveLength(0);
    expect(
      await actual
        .getDb()
        .select({ id: dpsResearchRecords.id })
        .from(dpsResearchRecords)
        .where(eq(dpsResearchRecords.ownerId, actor.id)),
    ).toHaveLength(0);
    expect(
      await actual
        .getDb()
        .select({ id: contentImages.id })
        .from(contentImages)
        .where(eq(contentImages.ownerId, actor.id)),
    ).toHaveLength(0);
  }
}
async function image(owner: CurrentUser, color: string) {
  const bytes = await sharp({ create: { width: 64, height: 32, channels: 4, background: color } })
    .png()
    .toBuffer();
  return stageContentImage(
    owner,
    new File([new Uint8Array(bytes)], "dps-evidence.png", { type: "image/png" }),
  );
}
function documentWith(imageId: string): ContentDocument {
  return {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    type: "doc",
    content: [{ type: "image", attrs: { imageId, alt: "측정 결과" } }],
  };
}
async function record(tx: Transaction, owner: CurrentUser) {
  const [row] = await tx
    .insert(dpsResearchRecords)
    .values({ ownerId: owner.id })
    .returning({ id: dpsResearchRecords.id });
  return row.id;
}
async function researchVersion(
  tx: Transaction,
  actors: Fixture,
  recordId: string,
  version: number,
  status: "DRAFT" | "PENDING" | "APPROVED",
  title: string,
  imageId?: string,
  buildVersionId: string | null = null,
) {
  const payload = dpsSaveSchema.parse({
    action: "DRAFT",
    payload: {
      title,
      summary: `Observed DPS ${title}`,
      composition: `composition-${title}`,
      gamePatch: `patch-${title}`,
      scenario: `scenario-${title}`,
      trance: `trance-${title}`,
      platform: `platform-${title}`,
      target: `target-${title}`,
      durationSeconds: 60,
      distanceMeters: 10,
      reloadPolicy: `reload-${title}`,
      hitPolicy: `hit-${title}`,
      buffPolicy: `buff-${title}`,
      procedure: `procedure-${title}`,
      measuredAt: "2026-10-09",
      trials: [{ dps: 100, note: `trial-${title}` }, { dps: 101 }, { dps: 99 }],
      evidenceText: `proof-${title}`,
      evidenceDocument: imageId ? documentWith(imageId) : null,
      youtubeUrl: imageId ? null : "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      buildVersionId,
    },
  }).payload;
  const [row] = await tx
    .insert(dpsResearchVersions)
    .values({
      recordId,
      version,
      payload,
      status: status === "APPROVED" ? "PENDING" : status,
      ...(status !== "DRAFT" ? { submittedAt: new Date() } : {}),
    })
    .returning({ id: dpsResearchVersions.id });
  await bindContentImages(
    tx,
    actors.owner.id,
    { researchVersionId: row.id },
    payload.evidenceDocument,
  );
  await tx
    .update(dpsResearchRecords)
    .set({ updatedAt: new Date() })
    .where(eq(dpsResearchRecords.id, recordId));
  await flushDeferredGuards(tx);
  if (status === "APPROVED")
    await tx
      .update(dpsResearchVersions)
      .set({
        status: "APPROVED",
        reviewerId: actors.admin.id,
        reviewedAt: new Date(),
        reviewNote: "증거 게시 승인",
        updatedAt: new Date(),
      })
      .where(eq(dpsResearchVersions.id, row.id));
  await flushDeferredGuards(tx);
  return row.id;
}
async function publish(tx: Transaction, recordId: string, versionId: string) {
  await tx
    .insert(dpsResearchPublications)
    .values({ recordId, versionId })
    .onConflictDoUpdate({
      target: dpsResearchPublications.recordId,
      set: { versionId, updatedAt: new Date() },
    });
  await flushDeferredGuards(tx);
}
async function results(actor: CurrentUser | null, q: string, page = "1") {
  boundary.actor = actor;
  const data = await getUnifiedSearch({ q, category: "research", page });
  expect(data.mode).not.toBe("DEMO");
  expect(data.mode).not.toBe("LIMITED");
  expect(data.groups.filter((group) => group.category === "research").length).toBeLessThanOrEqual(
    1,
  );
  return data.groups.flatMap((group) => group.items);
}

describe("DPS evidence images and actual search against PostgreSQL with full rollback", () => {
  it("paginates actual approved research without lost or duplicated records when examples are off", async () => {
    await withFixture(async (tx, actors) => {
      const marker = randomUUID();
      const expected = new Set<string>();
      for (let index = 0; index < 21; index++) {
        const recordId = await record(tx, actors.owner);
        const versionId = await researchVersion(
          tx,
          actors,
          recordId,
          1,
          "APPROVED",
          `${marker} DPS ${index}`,
        );
        await publish(tx, recordId, versionId);
        expected.add(`research:${recordId}`);
      }
      boundary.actor = null;
      const first = await getUnifiedSearch({ q: marker, category: "research" });
      const second = await getUnifiedSearch({ q: marker, category: "research", page: "2" });
      expect(first.mode).toBe("PUBLIC");
      expect(second.mode).toBe("PUBLIC");
      expect(first.groups).toHaveLength(1);
      expect(second.groups).toHaveLength(1);
      expect(first.groups[0].items).toHaveLength(20);
      expect(first.groups[0].hasMore).toBe(true);
      expect(second.groups[0].items).toHaveLength(1);
      expect(second.groups[0].hasMore).toBe(false);
      const ids = [...first.groups[0].items, ...second.groups[0].items].map((item) => item.id);
      expect(ids).toHaveLength(21);
      expect(new Set(ids)).toEqual(expected);
      expect(
        [...first.groups[0].items, ...second.groups[0].items].every(
          (item) => !item.href.includes("sample-"),
        ),
      ).toBe(true);
    });
  });
  it("binds private draft evidence only for its uploader and grants staff image access only after submission", async () => {
    await withFixture(async (tx, actors) => {
      const asset = await image(actors.owner, "red");
      const recordId = await record(tx, actors.owner);
      const draft = await researchVersion(
        tx,
        actors,
        recordId,
        1,
        "DRAFT",
        "DPS private draft",
        asset.id,
      );
      expect(
        await tx
          .select({ imageId: contentImageReferences.imageId })
          .from(contentImageReferences)
          .where(eq(contentImageReferences.researchVersionId, draft)),
      ).toEqual([{ imageId: asset.id }]);
      expect(await readContentImage(actors.owner, asset.id)).toBeInstanceOf(Buffer);
      for (const viewer of [null, actors.other, actors.officer, actors.admin])
        expect(await readContentImage(viewer, asset.id)).toBeNull();
      const anotherRecord = await record(tx, actors.other);
      const [anotherVersion] = await tx
        .insert(dpsResearchVersions)
        .values({
          recordId: anotherRecord,
          version: 1,
          payload: { title: "Another private record" },
        })
        .returning({ id: dpsResearchVersions.id });
      await expect(
        bindContentImages(
          tx,
          actors.other.id,
          { researchVersionId: anotherVersion.id },
          documentWith(asset.id),
        ),
      ).rejects.toThrow("등록 계정");
      await researchVersion(tx, actors, recordId, 2, "PENDING", "DPS submitted draft", asset.id);
      for (const viewer of [actors.officer, actors.admin])
        expect(await readContentImage(viewer, asset.id)).toBeInstanceOf(Buffer);
      for (const viewer of [null, actors.other])
        expect(await readContentImage(viewer, asset.id)).toBeNull();
      await tx.update(users).set({ role: "MEMBER" }).where(eq(users.id, actors.officer.id));
      expect(await readContentImage(actors.officer, asset.id)).toBeNull();
      expect(
        await readContentImage({ ...actors.admin, id: "demo-admin", isMock: true }, asset.id),
      ).toBeNull();
    });
  });

  it("keeps approved history images public but protects the next draft and closes access on withdrawal, hiding, archiving or author revocation", async () => {
    await withFixture(async (tx, actors) => {
      const oldImage = await image(actors.owner, "red");
      const draftImage = await image(actors.owner, "green");
      const nextImage = await image(actors.owner, "blue");
      const recordId = await record(tx, actors.owner);
      const first = await researchVersion(
        tx,
        actors,
        recordId,
        1,
        "APPROVED",
        "DPS approved first",
        oldImage.id,
      );
      await publish(tx, recordId, first);
      await researchVersion(
        tx,
        actors,
        recordId,
        2,
        "DRAFT",
        "DPS unpublished next",
        draftImage.id,
      );
      expect(await readContentImage(null, oldImage.id)).toBeInstanceOf(Buffer);
      boundary.actor = null;
      const response = await getImage(new Request("https://hive.example/api/content/image"), {
        params: Promise.resolve({ id: oldImage.id }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("Vary")).toBe("Cookie");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Content-Type")).toBe("image/webp");
      expect(
        (
          await getImage(new Request("https://hive.example/api/content/image"), {
            params: Promise.resolve({ id: draftImage.id }),
          })
        ).status,
      ).toBe(404);
      for (const viewer of [null, actors.other, actors.officer, actors.admin])
        expect(await readContentImage(viewer, draftImage.id)).toBeNull();
      const third = await researchVersion(
        tx,
        actors,
        recordId,
        3,
        "APPROVED",
        "DPS approved third",
        nextImage.id,
      );
      await publish(tx, recordId, third);
      expect(await readContentImage(null, oldImage.id)).toBeInstanceOf(Buffer);
      expect(await readContentImage(null, nextImage.id)).toBeInstanceOf(Buffer);
      await tx
        .update(dpsResearchVersions)
        .set({ status: "REVOKED", reviewNote: "게시 중단 검증" })
        .where(eq(dpsResearchVersions.id, first));
      await flushDeferredGuards(tx);
      expect(await readContentImage(null, oldImage.id)).toBeNull();
      expect(await readContentImage(null, nextImage.id)).toBeInstanceOf(Buffer);
      await tx
        .delete(dpsResearchPublications)
        .where(eq(dpsResearchPublications.recordId, recordId));
      expect(await readContentImage(null, oldImage.id)).toBeNull();
      await publish(tx, recordId, third);
      for (const field of ["hiddenAt", "archivedAt"] as const) {
        await tx
          .delete(dpsResearchPublications)
          .where(eq(dpsResearchPublications.recordId, recordId));
        await tx
          .update(dpsResearchRecords)
          .set({ [field]: new Date() })
          .where(eq(dpsResearchRecords.id, recordId));
        await flushDeferredGuards(tx);
        expect(await readContentImage(null, oldImage.id)).toBeNull();
        expect(await readContentImage(actors.other, nextImage.id)).toBeNull();
        await tx
          .update(dpsResearchRecords)
          .set({ [field]: null })
          .where(eq(dpsResearchRecords.id, recordId));
        await publish(tx, recordId, third);
      }
      await tx.update(users).set({ role: "APPLICANT" }).where(eq(users.id, actors.owner.id));
      await flushDeferredGuards(tx);
      expect(await readContentImage(null, nextImage.id)).toBeNull();
      expect(await readContentImage(actors.owner, oldImage.id)).toBeNull();
      await tx.update(users).set({ role: "MEMBER" }).where(eq(users.id, actors.owner.id));
      await tx.delete(accounts).where(eq(accounts.userId, actors.owner.id));
      await flushDeferredGuards(tx);
      expect(await readContentImage(null, nextImage.id)).toBeNull();
    });
  });

  it("requires a PUBLIC approved linked build for public evidence even when the research is approved", async () => {
    await withFixture(async (tx, actors) => {
      const [build] = await tx
        .insert(builds)
        .values({ ownerId: actors.owner.id, title: "DPS linked build", visibility: "PRIVATE" })
        .returning({ id: builds.id });
      const [buildVersion] = await tx
        .insert(buildVersions)
        .values({
          buildId: build.id,
          version: 1,
          schemaVersion: "uniz-gear.v2",
          loadoutSnapshot: createEmptyGearLoadout(),
        })
        .returning({ id: buildVersions.id });
      const asset = await image(actors.owner, "red");
      await expect(
        tx.transaction(async (savepoint) => {
          const invalidRecord = await record(savepoint, actors.owner);
          await researchVersion(
            savepoint,
            actors,
            invalidRecord,
            1,
            "PENDING",
            "DPS invalid private link",
            asset.id,
            buildVersion.id,
          );
        }),
      ).rejects.toMatchObject({ cause: { code: "23514" } });
      expect(await readContentImage(null, asset.id)).toBeNull();
      expect(await results(null, "DPS linked measurement")).toHaveLength(0);
      const [request] = await tx
        .insert(buildShareRequests)
        .values({
          buildId: build.id,
          buildVersionId: buildVersion.id,
          title: "DPS linked build",
          requestedVisibility: "PUBLIC",
          status: "APPROVED",
          reviewerId: actors.admin.id,
          reviewedAt: new Date(),
        })
        .returning({ id: buildShareRequests.id });
      await tx.insert(buildPublications).values({ buildId: build.id, requestId: request.id });
      const recordId = await record(tx, actors.owner);
      const research = await researchVersion(
        tx,
        actors,
        recordId,
        1,
        "APPROVED",
        "DPS linked measurement",
        asset.id,
        buildVersion.id,
      );
      await publish(tx, recordId, research);
      expect(await readContentImage(null, asset.id)).toBeInstanceOf(Buffer);
      expect(await results(null, "DPS linked measurement")).toHaveLength(1);
      const [hiveRequest] = await tx
        .insert(buildShareRequests)
        .values({
          buildId: build.id,
          buildVersionId: buildVersion.id,
          title: "DPS linked build",
          requestedVisibility: "HIVE",
          status: "APPROVED",
          reviewerId: actors.admin.id,
          reviewedAt: new Date(),
        })
        .returning({ id: buildShareRequests.id });
      await tx
        .update(buildPublications)
        .set({ requestId: hiveRequest.id })
        .where(eq(buildPublications.buildId, build.id));
      await flushDeferredGuards(tx);
      await researchVersion(
        tx,
        actors,
        recordId,
        2,
        "DRAFT",
        "DPS private correction after sharing stopped",
        asset.id,
        buildVersion.id,
      );
      expect(await readContentImage(null, asset.id)).toBeNull();
      expect(await readContentImage(actors.other, asset.id)).toBeNull();
      expect(await results(actors.other, "DPS linked measurement")).toHaveLength(0);
    });
  });

  it("searches only the approved snapshot or owner's newest version and downgrades reproduction labels when staff are demoted", async () => {
    await withFixture(async (tx, actors) => {
      const marker = randomUUID();
      const recordId = await record(tx, actors.owner);
      const first = await researchVersion(
        tx,
        actors,
        recordId,
        1,
        "APPROVED",
        `DPS-approved-${marker}`,
      );
      await publish(tx, recordId, first);
      await researchVersion(tx, actors, recordId, 2, "DRAFT", `private-canary-${marker}`);
      const pendingRecord = await record(tx, actors.owner);
      await researchVersion(tx, actors, pendingRecord, 1, "PENDING", `pending-canary-${marker}`);
      for (const viewer of [null, actors.other, actors.officer, actors.admin]) {
        const items = await results(viewer, marker);
        expect(items).toHaveLength(1);
        expect(items[0].title).toBe(`DPS-approved-${marker}`);
        expect(items[0].href).toBe(`/db/dps/${recordId}?version=1`);
        expect(JSON.stringify(items)).not.toContain("private-canary");
        expect(JSON.stringify(items)).not.toContain("pending-canary");
        expect(JSON.stringify(items)).not.toContain("private-dps-media-fixture-token");
      }
      expect((await results(actors.owner, marker)).map((item) => item.title).sort()).toEqual(
        [`pending-canary-${marker}`, `private-canary-${marker}`].sort(),
      );
      expect(await results(null, `proof-DPS-approved-${marker}`)).toHaveLength(1);
      for (const prefix of [
        "composition",
        "patch",
        "scenario",
        "trance",
        "platform",
        "target",
        "reload",
        "hit",
        "buff",
        "procedure",
        "trial",
      ])
        expect(
          (await results(null, `${prefix}-DPS-approved-${marker}`)).map((item) => item.href),
        ).toEqual([`/db/dps/${recordId}?version=1`]);
      for (const reviewer of [actors.admin, actors.officer])
        await tx.insert(dpsResearchVerifications).values({
          versionId: first,
          reviewerId: reviewer.id,
          confirmed: true,
          note: "같은 조건으로 재현 확인",
        });
      await flushDeferredGuards(tx);
      expect((await results(null, marker))[0].detail).toBe("게시 승인 · 재현 검토 완료");
      await tx.update(users).set({ role: "MEMBER" }).where(eq(users.id, actors.officer.id));
      await flushDeferredGuards(tx);
      expect((await results(null, marker))[0].detail).toBe("게시 승인 · 재현 미확인");
      await tx
        .delete(dpsResearchPublications)
        .where(eq(dpsResearchPublications.recordId, recordId));
      await tx
        .update(dpsResearchRecords)
        .set({ hiddenAt: new Date() })
        .where(eq(dpsResearchRecords.id, recordId));
      await flushDeferredGuards(tx);
      expect(await results(null, marker)).toHaveLength(0);
      await tx
        .update(dpsResearchRecords)
        .set({ hiddenAt: null, archivedAt: new Date() })
        .where(eq(dpsResearchRecords.id, recordId));
      await flushDeferredGuards(tx);
      expect(await results(actors.owner, `private-canary-${marker}`)).toHaveLength(0);
      await tx
        .update(dpsResearchRecords)
        .set({ archivedAt: null })
        .where(eq(dpsResearchRecords.id, recordId));
      await publish(tx, recordId, first);
      await tx.update(users).set({ role: "APPLICANT" }).where(eq(users.id, actors.owner.id));
      await flushDeferredGuards(tx);
      expect(await results(null, marker)).toHaveLength(0);
    });
  });
});
