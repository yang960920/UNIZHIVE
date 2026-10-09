import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  decodeBuildCursor,
  encodeBuildCursor,
  normalizeBuildQuery,
  literalSearchPattern,
} from "../src/lib/server/build-planner-query";
describe("bounded planner search and keyset cursor", () => {
  it("round-trips a timestamp/id cursor and rejects malformed or expanded objects", () => {
    const value = {
      updatedAt: "2026-10-07T00:00:00.000Z",
      id: "c26b8cd4-d90a-4072-9658-6b2e2fe63227",
    };
    expect(decodeBuildCursor(encodeBuildCursor(value))).toEqual(value);
    for (const input of [
      "%%%",
      "x".repeat(241),
      Buffer.from(JSON.stringify({ ...value, role: "ADMIN" })).toString("base64url"),
      Buffer.from(JSON.stringify({ ...value, updatedAt: "tomorrow" })).toString("base64url"),
    ])
      expect(decodeBuildCursor(input)).toBeNull();
  });
  it("normalizes hashtag queries without splitting Unicode and treats SQL wildcards as literal text", () => {
    expect(normalizeBuildQuery("  ##보스  ")).toBe("보스");
    expect(Array.from(normalizeBuildQuery("🐝".repeat(100)))).toHaveLength(80);
    expect(literalSearchPattern("100%_test\\tag")).toBe("%100\\%\\_test\\\\tag%");
  });
});
