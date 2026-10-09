import { describe, expect, it } from "vitest";
import {
  knownDefinition,
  makeCleanupPlan,
  SAMPLE_BATCH,
} from "../scripts/cleanup-sample-content.mjs";

const definition = knownDefinition();
const now = new Date("2026-10-09T06:00:00.000Z");
function fixture() {
  const actor = { id: "synthetic-admin", role: "ADMIN", discord_valid: true };
  const rows = {
    build: [] as Record<string, unknown>[],
    community_post: [] as Record<string, unknown>[],
    operation: [] as Record<string, unknown>[],
  };
  const seedAudits: Record<string, unknown>[] = [];
  for (const [index, item] of definition.entries()) {
    rows[item.kind as keyof typeof rows].push({
      id: item.id,
      title: item.title,
      archived_at: null,
      ...(item.kind === "build"
        ? { owner_id: actor.id }
        : item.kind === "community_post"
          ? { author_id: actor.id, category: "GENERAL", build_version_id: null }
          : {
              created_by_id: actor.id,
              status: "SCHEDULED",
              starts_at: new Date(now.getTime() + (index + 1) * 3600000),
            }),
    });
    seedAudits.push({
      actor_id: actor.id,
      entity_type: item.kind,
      entity_id: item.id,
      metadata: { source: "LOCAL_SAMPLE_CONTENT", batch: SAMPLE_BATCH, sampleKey: item.key },
    });
  }
  return {
    actor,
    rows,
    seedAudits,
    versionLinks: [] as { id: string; build_id: string }[],
    postInteractions: rows.community_post.map((row) => ({ id: row.id, interactions: 0 })),
    partyDependencies: rows.operation.map((row) => ({ id: row.id, participants: 0, roles: 0 })),
  };
}

describe("bounded sample cleanup planning", () => {
  it("uses exactly the original 75 provenance-checked sample IDs and no actual showcase IDs", () => {
    expect(definition).toHaveLength(75);
    expect(definition.some((row) => row.id === "c26a7148-7948-477a-b76c-76737217b0e6")).toBe(false);
    const snapshot = fixture();
    const plan = makeCleanupPlan(snapshot, definition, now);
    expect(plan.archive.build).toHaveLength(9);
    expect(plan.archive.community_post).toHaveLength(24);
    expect(plan.deletePartyIds).toHaveLength(39);
    expect(plan).not.toHaveProperty("actorId");
    expect(plan).not.toHaveProperty("rows");
  });
  it("retains the example with existing interactions and its linked build together", () => {
    const snapshot = fixture();
    const post = snapshot.rows.community_post[4];
    const build = snapshot.rows.build[2];
    snapshot.postInteractions[4].interactions = 1;
    post.build_version_id = "existing-version";
    snapshot.versionLinks.push({ id: "existing-version", build_id: String(build.id) });
    const plan = makeCleanupPlan(snapshot, definition, now);
    expect(plan.keep.community_post).toBe(post.id);
    expect(plan.keep.build).toBe(build.id);
    expect(plan.archive.community_post).not.toContain(post.id);
    expect(plan.archive.build).not.toContain(build.id);
  });
  it("retains the nearest future party and never reschedules an old sample", () => {
    const snapshot = fixture();
    snapshot.rows.operation[0].starts_at = new Date(now.getTime() - 1);
    snapshot.rows.operation[1].starts_at = new Date(now.getTime() + 1);
    expect(makeCleanupPlan(snapshot, definition, now).keep.operation).toBe(
      snapshot.rows.operation[1].id,
    );
    for (const party of snapshot.rows.operation) party.starts_at = new Date(now.getTime() - 1);
    expect(() => makeCleanupPlan(snapshot, definition, now)).toThrow("upcoming");
  });
  it("rejects a title-only, altered, unknown or duplicated provenance claim", () => {
    for (const mutate of [
      (snapshot: ReturnType<typeof fixture>) => {
        snapshot.rows.build[0].title = "[예시] 실제 사용자 글";
      },
      (snapshot: ReturnType<typeof fixture>) => {
        snapshot.rows.build[0].id = "unknown-example-id";
      },
      (snapshot: ReturnType<typeof fixture>) => {
        snapshot.seedAudits.splice(0, 1);
      },
      (snapshot: ReturnType<typeof fixture>) => {
        snapshot.seedAudits.push(snapshot.seedAudits[0]);
      },
      (snapshot: ReturnType<typeof fixture>) => {
        snapshot.seedAudits[0].actor_id = "another-author";
      },
    ]) {
      const snapshot = fixture();
      mutate(snapshot);
      expect(() => makeCleanupPlan(snapshot, definition, now)).toThrow();
    }
  });
  it("requires the current connected administrator and preserves newly changed sample states", () => {
    for (const mutate of [
      (snapshot: ReturnType<typeof fixture>) => {
        snapshot.actor.role = "MEMBER";
      },
      (snapshot: ReturnType<typeof fixture>) => {
        snapshot.actor.discord_valid = false;
      },
      (snapshot: ReturnType<typeof fixture>) => {
        snapshot.rows.build[0].archived_at = new Date();
      },
      (snapshot: ReturnType<typeof fixture>) => {
        snapshot.rows.operation[0].status = "CANCELLED";
      },
      (snapshot: ReturnType<typeof fixture>) => {
        snapshot.rows.community_post[0].category = "SHOWCASE";
      },
    ]) {
      const snapshot = fixture();
      mutate(snapshot);
      expect(() => makeCleanupPlan(snapshot, definition, now)).toThrow();
    }
  });
  it("refuses deleting parties with any participant, role or missing dependency information", () => {
    for (const mutate of [
      (snapshot: ReturnType<typeof fixture>) => {
        snapshot.partyDependencies.at(-1)!.participants = 1;
      },
      (snapshot: ReturnType<typeof fixture>) => {
        snapshot.partyDependencies.at(-1)!.roles = 1;
      },
      (snapshot: ReturnType<typeof fixture>) => {
        snapshot.partyDependencies.pop();
      },
    ]) {
      const snapshot = fixture();
      mutate(snapshot);
      expect(() => makeCleanupPlan(snapshot, definition, now)).toThrow("party");
    }
  });
});
