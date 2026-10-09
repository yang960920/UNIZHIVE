import { describe, expect, it } from "vitest";
import { visibleNavigation } from "../src/lib/navigation";

describe("member menu privacy", () => {
  it.each([null, "GUEST", "APPLICANT", "MEMBER", "OFFICER"] as const)(
    "omits the full directory for %s while keeping season and party navigation",
    (role) => {
      const routes = visibleNavigation(role).map((item) => item.href);
      expect(routes).not.toContain("/members");
      expect(routes).toEqual(expect.arrayContaining(["/season", "/ops", "/community"]));
    },
  );
  it("does not carry the administrator's member menu into the next ordinary request", () => {
    expect(visibleNavigation("ADMIN").some((item) => item.href === "/members")).toBe(true);
    expect(visibleNavigation("MEMBER").some((item) => item.href === "/members")).toBe(false);
    expect(visibleNavigation("ADMIN").some((item) => item.href === "/members")).toBe(true);
  });
});
