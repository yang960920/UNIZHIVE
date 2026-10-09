import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CurrentAuthState, CurrentUser } from "../src/lib/auth-policy";
vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({
  tx: null as unknown,
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  guild: "MEMBER",
}));
vi.mock("../src/lib/auth", () => ({ getCurrentAuthState: async () => boundary.state }));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getSessionGuildEligibilityState: async () => ({ status: boundary.guild }),
}));
vi.mock("@uniz/db", async (original) => {
  const actual = await original<typeof import("@uniz/db")>();
  return { ...actual, getDb: () => boundary.tx ?? actual.getDb() };
});
import {
  accounts,
  auditLogs,
  buildPublications,
  builds,
  buildShareRequests,
  buildVersions,
  dpsResearchRecords,
  dpsResearchVersions,
  dpsResearchPublications,
  dpsResearchVerifications,
  eq,
  getDb,
  memberProfiles,
  sql,
  users,
} from "@uniz/db";
import {
  dpsSaveSchema,
  type DpsResearchDetail,
  type DpsResearchPayload,
} from "../src/lib/dps-research";
import {
  archiveDpsResearch,
  getDpsDetail,
  getDpsDirectory,
  getDpsEditorData,
  getDpsReviewDirectory,
  getMyDpsRecords,
  reviewDpsResearch,
  saveDpsResearch,
  verifyDpsResearch,
} from "../src/lib/server/dps-research-repository";
process.loadEnvFile(new URL("../../../.env", import.meta.url));
const target = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  target.pathname !== "/uniz_hive"
)
  throw Error("DPS verification requires the local uniz_hive database.");
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Actors = {
  owner: CurrentUser;
  other: CurrentUser;
  officer: CurrentUser;
  secondOfficer: CurrentUser;
  admin: CurrentUser;
  applicant: CurrentUser;
};
class FixtureRollback extends Error {}
function authenticate(actor: CurrentUser | null) {
  boundary.state = actor
    ? { user: actor, status: "AUTHENTICATED" }
    : { user: null, status: "GUEST" };
}
async function flush(tx: Transaction) {
  await tx.execute(sql`set constraints all immediate`);
  await tx.execute(sql`set constraints all deferred`);
}
async function fixture(check: (tx: Transaction, f: Actors) => Promise<void>) {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  const f = Object.fromEntries(
    [
      ["owner", "MEMBER"],
      ["other", "MEMBER"],
      ["officer", "OFFICER"],
      ["secondOfficer", "OFFICER"],
      ["admin", "ADMIN"],
      ["applicant", "APPLICANT"],
    ].map(([name, role]) => [name, { id: randomUUID(), name: `DPS ${name}`, role, isMock: false }]),
  ) as Actors;
  try {
    await actual.getDb().transaction(async (tx) => {
      boundary.tx = tx;
      boundary.guild = "MEMBER";
      for (const actor of Object.values(f)) {
        await tx.insert(users).values({ id: actor.id, name: actor.name, role: actor.role });
        await tx.insert(accounts).values({
          userId: actor.id,
          provider: "discord",
          providerAccountId: `dps-${actor.id}`,
          access_token: "private-dps-token",
        });
        await tx.insert(memberProfiles).values({
          userId: actor.id,
          handle: `dps_${actor.id.replaceAll("-", "").slice(0, 16)}`,
          displayName: actor.name,
          onceHumanNickname: "테스트",
          onceHumanUid: "private-dps-uid",
        });
      }
      authenticate(f.owner);
      await check(tx, f);
      await flush(tx);
      throw new FixtureRollback();
    });
  } catch (error) {
    if (!(error instanceof FixtureRollback)) throw error;
  } finally {
    boundary.tx = null;
    boundary.guild = "MEMBER";
    authenticate(null);
  }
  for (const actor of Object.values(f)) {
    expect(
      await actual.getDb().select({ id: users.id }).from(users).where(eq(users.id, actor.id)),
    ).toEqual([]);
    expect(
      await actual
        .getDb()
        .select({ id: dpsResearchRecords.id })
        .from(dpsResearchRecords)
        .where(eq(dpsResearchRecords.ownerId, actor.id)),
    ).toEqual([]);
  }
}
function p(title = `DPS-${randomUUID()}`): DpsResearchPayload {
  return dpsSaveSchema.parse({
    action: "DRAFT",
    payload: {
      title,
      summary: "직접 기록한 관찰값",
      composition: "고정 장비 구성",
      gamePatch: "fixture-patch",
      scenario: "fixture-scenario",
      platform: "PC",
      target: "훈련 대상",
      durationSeconds: 30,
      distanceMeters: 10,
      reloadPolicy: "재장전 포함",
      hitPolicy: "몸통",
      buffPolicy: "외부 버프 없음",
      procedure: "첫 명중부터 30초",
      measuredAt: "2026-10-01",
      trials: [{ dps: 100, note: "관찰값" }],
      youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
    },
  }).payload;
}
async function current(id: string, version?: number): Promise<DpsResearchDetail> {
  const result = await getDpsDetail(id, version);
  if (!result) throw Error("Missing authorized DPS detail");
  return result;
}
async function decide(
  tx: Transaction,
  f: Actors,
  versionId: string,
  action: "APPROVE" | "CHANGES_REQUESTED" | "REJECT" | "REVOKE",
  note = "검토 사유",
) {
  authenticate(f.admin);
  const [version] = await tx
    .select({ updatedAt: dpsResearchVersions.updatedAt })
    .from(dpsResearchVersions)
    .where(eq(dpsResearchVersions.id, versionId));
  await reviewDpsResearch({
    versionId,
    expectedUpdatedAt: version.updatedAt.toISOString(),
    action,
    note,
  });
  await flush(tx);
}
async function publicBuild(tx: Transaction, f: Actors) {
  const [build] = await tx
    .insert(builds)
    .values({ ownerId: f.owner.id, title: "공유 초안", visibility: "PRIVATE" })
    .returning();
  const [version] = await tx
    .insert(buildVersions)
    .values({
      buildId: build.id,
      version: 1,
      schemaVersion: "uniz-gear.v2",
      loadoutSnapshot: {},
      title: "고정 승인 제목",
    })
    .returning();
  const [request] = await tx
    .insert(buildShareRequests)
    .values({
      buildId: build.id,
      buildVersionId: version.id,
      title: "공개 승인 제목",
      requestedVisibility: "PUBLIC",
      status: "APPROVED",
      reviewerId: f.admin.id,
      reviewedAt: new Date(),
    })
    .returning();
  await tx.insert(buildPublications).values({ buildId: build.id, requestId: request.id });
  return { build, version };
}

describe("DPS research permissions, snapshots and publication against local PostgreSQL", () => {
  it("paginates public records nine at a time and keeps a newer publication when an older version is revoked", async () => {
    await fixture(async (tx, f) => {
      const prefix = `페이지-${randomUUID()}`;
      const saved = [];
      for (let index = 0; index < 10; index++) {
        authenticate(f.owner);
        const record = await saveDpsResearch({
          action: "SUBMIT",
          payload: p(`${prefix}-${index}`),
        });
        saved.push(record);
        await decide(tx, f, record.versionId, "APPROVE");
      }
      authenticate(null);
      const first = await getDpsDirectory({ q: prefix });
      const second = await getDpsDirectory({ q: prefix, page: 2 });
      expect(first.items).toHaveLength(9);
      expect(first.hasNext).toBe(true);
      expect(second.items).toHaveLength(1);
      expect(second.hasNext).toBe(false);
      expect(new Set([...first.items, ...second.items].map((record) => record.id)).size).toBe(10);
      authenticate(f.owner);
      const initial = await current(saved[0].id);
      const next = await saveDpsResearch({
        id: saved[0].id,
        expectedUpdatedAt: initial.recordUpdatedAt,
        action: "SUBMIT",
        payload: { ...initial.payload, title: `${prefix}-수정` },
      });
      await decide(tx, f, next.versionId, "APPROVE");
      authenticate(null);
      expect((await current(saved[0].id, 1)).versionId).toBe(saved[0].versionId);
      await decide(tx, f, saved[0].versionId, "REVOKE");
      authenticate(null);
      expect((await current(saved[0].id)).versionId).toBe(next.versionId);
      expect(await getDpsDetail(saved[0].id, 1)).toBeNull();
    });
  });
  it("keeps drafts private, exposes submitted versions to staff and cancels an old pending request on a new draft", async () => {
    await fixture(async (tx, f) => {
      const draft = await saveDpsResearch({ action: "DRAFT", payload: p() });
      expect((await getMyDpsRecords()).items[0].versionId).toBe(draft.versionId);
      for (const viewer of [null, f.other, f.officer, f.admin]) {
        authenticate(viewer);
        expect(await getDpsDetail(draft.id)).toBeNull();
      }
      authenticate(f.other);
      await expect(getDpsEditorData(draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
      authenticate(f.owner);
      const initial = await current(draft.id);
      const submitted = await saveDpsResearch({
        id: draft.id,
        expectedUpdatedAt: initial.recordUpdatedAt,
        action: "SUBMIT",
        payload: initial.payload,
      });
      authenticate(f.officer);
      expect((await current(draft.id, submitted.version)).status).toBe("PENDING");
      expect(await getDpsDetail(draft.id, 1)).toBeNull();
      expect(
        (await getDpsReviewDirectory()).items.some((row) => row.versionId === submitted.versionId),
      ).toBe(true);
      authenticate(null);
      expect(await getDpsDetail(draft.id)).toBeNull();
      expect((await getDpsDirectory()).items.some((row) => row.id === draft.id)).toBe(false);
      authenticate(f.owner);
      const latest = await current(draft.id);
      await saveDpsResearch({
        id: draft.id,
        expectedUpdatedAt: latest.recordUpdatedAt,
        action: "DRAFT",
        payload: latest.payload,
      });
      const [cancelled] = await tx
        .select({ status: dpsResearchVersions.status })
        .from(dpsResearchVersions)
        .where(eq(dpsResearchVersions.id, submitted.versionId));
      expect(cancelled.status).toBe("CANCELLED");
    });
  });
  it("publishes one observed trial without a verified label and retains the approved snapshot while newer drafts are private", async () => {
    await fixture(async (tx, f) => {
      const publicTitle = `게시본-${randomUUID()}`;
      const saved = await saveDpsResearch({ action: "SUBMIT", payload: p(publicTitle) });
      await decide(tx, f, saved.versionId, "APPROVE");
      authenticate(null);
      const published = await current(saved.id);
      expect(published.status).toBe("APPROVED");
      expect(published.verified).toBe(false);
      expect(published.payload.trials).toHaveLength(1);
      expect(JSON.stringify(published)).not.toMatch(
        /private-dps-(uid|token)|access_token|onceHumanUid/,
      );
      authenticate(f.owner);
      const old = await current(saved.id);
      const draftTitle = `비공개수정-${randomUUID()}`;
      const next = await saveDpsResearch({
        id: saved.id,
        expectedUpdatedAt: old.recordUpdatedAt,
        action: "DRAFT",
        payload: { ...old.payload, title: draftTitle },
      });
      authenticate(null);
      expect((await current(saved.id)).payload.title).toBe(publicTitle);
      expect(await getDpsDetail(saved.id, next.version)).toBeNull();
      expect((await getDpsDirectory({ q: draftTitle })).items).toEqual([]);
      expect((await getDpsDirectory({ q: publicTitle })).items[0].versionId).toBe(saved.versionId);
      authenticate(f.admin);
      expect(await getDpsDetail(saved.id, next.version)).toBeNull();
      authenticate(f.owner);
      const latest = await current(saved.id);
      await archiveDpsResearch({ id: saved.id, expectedUpdatedAt: latest.recordUpdatedAt });
      authenticate(null);
      expect(await getDpsDetail(saved.id)).toBeNull();
      expect(await getDpsDetail(saved.id, 1)).toBeNull();
    });
  });
  it("supports feedback and resubmission while rejecting stale updates rather than overwriting newer versions", async () => {
    await fixture(async (tx, f) => {
      const saved = await saveDpsResearch({ action: "SUBMIT", payload: p() });
      await decide(tx, f, saved.versionId, "CHANGES_REQUESTED", "거리를 다시 확인해 주세요");
      authenticate(f.owner);
      const feedback = await current(saved.id);
      expect(feedback.status).toBe("CHANGES_REQUESTED");
      expect(feedback.reviewNote).toContain("거리");
      const resubmitted = await saveDpsResearch({
        id: saved.id,
        expectedUpdatedAt: feedback.recordUpdatedAt,
        action: "SUBMIT",
        payload: feedback.payload,
      });
      await decide(tx, f, resubmitted.versionId, "REJECT");
      authenticate(f.owner);
      const rejected = await current(saved.id);
      const next = await saveDpsResearch({
        id: saved.id,
        expectedUpdatedAt: rejected.recordUpdatedAt,
        action: "DRAFT",
        payload: rejected.payload,
      });
      await expect(
        saveDpsResearch({
          id: saved.id,
          expectedUpdatedAt: rejected.recordUpdatedAt,
          action: "DRAFT",
          payload: rejected.payload,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await current(saved.id)).versionId).toBe(next.versionId);
      expect((await current(saved.id)).versions).toHaveLength(3);
      const pending = await saveDpsResearch({
        id: saved.id,
        expectedUpdatedAt: (await current(saved.id)).recordUpdatedAt,
        action: "SUBMIT",
        payload: rejected.payload,
      });
      const oldStamp = (await current(saved.id)).updatedAt;
      await decide(tx, f, pending.versionId, "APPROVE");
      await expect(
        reviewDpsResearch({
          versionId: pending.versionId,
          expectedUpdatedAt: oldStamp,
          action: "REJECT",
          note: "오래된 요청",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });
  it("requires two distinct current staff reviewers and drops a verification label after reviewer demotion", async () => {
    await fixture(async (tx, f) => {
      const input = p();
      input.trials = [
        { dps: 100, note: "1회" },
        { dps: 110, note: "2회" },
        { dps: 90, note: "3회" },
      ];
      const saved = await saveDpsResearch({ action: "SUBMIT", payload: input });
      await decide(tx, f, saved.versionId, "APPROVE");
      for (const officer of [f.officer, f.secondOfficer]) {
        authenticate(officer);
        const data = await current(saved.id);
        await verifyDpsResearch({
          versionId: saved.versionId,
          expectedUpdatedAt: data.updatedAt,
          confirmed: true,
          note: "원본과 반복 결과 확인",
        });
      }
      authenticate(null);
      expect((await current(saved.id)).verified).toBe(true);
      expect((await current(saved.id)).verificationCount).toBe(2);
      await flush(tx);
      await tx.update(users).set({ role: "MEMBER" }).where(eq(users.id, f.officer.id));
      authenticate(null);
      expect((await current(saved.id)).verified).toBe(false);
      expect((await current(saved.id)).verificationCount).toBe(1);
      authenticate(f.officer);
      await expect(
        verifyDpsResearch({
          versionId: saved.versionId,
          expectedUpdatedAt: (await current(saved.id)).updatedAt,
          confirmed: true,
          note: "이전 역할 요청",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(
        await tx
          .select()
          .from(dpsResearchVerifications)
          .where(eq(dpsResearchVerifications.versionId, saved.versionId)),
      ).toHaveLength(2);
    });
  });
  it("rechecks linked PUBLIC builds at submission and preserves atomicity when a private reference is rejected", async () => {
    await fixture(async (tx, f) => {
      const [build] = await tx
        .insert(builds)
        .values({ ownerId: f.owner.id, title: "내 비공개 빌드" })
        .returning();
      const [version] = await tx
        .insert(buildVersions)
        .values({
          buildId: build.id,
          version: 1,
          schemaVersion: "uniz-gear.v2",
          loadoutSnapshot: {},
        })
        .returning();
      const input = { ...p(), buildVersionId: version.id };
      const draft = await saveDpsResearch({ action: "DRAFT", payload: input });
      const before = await current(draft.id);
      const oldAudit = await tx
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(eq(auditLogs.entityId, draft.id));
      await expect(
        saveDpsResearch({
          id: draft.id,
          expectedUpdatedAt: before.recordUpdatedAt,
          action: "SUBMIT",
          payload: input,
        }),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect((await current(draft.id)).versionId).toBe(draft.versionId);
      expect(
        await tx
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(eq(auditLogs.entityId, draft.id)),
      ).toHaveLength(oldAudit.length);
    });
  });
  it("permits corrections and feedback after an externally linked build stops sharing", async () => {
    await fixture(async (tx, f) => {
      const linked = await publicBuild(tx, f);
      expect(
        (await getDpsEditorData()).buildVersions.find((entry) => entry.id === linked.version.id)
          ?.visibility,
      ).toBe("PUBLIC");
      const saved = await saveDpsResearch({
        action: "SUBMIT",
        payload: { ...p(), buildVersionId: linked.version.id },
      });
      await decide(tx, f, saved.versionId, "APPROVE");
      await flush(tx);
      await tx.delete(buildPublications).where(eq(buildPublications.buildId, linked.build.id));
      authenticate(null);
      expect(await getDpsDetail(saved.id)).toBeNull();
      authenticate(f.owner);
      const old = await current(saved.id);
      const correction = { ...old.payload, buildVersionId: null, composition: "수정된 장비 구성" };
      const draft = await saveDpsResearch({
        id: saved.id,
        expectedUpdatedAt: old.recordUpdatedAt,
        action: "DRAFT",
        payload: correction,
      });
      await flush(tx);
      expect((await current(saved.id)).versionId).toBe(draft.versionId);
      let data = await current(saved.id);
      let pending = await saveDpsResearch({
        id: saved.id,
        expectedUpdatedAt: data.recordUpdatedAt,
        action: "SUBMIT",
        payload: correction,
      });
      await decide(tx, f, pending.versionId, "CHANGES_REQUESTED");
      await flush(tx);
      authenticate(f.owner);
      data = await current(saved.id);
      pending = await saveDpsResearch({
        id: saved.id,
        expectedUpdatedAt: data.recordUpdatedAt,
        action: "SUBMIT",
        payload: correction,
      });
      await decide(tx, f, pending.versionId, "REJECT");
      await flush(tx);
      authenticate(f.owner);
      data = await current(saved.id);
      pending = await saveDpsResearch({
        id: saved.id,
        expectedUpdatedAt: data.recordUpdatedAt,
        action: "SUBMIT",
        payload: correction,
      });
      await decide(tx, f, pending.versionId, "APPROVE");
      authenticate(null);
      expect((await current(saved.id)).versionId).toBe(pending.versionId);
    });
  });
  it("enforces snapshot, pending, publication, proof and reviewer guards at the database boundary", async () => {
    await fixture(async (tx, f) => {
      const saved = await saveDpsResearch({ action: "SUBMIT", payload: p() });
      await flush(tx);
      await expect(
        tx.transaction(async (t) => {
          await t
            .update(dpsResearchVersions)
            .set({ payload: p("변조된 제목") })
            .where(eq(dpsResearchVersions.id, saved.versionId));
        }),
      ).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(
        tx.transaction(async (t) => {
          await t.insert(dpsResearchVersions).values({
            recordId: saved.id,
            version: 2,
            status: "PENDING",
            submittedAt: new Date(),
            payload: p(),
          });
        }),
      ).rejects.toMatchObject({ cause: { code: "23505" } });
      await expect(
        tx.transaction(async (t) => {
          await t
            .insert(dpsResearchPublications)
            .values({ recordId: saved.id, versionId: saved.versionId });
          await t.execute(sql`set constraints all immediate`);
        }),
      ).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(
        tx.transaction(async (t) => {
          await t
            .update(dpsResearchVersions)
            .set({ status: "APPROVED", reviewerId: f.other.id, reviewedAt: new Date() })
            .where(eq(dpsResearchVersions.id, saved.versionId));
        }),
      ).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(
        tx.transaction(async (t) => {
          const [record] = await t
            .insert(dpsResearchRecords)
            .values({ ownerId: f.owner.id })
            .returning();
          await t.insert(dpsResearchVersions).values({
            recordId: record.id,
            version: 1,
            status: "PENDING",
            submittedAt: new Date(),
            payload: { ...p(), youtubeUrl: null },
          });
          await t.execute(sql`set constraints all immediate`);
        }),
      ).rejects.toMatchObject({ cause: { code: "23514" } });
      await decide(tx, f, saved.versionId, "APPROVE");
      await flush(tx);
      await expect(
        tx.transaction(async (t) => {
          await t.insert(dpsResearchVerifications).values({
            versionId: saved.versionId,
            reviewerId: f.owner.id,
            confirmed: true,
            note: "자기 검증",
          });
        }),
      ).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(
        tx.transaction(async (t) => {
          await t.insert(dpsResearchVerifications).values({
            versionId: saved.versionId,
            reviewerId: f.other.id,
            confirmed: true,
            note: "일반 회원 검증",
          });
        }),
      ).rejects.toMatchObject({ cause: { code: "23514" } });
    });
  });
  it("allows administrator publication of their own record but rejects self verification, fresh role loss and future submissions", async () => {
    await fixture(async (tx, f) => {
      authenticate(f.admin);
      const saved = await saveDpsResearch({ action: "SUBMIT", payload: p() });
      await decide(tx, f, saved.versionId, "APPROVE");
      const approved = await current(saved.id);
      expect(approved.canReview).toBe(true);
      expect(approved.canVerify).toBe(false);
      await expect(
        verifyDpsResearch({
          versionId: saved.versionId,
          expectedUpdatedAt: approved.updatedAt,
          confirmed: true,
          note: "자기 검증",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await flush(tx);
      await tx.update(users).set({ role: "MEMBER" }).where(eq(users.id, f.admin.id));
      await expect(
        reviewDpsResearch({
          versionId: saved.versionId,
          expectedUpdatedAt: approved.updatedAt,
          action: "REVOKE",
          note: "이전 관리자 역할",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      authenticate(f.owner);
      await expect(
        saveDpsResearch({ action: "SUBMIT", payload: { ...p(), measuredAt: "2999-01-01" } }),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
      authenticate(f.applicant);
      await expect(saveDpsResearch({ action: "DRAFT", payload: p() })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      authenticate(f.owner);
      boundary.guild = "UNAVAILABLE";
      await expect(saveDpsResearch({ action: "DRAFT", payload: p() })).rejects.toMatchObject({
        code: "UNAVAILABLE",
      });
    });
  });
});
