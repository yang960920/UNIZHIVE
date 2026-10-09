import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ mutate: vi.fn(), refresh: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: boundary.refresh }));
vi.mock("@/lib/server/season-administration", () => ({
  mutateSeasonAdministration: boundary.mutate,
}));
vi.mock("@/lib/season-admin-policy", () => import("../src/lib/season-admin-policy"));
vi.mock("@/lib/admin-format", () => import("../src/lib/admin-format"));
vi.mock("@/lib/server/season-participation", () => ({
  joinSeason: vi.fn(),
  SeasonParticipationError: class extends Error {},
}));
vi.mock("@/lib/operational-actions", () => ({ mutateOperationalData: vi.fn() }));

import { saveSeasonAdministration } from "../src/app/admin/seasons/actions";
import { saveMemberSeason } from "../src/app/season/actions";

function setup(action = "SAVE_SEASON_SETUP") {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    action,
    ...(action === "SAVE_SEASON_SETUP"
      ? { id: "season-a", expectedUpdatedAt: "2026-10-08T00:00:00.000Z" }
      : {}),
    scenarioKey: "ENDLESS_DREAM",
    serverNumber: "0070",
    region: "한국",
    name: "UNIZ",
    startsAt: "2026-10-08T09:30",
    settlementAt: "",
    serverType: "PERMANENT",
    trancePhenomenon: "GRAVITY_ABYSS",
  }))
    form.set(name, value);
  return form;
}

beforeEach(() => {
  boundary.mutate.mockReset().mockResolvedValue({ id: "season-a", approvalStatus: "APPROVED" });
  boundary.refresh.mockReset();
});

describe("season environment form submissions", () => {
  it.each(["true", "false"])(
    "forwards the administrator's explicit migration setting %s",
    async (setting) => {
      const form = setup();
      form.set("migrationOpen", setting);
      form.set("gravityContentEnabled", "true");
      const result = await saveSeasonAdministration({ ok: false, message: "" }, form);
      expect(result.ok).toBe(true);
      expect(boundary.mutate).toHaveBeenCalledOnce();
      expect(boundary.mutate.mock.calls[0]![0]).toMatchObject({
        serverType: "PERMANENT",
        trancePhenomenon: "GRAVITY_ABYSS",
        migrationOpen: setting === "true",
        settlementAt: null,
        startsAt: "2026-10-08T00:30:00.000Z",
      });
      expect(boundary.mutate.mock.calls[0]![0]).not.toHaveProperty("gravityContentEnabled");
    },
  );

  it("does not submit a migration change when the admin control is absent", async () => {
    await saveSeasonAdministration({ ok: false, message: "" }, setup());
    expect(boundary.mutate.mock.calls[0]![0]).not.toHaveProperty("migrationOpen");
  });

  it("never lets member registration forms forward migration or lifecycle controls", async () => {
    const form = setup();
    form.set("migrationOpen", "true");
    form.set("status", "ACTIVE");
    await saveMemberSeason({ ok: false, message: "" }, form);
    const submitted = boundary.mutate.mock.calls[0]![0];
    expect(submitted).toMatchObject({ serverType: "PERMANENT", trancePhenomenon: "GRAVITY_ABYSS" });
    expect(submitted).not.toHaveProperty("migrationOpen");
    expect(submitted).not.toHaveProperty("status");
  });
});
