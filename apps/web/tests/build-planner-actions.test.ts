import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyPlannerLoadout,
  createEmptyGearLoadout,
  createGearSelection,
} from "@uniz/build-engine";
import type { CurrentAuthState } from "../src/lib/auth-policy";

const boundary = vi.hoisted(() => ({
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  persist: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidate }));
vi.mock("@/lib/auth", () => ({ getCurrentAuthState: async () => boundary.state }));
vi.mock("@/lib/server/build-planner", () => ({ persistBuildMutation: boundary.persist }));
vi.mock("@/lib/build-planner-policy", () => import("../src/lib/build-planner-policy"));

import {
  archiveBuildPlanner,
  restoreBuildPlanner,
  saveBuildPlanner,
  setBuildPlannerVisibility,
} from "../src/app/lab/actions";
import { BuildPlannerError, parseBuildPlannerMutation } from "../src/lib/build-planner-policy";

const actor = {
  id: "09921650-599e-45f0-86ab-27f7c31c2f84",
  name: "Action test member",
  role: "MEMBER" as const,
  isMock: false,
};
const buildId = "f13078a8-6ca6-4c99-9e32-366f25f7dcea";
const expectedUpdatedAt = "2026-10-07T00:00:00.000Z";
const initial = { ok: false, message: "" };

function saveForm(edit = false) {
  const form = new FormData();
  form.set("title", "내 빌드");
  form.set("description", "직접 확인한 구성");
  form.set("visibility", "PRIVATE");
  form.set("notes", "첫 기록");
  form.set("loadout", JSON.stringify(createEmptyPlannerLoadout()));
  if (edit) {
    form.set("buildId", buildId);
    form.set("expectedUpdatedAt", expectedUpdatedAt);
  }
  return form;
}

function metadataForm() {
  const form = new FormData();
  form.set("buildId", buildId);
  form.set("expectedUpdatedAt", expectedUpdatedAt);
  form.set("visibility", "HIVE");
  return form;
}

beforeEach(() => {
  boundary.state = { user: actor, status: "AUTHENTICATED" };
  boundary.persist.mockReset().mockImplementation(async (_actor, value) => {
    const input = parseBuildPlannerMutation(value);
    return { id: buildId, ...(input.action === "SAVE_BUILD" ? { version: 1 } : {}) };
  });
  boundary.revalidate.mockReset();
});

describe("planner save form boundary", () => {
  it("round-trips V2 Korean gear, suffix and recommendations through the actual FormData action", async () => {
    const loadout = createEmptyGearLoadout();
    const weapon = createGearSelection("primary", "weapon-p90-holographic-resonance");
    weapon.attachments.module = "module-icebreaker";
    weapon.attachments.moduleSuffix = "module-suffix-ability";
    weapon.attachments.moduleLevel = 13;
    loadout.slots.push(weapon);
    loadout.recommendation = { rating: 4, contents: ["보스"], tags: ["약점"], notes: "파티용" };
    const form = saveForm(true);
    form.set("loadout", JSON.stringify(loadout));
    const result = await saveBuildPlanner(initial, form);
    expect(result).toMatchObject({ ok: true, href: `/lab/b/${buildId}?version=1` });
    const input = parseBuildPlannerMutation(boundary.persist.mock.calls[0][1]);
    if (input.action !== "SAVE_BUILD" || input.loadout.schemaVersion !== "uniz-gear.v2")
      throw new Error("Expected gear save");
    expect(input.loadout.slots[0].attachments.moduleLevel).toBe(13);
    expect(input.loadout.catalogNames?.["module-icebreaker"]).toBe("쇄빙");
    expect(input.loadout.recommendation).toEqual(loadout.recommendation);
    expect(boundary.persist.mock.calls[0][0]).toBe(actor);
  });
  it.each([false, true])(
    "forwards a valid %s edit flag with the server actor and fixed version link",
    async (edit) => {
      const form = saveForm(edit);
      form.set("ownerId", "forged-owner");
      form.set("role", "ADMIN");
      const result = await saveBuildPlanner(initial, form);
      expect(boundary.persist).toHaveBeenCalledExactlyOnceWith(actor, {
        action: "SAVE_BUILD",
        ...(edit ? { buildId, expectedUpdatedAt } : {}),
        title: "내 빌드",
        description: "직접 확인한 구성",
        visibility: "PRIVATE",
        notes: "첫 기록",
        loadout: createEmptyPlannerLoadout(),
        bodyDocument: null,
        youtubeUrl: null,
      });
      expect(result).toEqual({
        ok: true,
        message: "v1으로 저장했습니다.",
        href: `/lab/b/${buildId}?version=1`,
        version: 1,
      });
      expect(boundary.revalidate.mock.calls).toEqual([
        ["/lab"],
        ["/lab/new"],
        ["/lab/b/[id]", "page"],
        ["/lab/b/[id]/edit", "page"],
        ["/"],
        ["/admin/builds"],
      ]);
    },
  );
  it("forwards rich content and reports shared saving as an approval request", async () => {
    boundary.persist.mockResolvedValueOnce({ id: buildId, version: 2, reviewRequested: true });
    const form = saveForm(true);
    const document = JSON.stringify({
      schemaVersion: "uniz-content.v1",
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Shared content" }] }],
    });
    form.set("bodyDocument", document);
    form.set("youtubeUrl", "https://youtu.be/dQw4w9WgXcQ");
    form.set("visibility", "PUBLIC");
    const result = await saveBuildPlanner(initial, form);
    expect(boundary.persist.mock.calls[0][1]).toMatchObject({
      bodyDocument: document,
      youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
      visibility: "PUBLIC",
    });
    expect(result).toMatchObject({
      ok: true,
      message: "v2을 저장하고 관리자에게 공유 승인을 요청했습니다.",
    });
  });
  it("blocks unfinished media without writing or losing the submitted document", async () => {
    const form = saveForm();
    form.set("bodyDocument", "draft-document");
    form.set("contentMediaReady", "false");
    expect((await saveBuildPlanner(initial, form)).ok).toBe(false);
    expect(boundary.persist).not.toHaveBeenCalled();
    expect(form.get("bodyDocument")).toBe("draft-document");
  });

  it.each([null, "{bad json", "x".repeat(512 * 1024 + 1)])(
    "rejects unreadable or excessive serialized loadout before writes",
    async (value) => {
      const form = saveForm();
      if (value === null) form.delete("loadout");
      else form.set("loadout", value);
      expect((await saveBuildPlanner(initial, form)).ok).toBe(false);
      expect(boundary.persist).not.toHaveBeenCalled();
      expect(boundary.revalidate).not.toHaveBeenCalled();
    },
  );

  it("preserves the optimistic version and returns the repository conflict without revalidation", async () => {
    const error = new BuildPlannerError("CONFLICT");
    boundary.persist.mockRejectedValueOnce(error);
    const form = saveForm(true);
    expect(await saveBuildPlanner({ ok: true, message: "old success" }, form)).toEqual({
      ok: false,
      message: error.message,
    });
    expect(boundary.persist.mock.calls[0][1].expectedUpdatedAt).toBe(expectedUpdatedAt);
    expect(form.get("title")).toBe("내 빌드");
    expect(boundary.revalidate).not.toHaveBeenCalled();
  });

  it("keeps an unknown database error private and leaves submitted values available", async () => {
    boundary.persist.mockRejectedValueOnce(new Error("database credential must not leak"));
    const form = saveForm();
    const result = await saveBuildPlanner(initial, form);
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain("credential");
    expect(form.get("loadout")).toBe(JSON.stringify(createEmptyPlannerLoadout()));
    expect(boundary.revalidate).not.toHaveBeenCalled();
  });
});

describe("planner metadata form boundary", () => {
  it.each([
    [setBuildPlannerVisibility, "SET_VISIBILITY"],
    [archiveBuildPlanner, "ARCHIVE"],
    [restoreBuildPlanner, "RESTORE"],
  ] as const)("passes only the relevant fields for %s", async (action, operation) => {
    const result = await action(initial, metadataForm());
    expect(boundary.persist).toHaveBeenCalledExactlyOnceWith(actor, {
      action: operation,
      buildId,
      expectedUpdatedAt,
      ...(operation === "SET_VISIBILITY" ? { visibility: "HIVE" } : {}),
    });
    expect(result).toEqual({ ok: true, message: "변경사항을 저장했습니다.", href: "/lab" });
  });
});

describe("planner authentication recovery", () => {
  it.each([saveBuildPlanner, setBuildPlannerVisibility, archiveBuildPlanner, restoreBuildPlanner])(
    "keeps an unavailable verification distinct from logout and performs no writes",
    async (action) => {
      boundary.state = { user: actor, status: "UNAVAILABLE", retryAfterSeconds: 60 };
      const result = await action(
        initial,
        action === saveBuildPlanner ? saveForm() : metadataForm(),
      );
      expect(result).toEqual({
        ok: false,
        message: "로그인은 유지됩니다. 연결을 확인한 후 다시 저장해주세요.",
      });
      expect(boundary.persist).not.toHaveBeenCalled();
      expect(boundary.revalidate).not.toHaveBeenCalled();
    },
  );

  it.each(["GUEST", "LEFT", "REAUTH_REQUIRED"] as const)(
    "blocks a %s session even if an identity remains attached",
    async (status) => {
      boundary.state = { user: actor, status };
      expect((await saveBuildPlanner(initial, saveForm())).ok).toBe(false);
      expect(boundary.persist).not.toHaveBeenCalled();
      expect(boundary.revalidate).not.toHaveBeenCalled();
    },
  );
});
