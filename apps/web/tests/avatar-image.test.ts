import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { avatarImageSource } from "../../../packages/ui/src/avatar-image";
import { Avatar } from "../../../packages/ui/src/index";
import { profileImageUrl } from "../src/lib/profile-image";

const assetId = "cc14c3fc-9209-4b93-a9d5-44ce4bf77574";
const revision = "a".repeat(64);
const source = `/api/profile/image/${assetId}?v=${revision}`;

describe("authenticated same-origin avatar display", () => {
  it("uses only the canonical metadata URL and preserves the existing fixed avatar size", () => {
    expect(avatarImageSource(profileImageUrl(assetId, revision))).toBe(source);
    const markup = renderToStaticMarkup(
      createElement(Avatar, { name: "Hyeon", imageUrl: source, size: "sm" }),
    );
    expect(markup).toContain('src="' + source + '"');
    expect(markup).toContain('class="avatar avatar-sm avatar-with-image"');
    expect(markup).toContain('width="28"');
    expect(markup).toContain('height="28"');
    expect(markup).toContain('alt=""');
    expect(markup).toContain('aria-label="Hyeon"');
  });
  it.each([
    null,
    undefined,
    "",
    "https://cdn.discordapp.com/avatars/external/image.png",
    "https://example.invalid/photo.png",
    "//example.invalid/photo",
    "data:image/svg+xml,<svg></svg>",
    "data:image/png;base64,AAAA",
    "blob:http://localhost/image",
    "javascript:alert(1)",
    `/api/profile/image/${assetId}`,
    `/api/profile/image/${assetId}?v=${revision}&next=https://example.invalid`,
    `/api/profile/image/${assetId}?v=${"A".repeat(64)}`,
    `/api/profile/image/${assetId}?v=${revision}#fragment`,
    `/api/profile/image/../private?v=${revision}`,
    `/api/profile/image/${assetId}?v=${revision}\n`,
  ])("never loads an unsafe, inline, arbitrary external or malformed source: %s", (value) => {
    expect(avatarImageSource(value)).toBeNull();
    const markup = renderToStaticMarkup(createElement(Avatar, { name: "Hyeon", imageUrl: value }));
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("avatar-with-image");
    expect(markup).toContain(">H</span>");
  });
  it("supports a valid replacement revision and canonical UUID letter case", () => {
    const replacement = profileImageUrl(assetId.toUpperCase(), "b".repeat(64))!;
    expect(avatarImageSource(replacement)).toBe(replacement);
  });
  it("keeps the initial fallback readable for Unicode names and an empty display name", () => {
    expect(renderToStaticMarkup(createElement(Avatar, { name: "🐝 하이브" }))).toContain(
      "🐝</span>",
    );
    expect(renderToStaticMarkup(createElement(Avatar, { name: "" }))).toContain(">H</span>");
  });
});
