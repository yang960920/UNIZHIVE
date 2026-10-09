import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAuthState } from "../src/lib/auth-policy";
const boundary = vi.hoisted(() => ({
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  database: vi.fn(),
  guild: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/auth", () => ({ getCurrentAuthState: async () => boundary.state }));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getSessionGuildEligibilityState: boundary.guild,
}));
vi.mock("@uniz/db", async (original) => ({
  ...(await original<typeof import("@uniz/db")>()),
  getDb: boundary.database,
}));
import {
  getCommunityDirectory,
  getCommunityPost,
  getRecentAnnouncements,
  saveCommunityPost,
  getCommunityEditorData,
  getAnnouncementAdminData,
} from "../src/lib/server/community-repository";
const input = {
  title: "검증 글",
  body: "내용",
  category: "GENERAL",
  buildVersionId: null,
  isPinned: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  boundary.state = { user: null, status: "GUEST" };
});
describe("HIVE community access boundary", () => {
  it("keeps actual posts, comments and announcement bells private for guests/mocks/unapproved identities", async () => {
    for (const [status, mode] of [
      ["GUEST", "DEMO"],
      ["UNAVAILABLE", "ERROR"],
      ["REAUTH_REQUIRED", "REAUTH"],
      ["LEFT", "LEFT"],
    ] as const) {
      boundary.state = { user: null, status };
      expect((await getCommunityDirectory()).mode).toBe(mode);
      expect((await getCommunityPost("invalid")).mode).toBe(mode);
      expect((await getRecentAnnouncements()).mode).toBe(mode);
    }
    const member = {
      id: "360fd9fd-7447-4ba9-9d5b-cba957fd3307",
      name: "Fixture",
      role: "MEMBER" as const,
      isMock: true,
    };
    boundary.state = { user: member, status: "AUTHENTICATED" };
    expect((await getCommunityDirectory()).mode).toBe("DEMO");
    await expect(saveCommunityPost(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    boundary.state = {
      user: { ...member, isMock: false, role: "APPLICANT" },
      status: "AUTHENTICATED",
    };
    expect((await getCommunityDirectory()).mode).toBe("PENDING");
    expect(boundary.database).not.toHaveBeenCalled();
    expect(boundary.guild).not.toHaveBeenCalled();
  });
  it("blocks temporary failures and live Guild departure before any persistence", async () => {
    boundary.state = { user: null, status: "UNAVAILABLE" };
    await expect(getCommunityEditorData()).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(getAnnouncementAdminData()).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(saveCommunityPost(input)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    boundary.state = {
      user: {
        id: "360fd9fd-7447-4ba9-9d5b-cba957fd3307",
        name: "Fixture",
        role: "MEMBER",
        isMock: false,
      },
      status: "AUTHENTICATED",
    };
    boundary.guild.mockResolvedValue({ status: "LEFT" });
    await expect(saveCommunityPost(input)).rejects.toMatchObject({ code: "LEFT" });
    boundary.guild.mockResolvedValue({ status: "UNAVAILABLE" });
    await expect(saveCommunityPost(input)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(boundary.database).not.toHaveBeenCalled();
  });
});
