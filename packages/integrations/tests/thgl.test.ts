import { describe, expect, it } from "vitest";
import { buildTHGLEmbedUrl, validateTHGLEmbedUrl } from "../src/thgl";

describe("verified TH.GL embeds", () => {
  const verified = { confirmed: "https://oncehuman.th.gl/embed/maps/Verified%20Map" };

  it("has no URL for unconfigured map names", () => {
    expect(buildTHGLEmbedUrl({ map: "ENDLESS DREAM" })).toBeNull();
    expect(buildTHGLEmbedUrl({ map: "unknown" }, verified)).toBeNull();
  });

  it("allows only official embed URLs, never external or regular map pages", () => {
    expect(validateTHGLEmbedUrl("https://evil.example/embed/maps/Map")).toBeNull();
    expect(validateTHGLEmbedUrl("https://oncehuman.th.gl/maps/Map")).toBeNull();
    expect(validateTHGLEmbedUrl("javascript:alert(1)")).toBeNull();
    expect(validateTHGLEmbedUrl("https://oncehuman.th.gl@evil.example/embed/maps/Map")).toBeNull();
  });

  it("writes only officially documented parameters with URL encoding", () => {
    expect(
      validateTHGLEmbedUrl("https://oncehuman.th.gl/embed/maps/Map?unknown=a&fake=b&zoom=1"),
    ).toBe("https://oncehuman.th.gl/embed/maps/Map?zoom=1");
    const url = new URL(
      buildTHGLEmbedUrl(
        { map: "confirmed", shareCode: "my-route", zoom: 1.5, center: [-8000, 1000] },
        verified,
      )!,
    );
    expect(url.searchParams.get("share")).toBe("my-route");
    expect(url.searchParams.get("zoom")).toBe("1.5");
    expect(url.searchParams.get("center")).toBe("-8000,1000");
    expect(buildTHGLEmbedUrl({ map: "confirmed", zoom: Infinity }, verified)).toBeNull();
  });

  it("encodes verified marker IDs without allowing query injection", () => {
    const url = new URL(
      buildTHGLEmbedUrl(
        { map: "confirmed", markerTypes: ["type_42", "deviations_dr._teddy", "type_42"] },
        verified,
      )!,
    );
    expect(url.searchParams.get("types")).toBe("type_42,deviations_dr._teddy");
    for (const markerTypes of [[], ["type&share=other"], ["<script>"], ["a".repeat(129)]]) {
      expect(buildTHGLEmbedUrl({ map: "confirmed", markerTypes }, verified)).toBeNull();
    }
  });
});
