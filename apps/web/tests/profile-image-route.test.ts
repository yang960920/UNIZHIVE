import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAuthState } from "../src/lib/auth-policy";

const boundary = vi.hoisted(() => ({
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  read: vi.fn(),
}));
vi.mock("../src/lib/auth", () => ({ getCurrentAuthState: async () => boundary.state }));
vi.mock("../src/lib/server/profile-images", () => ({ readProfileImage: boundary.read }));

import { GET } from "../src/app/api/profile/image/[assetId]/route";

const actor = {
  id: "360fd9fd-7447-4ba9-9d5b-cba957fd3307",
  name: "Avatar reader",
  role: "MEMBER" as const,
  isMock: false,
};
const assetId = "2c1f0c31-5506-472e-bc57-a27955d57be9";
const revision = "a".repeat(64);
const bytes = Buffer.from("normalized-webp");
function request(version: string | null = revision) {
  return GET(
    new Request(
      `http://localhost:3000/api/profile/image/${assetId}${version === null ? "" : `?v=${version}`}`,
    ),
    { params: Promise.resolve({ assetId }) },
  );
}
function expectPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
}
beforeEach(() => {
  boundary.state = { user: actor, status: "AUTHENTICATED" };
  boundary.read.mockReset().mockResolvedValue(bytes);
});

describe("private profile image response", () => {
  it.each(["GUEST", "LEFT", "REAUTH_REQUIRED"] as const)(
    "returns a private 404 for %s without reading pixels",
    async (status) => {
      boundary.state = { user: actor, status };
      const response = await request();
      expect(response.status).toBe(404);
      expectPrivate(response);
      expect(await response.text()).toBe("");
      expect(boundary.read).not.toHaveBeenCalled();
    },
  );

  it("retains a temporary authorization failure as a private unavailable response", async () => {
    boundary.state = { user: actor, status: "UNAVAILABLE" };
    const response = await request();
    expect(response.status).toBe(503);
    expectPrivate(response);
    expect(boundary.read).not.toHaveBeenCalled();
  });

  it("denies preview and absent identities without reading actual stored avatars", async () => {
    for (const user of [null, { ...actor, id: "demo-member", isMock: true }]) {
      boundary.state = { user, status: "AUTHENTICATED" };
      const response = await request();
      expect(response.status).toBe(404);
      expectPrivate(response);
    }
    expect(boundary.read).not.toHaveBeenCalled();
  });

  it("returns only authorized WebP bytes and prevents shared or persistent caching", async () => {
    const response = await request();
    expect(boundary.read).toHaveBeenCalledExactlyOnceWith(actor, assetId, revision);
    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("content-length")).toBe(String(bytes.length));
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  it("delegates a missing revision as null rather than inventing a latest version", async () => {
    expect((await request(null)).status).toBe(200);
    expect(boundary.read).toHaveBeenCalledExactlyOnceWith(actor, assetId, null);
  });

  it("returns the same empty not-found response for missing and unauthorized assets", async () => {
    boundary.read.mockResolvedValue(null);
    const response = await request();
    expect(response.status).toBe(404);
    expectPrivate(response);
    expect(await response.text()).toBe("");
    expect(response.headers.has("content-type")).toBe(false);
  });

  it("never serializes private diagnostics when storage or fresh authorization fails", async () => {
    boundary.read.mockRejectedValue(new Error("postgres private-game-uid oauth-access-token"));
    const response = await request();
    expect(response.status).toBe(503);
    expectPrivate(response);
    expect(await response.text()).toBe("");
  });
});
