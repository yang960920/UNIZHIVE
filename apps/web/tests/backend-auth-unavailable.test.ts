import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAuthState } from "../src/lib/auth-policy";

const boundary = vi.hoisted(() => ({
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  database: vi.fn(),
  guild: vi.fn(),
  persist: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/auth", () => ({ getCurrentAuthState: async () => boundary.state }));
vi.mock("@uniz/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@uniz/db")>()),
  getDb: boundary.database,
}));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getLiveGuildEligibility: boundary.guild,
}));
vi.mock("../src/lib/server/operational-repository", () => ({
  persistOperationalMutation: boundary.persist,
}));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidate }));

import { mutateOperationalData } from "../src/lib/operational-actions";
import { changeMemberRole, getEditableMemberProfile } from "../src/lib/server/member-management";
import {
  getOperationAdminData,
  mutateOperationAdministration,
} from "../src/lib/server/operation-administration";
import { getSeasonAdminData, getSeasonAdminDetail } from "../src/lib/server/season-administration";

const recordId = "360fd9fd-7447-4ba9-9d5b-cba957fd3307";
const operationInput = {
  action: "SAVE_OPERATION",
  seasonId: null,
  title: "검증용 작전",
  type: "RAID",
  description: "검증용 작전 설명",
  startsAt: "2026-10-08T00:00:00.000Z",
  endsAt: null,
  capacity: 10,
  status: "SCHEDULED",
};
beforeEach(() => {
  vi.clearAllMocks();
  boundary.state = { user: null, status: "GUEST" };
});

describe("backend transient authorization failures", () => {
  it("blocks member, operation and RSVP writes before persistence even if display identity is attached", async () => {
    boundary.state = {
      status: "UNAVAILABLE",
      retryAfterSeconds: 261,
      user: { id: recordId, name: "Display identity", role: "ADMIN", isMock: false },
    };
    for (const write of [
      () => changeMemberRole({ action: "approve", targetId: recordId, reason: "VERIFIED" }),
      () => mutateOperationAdministration(operationInput),
    ]) {
      await expect(write()).rejects.toMatchObject({
        message: expect.stringContaining("로그인은 유지됩니다"),
      });
    }
    await expect(
      mutateOperationalData({ action: "RSVP", operationId: recordId, status: "GOING" }),
    ).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("로그인은 유지됩니다"),
    });
    expect(boundary.database).not.toHaveBeenCalled();
    expect(boundary.guild).not.toHaveBeenCalled();
    expect(boundary.persist).not.toHaveBeenCalled();
    expect(boundary.revalidate).not.toHaveBeenCalled();
  });

  it("keeps unavailable protected reads separate from guest, expired or departed identities", async () => {
    boundary.state = { user: null, status: "UNAVAILABLE" };
    await expect(getEditableMemberProfile()).rejects.toThrow("다시 시도");
    await expect(getOperationAdminData()).rejects.toThrow("다시 시도");
    await expect(getSeasonAdminData()).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(getSeasonAdminDetail(recordId)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    for (const status of ["GUEST", "REAUTH_REQUIRED", "LEFT"] as const) {
      boundary.state = { user: null, status };
      await expect(getEditableMemberProfile()).rejects.toThrow("로그인한 후");
      await expect(getOperationAdminData()).rejects.toThrow("로그인");
      await expect(getSeasonAdminData()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      await expect(
        mutateOperationalData({ action: "RSVP", operationId: recordId, status: "GOING" }),
      ).resolves.toMatchObject({ ok: false, message: expect.stringContaining("로그인이 필요") });
    }
    expect(boundary.database).not.toHaveBeenCalled();
    expect(boundary.persist).not.toHaveBeenCalled();
  });
});
