import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAuthState } from "../src/lib/auth-policy";

const boundary = vi.hoisted(() => ({
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  database: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/auth", () => ({ getCurrentAuthState: async () => boundary.state }));
vi.mock("@uniz/db", async (original) => ({
  ...(await original<typeof import("@uniz/db")>()),
  getDb: boundary.database,
}));
import {
  getOperationDirectory,
  getOperationDirectoryDetail,
} from "../src/lib/server/operation-directory";

beforeEach(() => {
  boundary.database.mockReset();
  boundary.state = { user: null, status: "GUEST" };
});

describe("party directory authorization boundary", () => {
  it("does not access the database for guests, temporary failures, expired sessions or departed members", async () => {
    for (const [status, mode] of [
      ["GUEST", "DEMO"],
      ["UNAVAILABLE", "ERROR"],
      ["REAUTH_REQUIRED", "REAUTH"],
      ["LEFT", "LEFT"],
    ] as const) {
      boundary.state = { user: null, status };
      expect((await getOperationDirectory({ seasonId: "untrusted", month: "2026-99" })).mode).toBe(
        mode,
      );
      expect((await getOperationDirectoryDetail("invalid")).mode).toBe(mode);
    }
    expect(boundary.database).not.toHaveBeenCalled();
  });
  it("keeps mock and unapproved identities out of real season and participant reads", async () => {
    const member = {
      id: "360fd9fd-7447-4ba9-9d5b-cba957fd3307",
      name: "Fixture",
      role: "MEMBER" as const,
      isMock: true,
    };
    boundary.state = { user: member, status: "AUTHENTICATED" };
    expect((await getOperationDirectory()).mode).toBe("DEMO");
    boundary.state = {
      user: { ...member, role: "APPLICANT", isMock: false },
      status: "AUTHENTICATED",
    };
    expect((await getOperationDirectory()).mode).toBe("PENDING");
    boundary.state = {
      user: { ...member, isMock: false },
      status: "UNAVAILABLE",
      retryAfterSeconds: 30,
    };
    expect(await getOperationDirectory()).toEqual({ mode: "ERROR", retryAfterSeconds: 30 });
    expect(boundary.database).not.toHaveBeenCalled();
  });
});
