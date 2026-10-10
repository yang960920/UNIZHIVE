import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MAX_LOADOUT_BUILDS, parseBuildLoadoutMutation } from "../src/lib/build-loadout-policy";
import { BuildPlannerError } from "../src/lib/build-planner-policy";

const input = () => ({
  action: "SAVE_LOADOUT",
  title: "보스와 파밍",
  notes: "",
  buildVersionIds: [randomUUID(), randomUUID()],
});
describe("loadout mutation boundary", () => {
  it("records ordered pinned version identities and trims authored text", () => {
    const value = input();
    const result = parseBuildLoadoutMutation({
      ...value,
      title: "  보스와 파밍  ",
      notes: " 메모 ",
    });
    expect(result).toMatchObject({
      title: "보스와 파밍",
      notes: "메모",
      buildVersionIds: value.buildVersionIds,
    });
  });
  it.each([
    ["one build", () => ({ ...input(), buildVersionIds: [randomUUID()] })],
    [
      "duplicate version",
      () => {
        const id = randomUUID();
        return { ...input(), buildVersionIds: [id, id] };
      },
    ],
    [
      "too many",
      () => ({
        ...input(),
        buildVersionIds: Array.from({ length: MAX_LOADOUT_BUILDS + 1 }, randomUUID),
      }),
    ],
    ["foreign identity field", () => ({ ...input(), ownerId: randomUUID() })],
    ["forged snapshot", () => ({ ...input(), loadout: {} })],
    ["missing update lock", () => ({ ...input(), loadoutId: randomUUID() })],
    ["orphan update lock", () => ({ ...input(), expectedUpdatedAt: new Date().toISOString() })],
    ["short title", () => ({ ...input(), title: "짧" })],
    ["long note", () => ({ ...input(), notes: "x".repeat(2001) })],
  ])("rejects %s", (_label, make) =>
    expect(() => parseBuildLoadoutMutation(make())).toThrow(BuildPlannerError),
  );
  it("accepts the bounded maximum without imposing a limit on the user's library", () => {
    expect(
      parseBuildLoadoutMutation({
        ...input(),
        buildVersionIds: Array.from({ length: MAX_LOADOUT_BUILDS }, randomUUID),
      }),
    ).toMatchObject({ buildVersionIds: expect.arrayContaining([]) });
  });
  it("requires the optimistic lock for archive and restore", () => {
    for (const action of ["ARCHIVE_LOADOUT", "RESTORE_LOADOUT"]) {
      const mutation = {
        action,
        loadoutId: randomUUID(),
        expectedUpdatedAt: new Date().toISOString(),
      };
      expect(parseBuildLoadoutMutation(mutation)).toEqual(mutation);
      expect(() => parseBuildLoadoutMutation({ action, loadoutId: mutation.loadoutId })).toThrow(
        BuildPlannerError,
      );
    }
  });
});
