import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SteamOverviewData } from "../src/lib/data/steam-overview-types";
import { SteamOverview } from "../src/components/steam-overview";

function data(): SteamOverviewData {
  return {
    appId: 2139460,
    source: "STEAM",
    news: {
      status: "LIVE",
      observedAt: "2026-10-08T03:00:00.000Z",
      items: [
        {
          id: "12345",
          title: "Official update",
          summary: "Short official summary.",
          url: "https://steamcommunity.com/games/2139460/announcements/detail/12345",
          publishedAt: "2026-10-07T08:00:00.000Z",
        },
      ],
    },
    players: { status: "LIVE", count: 12345, observedAt: "2026-10-08T03:00:00.000Z" },
  };
}

describe("Steam overview presentation", () => {
  it("keeps publisher Korean text and Korean original links without relabeling global player counts", () => {
    const fixture = data();
    fixture.news.items[0] = {
      ...fixture.news.items[0],
      title: "3.0.7 버전 수정 공지",
      summary: "제네시스 서버의 표시 오류를 수정했습니다.",
      url: "https://store.steampowered.com/news/app/2139460/view/12345?l=koreana",
    };
    const html = renderToStaticMarkup(createElement(SteamOverview, { data: fixture }));
    expect(html).toContain("3.0.7 버전 수정 공지");
    expect(html).toContain("제네시스 서버의 표시 오류를 수정했습니다.");
    expect(html).toContain(
      'href="https://store.steampowered.com/news/app/2139460/view/12345?l=koreana"',
    );
    expect(html).toContain('href="https://store.steampowered.com/news/app/2139460?l=koreana"');
    expect(html).toContain("Steam 현재 접속자");
    expect(html).not.toContain("한국 서버 접속자");
  });
  it("shows observed statistics, KST timestamps, news text and original links", () => {
    const html = renderToStaticMarkup(createElement(SteamOverview, { data: data() }));
    expect(html).toContain("원스휴먼 소식 · Steam");
    expect(html).toContain("12,345");
    expect(html).toContain("2026. 10. 08. 12:00 KST");
    expect(html).toContain("Official update");
    expect(html).toContain("Short official summary.");
    expect(html).toContain(
      'href="https://steamcommunity.com/games/2139460/announcements/detail/12345"',
    );
    expect(html).toContain("다른 플랫폼 제외");
    expect(html).not.toContain("연결 준비 중");
  });

  it("labels previous statistics and preserves their observation time during refresh failures", () => {
    const fixture = data();
    fixture.players.status = "STALE";
    fixture.news.status = "STALE";
    const html = renderToStaticMarkup(createElement(SteamOverview, { data: fixture }));
    expect(html).toContain("이전 기록");
    expect(html).toContain("갱신이 지연되어 이전 조회 수치를 표시합니다.");
    expect(html).toContain("마지막으로 확인한 내용");
    expect(html).toContain("12,345");
    expect(html).toContain("12:00 KST");
  });

  it("shows an unavailable indicator instead of a fabricated count while other news remains visible", () => {
    const fixture = data();
    fixture.players = { status: "UNAVAILABLE", count: null, observedAt: null };
    const html = renderToStaticMarkup(createElement(SteamOverview, { data: fixture }));
    expect(html).toContain("현재 접속자 수를 확인하지 못했습니다.");
    expect(html).toContain("—");
    expect(html).not.toContain("0명");
    expect(html).not.toContain("12,345");
    expect(html).toContain("Official update");
  });

  it("renders upstream markup as text rather than executing it", () => {
    const fixture = data();
    fixture.news.items[0].title = '<script>alert("news")</script>';
    fixture.news.items[0].summary = '<img src="x" onerror="alert(1)">';
    const html = renderToStaticMarkup(createElement(SteamOverview, { data: fixture }));
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('<img src="x"');
  });
});
