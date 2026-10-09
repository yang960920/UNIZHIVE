// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Dashboard } from "../src/components/dashboard";
import { getDashboardData } from "../src/lib/mocks/dashboard";

describe("demonstration home content", () => {
  it.each([
    { role: "GUEST" as const, userId: undefined },
    { role: "ADMIN" as const, userId: "demo-admin" },
  ])("keeps one example per content area with valid list destinations for $role", (props) => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(createElement(Dashboard, props));
    const notices = container.querySelectorAll(".announcement-list > button");
    const builds = container.querySelectorAll(".build-list > a");
    const guides = container.querySelectorAll(".guide-list > a");
    expect(notices).toHaveLength(1);
    expect(builds).toHaveLength(1);
    expect(guides).toHaveLength(1);
    expect(builds[0].getAttribute("href")).toBe("/lab");
    expect(guides[0].getAttribute("href")).toBe("/community");
    expect(builds[0].textContent).toContain("실제 빌드 목록으로 이동");
    expect(guides[0].textContent).toContain("실제 커뮤니티 목록으로 이동");

    // The shared fixtures still support the season and domain demonstrations.
    const fixture = getDashboardData(props.userId);
    expect(notices[0].textContent).toContain(fixture.announcements[0].title);
    expect(builds[0].textContent).toContain(fixture.recentBuilds[0].title);
    expect(guides[0].textContent).toContain(fixture.recentGuides[0].title);
    expect(fixture.announcements.length).toBeGreaterThan(1);
    expect(fixture.recentBuilds.length).toBeGreaterThan(1);
    expect(fixture.recentGuides.length).toBeGreaterThan(1);
  });
});
