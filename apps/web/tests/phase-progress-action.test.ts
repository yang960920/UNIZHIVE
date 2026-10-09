import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  mutate: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidate }));
vi.mock("@/lib/server/season-administration", () => ({
  mutateSeasonAdministration: boundary.mutate,
}));
vi.mock("@/lib/season-admin-policy", () => import("../src/lib/season-admin-policy"));
vi.mock("@/lib/admin-format", () => import("../src/lib/admin-format"));

import { saveSeasonAdministration } from "../src/app/admin/seasons/actions";
import { SeasonAdministrationError } from "../src/lib/season-admin-policy";

const seasonId = "86db12c5-deaf-42c8-8ff7-07e8ab9f6678";
const initialVersion = "2026-10-06T00:00:00.000Z";
const refreshedVersion = "2026-10-06T00:00:00.001Z";

function phaseForm(direction: "NEXT" | "PREVIOUS", version = initialVersion) {
  const form = new FormData();
  form.set("action", "CHANGE_SEASON_PHASE");
  form.set("seasonId", seasonId);
  form.set("expectedUpdatedAt", version);
  // A submitted button contributes its direction to the same form for both controls.
  form.set("direction", direction);
  return form;
}

beforeEach(() => {
  boundary.mutate.mockReset().mockResolvedValue({ id: seasonId });
  boundary.revalidate.mockReset();
});

describe("manual phase action forwarding and recovery", () => {
  it.each(["NEXT", "PREVIOUS"] as const)(
    "forwards the selected %s control and hidden version without changing actor or season fields",
    async (direction) => {
      const result = await saveSeasonAdministration(
        { ok: false, message: "" },
        phaseForm(direction),
      );
      expect(boundary.mutate).toHaveBeenCalledExactlyOnceWith({
        action: "CHANGE_SEASON_PHASE",
        seasonId,
        expectedUpdatedAt: initialVersion,
        direction,
      });
      expect(result).toEqual({ ok: true, message: "시즌 단계를 변경했습니다." });
      expect(boundary.revalidate).toHaveBeenCalledWith("/season/[id]", "page");
      expect(boundary.revalidate).toHaveBeenCalledWith("/admin", "layout");
    },
  );

  it("uses the refreshed timestamp for PREVIOUS immediately after NEXT rather than the prior action state", async () => {
    const next = await saveSeasonAdministration({ ok: false, message: "" }, phaseForm("NEXT"));
    const previous = await saveSeasonAdministration(next, phaseForm("PREVIOUS", refreshedVersion));
    expect(boundary.mutate.mock.calls.map(([input]) => input)).toEqual([
      {
        action: "CHANGE_SEASON_PHASE",
        seasonId,
        expectedUpdatedAt: initialVersion,
        direction: "NEXT",
      },
      {
        action: "CHANGE_SEASON_PHASE",
        seasonId,
        expectedUpdatedAt: refreshedVersion,
        direction: "PREVIOUS",
      },
    ]);
    expect(previous.ok).toBe(true);
  });

  it("keeps an unavailable PREVIOUS response distinct from approval denial or a login instruction", async () => {
    const error = new SeasonAdministrationError("UNAVAILABLE");
    boundary.mutate.mockRejectedValueOnce(error);
    const result = await saveSeasonAdministration(
      { ok: true, message: "시즌 단계를 변경했습니다." },
      phaseForm("PREVIOUS", refreshedVersion),
    );
    expect(result).toEqual({ ok: false, message: error.message });
    expect(result.message).not.toBe(new SeasonAdministrationError("APPROVAL").message);
    expect(result.message).not.toBe(new SeasonAdministrationError("UNAUTHENTICATED").message);
    expect(boundary.revalidate).not.toHaveBeenCalled();
  });

  it("preserves the stale-version conflict instead of treating PREVIOUS as an approval failure", async () => {
    const error = new SeasonAdministrationError("CONFLICT");
    boundary.mutate.mockRejectedValueOnce(error);
    expect(
      await saveSeasonAdministration({ ok: false, message: "" }, phaseForm("PREVIOUS")),
    ).toEqual({ ok: false, message: error.message });
    expect(boundary.revalidate).not.toHaveBeenCalled();
  });
});
