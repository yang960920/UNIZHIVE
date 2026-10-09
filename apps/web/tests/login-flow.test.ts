import { describe, expect, it } from "vitest";
import {
  getDiscordGrantHint,
  getDiscordLoginAuthorization,
  getLoginCompletionUrl,
  getSafeLoginDestination,
  isApprovedLoginRole,
  readLoginDestination,
} from "../src/lib/login-flow";

describe("returning member login navigation", () => {
  it("preserves an internal editor destination including its revision and anchor", () => {
    expect(getSafeLoginDestination("/lab/b/build-id/edit?from=2#equipment")).toBe(
      "/lab/b/build-id/edit?from=2#equipment",
    );
    expect(getSafeLoginDestination("/lab?search=%EC%9A%B8%ED%94%84%20%EC%84%B8%ED%8A%B8")).toBe(
      "/lab?search=%EC%9A%B8%ED%94%84%20%EC%84%B8%ED%8A%B8",
    );
  });

  it.each([
    "https://other.example/lab",
    "//other.example/lab",
    "//uniz.invalid/lab",
    "/\\other.example/lab",
    "/%5cother.example/lab",
    "/%2f%2fother.example/lab",
    "/%252f%252fother.example/lab",
    "/%25252f%25252fother.example/lab",
    "/%2525252f%2525252fother.example/lab",
    "/lab\n",
    "/%00lab",
    "javascript:alert(1)",
    "/login?callbackUrl=/lab",
    "/login/complete?callbackUrl=/lab",
    "/onboarding?edit=1",
    "/api/auth/signout",
    "/%6cogin",
    "/%2e%2e/login",
    "/%252e%252e/login",
  ])("falls back to home for unsafe or looping destination %s", (value) => {
    expect(getSafeLoginDestination(value, "https://uniz.invalid")).toBe("/");
  });

  it("accepts only absolute callbacks on the configured origin", () => {
    expect(getSafeLoginDestination("http://127.0.0.1:3000/season?phase=2")).toBe("/");
    expect(
      getSafeLoginDestination("http://127.0.0.1:3000/season?phase=2", "http://127.0.0.1:3000"),
    ).toBe("/season?phase=2");
    expect(getSafeLoginDestination("http://localhost:3000/season", "http://127.0.0.1:3000")).toBe(
      "/",
    );
  });

  it("recovers the safe original page from the completion callback after an OAuth error", () => {
    const complete = getLoginCompletionUrl("/lab/b/id/edit?from=2", "join");
    expect(complete).toContain("intent=join");
    expect(readLoginDestination(`http://127.0.0.1:3000${complete}`, "http://127.0.0.1:3000")).toBe(
      "/lab/b/id/edit?from=2",
    );
    expect(readLoginDestination("/login/complete?callbackUrl=https%3A%2F%2Fother.example")).toBe(
      "/",
    );
    expect(readLoginDestination("https://other.example/login/complete?callbackUrl=/admin")).toBe(
      "/",
    );
  });

  it("sends both intents through the same verified handoff instead of directly trusting onboarding", () => {
    expect(getLoginCompletionUrl("/ops")).toBe("/login/complete?callbackUrl=%2Fops");
    expect(getLoginCompletionUrl("/onboarding", "join")).toBe(
      "/login/complete?callbackUrl=%2F&intent=join",
    );
    expect(isApprovedLoginRole("MEMBER")).toBe(true);
    expect(isApprovedLoginRole("OFFICER")).toBe(true);
    expect(isApprovedLoginRole("ADMIN")).toBe(true);
    expect(isApprovedLoginRole("APPLICANT")).toBe(false);
    expect(isApprovedLoginRole("GUEST")).toBe(false);
  });
});

describe("Discord returning consent preference", () => {
  it("skips repeat consent only for a remembered returning login", () => {
    expect(
      getDiscordLoginAuthorization({ intent: "login", rememberedGrant: true, hasError: false }),
    ).toEqual({ prompt: "none" });
    expect(
      getDiscordLoginAuthorization({ intent: "join", rememberedGrant: true, hasError: false }),
    ).toEqual({ prompt: "consent" });
    expect(
      getDiscordLoginAuthorization({ intent: "login", rememberedGrant: false, hasError: false }),
    ).toEqual({ prompt: "consent" });
  });

  it("uses the normal Discord screen on error retry instead of repeating silent failures", () => {
    expect(
      getDiscordLoginAuthorization({ intent: "login", rememberedGrant: true, hasError: true }),
    ).toEqual({ prompt: "consent" });
  });

  it("invalidates the consent preference when the Discord application changes", () => {
    expect(getDiscordGrantHint(undefined)).toBeNull();
    expect(getDiscordGrantHint(" ")).toBeNull();
    expect(getDiscordGrantHint(" app-a ")).toBe("app-a:identify guilds.members.read");
    expect(getDiscordGrantHint("app-b")).not.toBe(getDiscordGrantHint("app-a"));
  });
});
