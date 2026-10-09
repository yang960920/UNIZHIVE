import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ save: vi.fn(), manage: vi.fn(), refresh: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: boundary.refresh }));
vi.mock("@/lib/admin-format", () => import("../src/lib/admin-format"));
vi.mock("@/lib/server/party-administration", () => ({
  saveParty: boundary.save,
  managePartyParticipant: boundary.manage,
  PartyAdministrationError: class PartyAdministrationError extends Error {},
}));
import { savePartyForm, managePartyParticipantForm } from "../src/app/ops/actions";

beforeEach(() => {
  boundary.save.mockReset().mockResolvedValue({ id: "saved-id" });
  boundary.manage.mockReset().mockResolvedValue(undefined);
  boundary.refresh.mockClear();
});
function form(): FormData {
  const value = new FormData();
  for (const [key, input] of Object.entries({
    seasonId: "season-a",
    contentKey: "endless-deep",
    title: "저녁 모집",
    meetingPoint: "음성방",
    description: "준비물",
    startsAt: "2026-10-08T19:00",
    endsAt: "",
    capacity: "4",
    status: "SCHEDULED",
  }))
    value.set(key, input);
  return value;
}

describe("party form server action boundary", () => {
  it("stores KST dates as UTC, keeps an optional end empty and navigates to the detail without automatic RSVP", async () => {
    const result = await savePartyForm({ ok: false, message: "" }, form());
    expect(boundary.save).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAt: "2026-10-08T10:00:00.000Z",
        endsAt: null,
        capacity: 4,
        seasonId: "season-a",
      }),
    );
    expect(result).toEqual({
      ok: true,
      message: "파티 모집을 저장했습니다.",
      href: "/ops/saved-id",
    });
    expect(boundary.manage).not.toHaveBeenCalled();
    expect(boundary.refresh).toHaveBeenCalledWith("/ops", "layout");
  });
  it("rejects impossible dates before persistence and hides unexpected storage error details", async () => {
    const input = form();
    input.set("startsAt", "2026-02-31T19:00");
    expect((await savePartyForm({ ok: false, message: "" }, input)).ok).toBe(false);
    expect(boundary.save).not.toHaveBeenCalled();
    boundary.save.mockRejectedValue(new Error("private DB details"));
    const result = await savePartyForm({ ok: false, message: "" }, form());
    expect(result.message).not.toContain("private");
    expect(boundary.refresh).not.toHaveBeenCalled();
  });
  it("preserves edit precision and current version while dropping spoofed actor fields", async () => {
    const input = form();
    input.set("id", "party-a");
    input.set("expectedUpdatedAt", "2026-10-06T10:00:00Z");
    input.set("originalStartsAt", "2026-10-08T10:00:01.001Z");
    input.set("role", "ADMIN");
    await savePartyForm({ ok: false, message: "" }, input);
    const written = boundary.save.mock.calls[0][0];
    expect(written.startsAt).toBe("2026-10-08T10:00:01.001Z");
    expect(written.expectedUpdatedAt).toBe("2026-10-06T10:00:00Z");
    expect(written).not.toHaveProperty("role");
  });
  it("reads multiple requested effects without creating gameplay role slots", async () => {
    const input = form();
    input.append("requestedContributions", "fortress");
    input.append("requestedContributions", "healing");
    await savePartyForm({ ok: false, message: "" }, input);
    expect(boundary.save.mock.calls[0][0].requestedContributions).toEqual(["fortress", "healing"]);
    await savePartyForm({ ok: false, message: "" }, form());
    expect(boundary.save.mock.calls[1][0].requestedContributions).toEqual([]);
  });
  it("targets a single participant with a concurrency version and excludes status on removal", async () => {
    const input = new FormData();
    for (const [key, value] of Object.entries({
      operationId: "party-a",
      userId: "member-a",
      expectedUpdatedAt: "version",
      action: "REMOVE",
      status: "GOING",
    }))
      input.set(key, value);
    const result = await managePartyParticipantForm({ ok: false, message: "" }, input);
    expect(result.ok).toBe(true);
    expect(boundary.manage).toHaveBeenCalledWith({
      operationId: "party-a",
      userId: "member-a",
      expectedUpdatedAt: "version",
      action: "REMOVE",
    });
  });
});
