import { describe, expect, it } from "vitest";
import { ONCE_HUMAN_MAPS, validateTHGLEmbedUrl } from "@uniz/integrations";
import { getMapView, mapHref } from "../src/lib/map-navigation";

describe("verified scenario maps and shared routes", () => {
  it.each(ONCE_HUMAN_MAPS)("opens the verified Korean map for $key", (map) => {
    const view = getMapView({ scenario: map.key });
    expect(view.map.key).toBe(map.key);
    expect(view.embedUrl).toBe(map.embedUrl);
    expect(validateTHGLEmbedUrl(view.embedUrl)).toBe(view.embedUrl);
    expect(new URL(view.embedUrl).hostname).toBe("oncehuman.th.gl");
    expect(decodeURIComponent(new URL(view.embedUrl).pathname)).toBe(
      `/ko/embed/maps/${map.mapName}`,
    );
    expect(new URL(view.originalUrl).pathname).toBe(`/ko/maps/${encodeURIComponent(map.mapName)}`);
  });
  it("keeps the selected map and share code in both embed and original links", () => {
    const view = getMapView({ scenario: "ENDLESS_DREAM", share: "route_42-abc" });
    expect(new URL(view.embedUrl).searchParams.get("share")).toBe("route_42-abc");
    expect(new URL(view.originalUrl).searchParams.get("share")).toBe("route_42-abc");
    expect(view.href).toBe("/map?scenario=ENDLESS_DREAM&share=route_42-abc");
    expect(mapHref("WINTER")).toBe("/map?scenario=WINTER");
  });
  it.each(["https://evil.example/route", "<script>", "route&zoom=9", "a".repeat(129)])(
    "rejects untrusted share input without reflecting it into iframe or links: %s",
    (share) => {
      const view = getMapView({ scenario: "WINTER", share });
      expect(view.invalidShare).toBe(true);
      expect(view.shareCode).toBeNull();
      expect(new URL(view.embedUrl).search).toBe("");
      expect(view.href).toBe("/map?scenario=WINTER");
    },
  );
  it("normalizes repeated query values and defaults unknown scenarios to Manibus", () => {
    expect(
      getMapView({ scenario: ["DEVIATION", "WINTER"], share: [" route1 ", "bad&"] }),
    ).toMatchObject({
      map: { key: "DEVIATION" },
      shareCode: "route1",
      invalidShare: false,
    });
    expect(getMapView({ scenario: "https://evil.example", share: 42 })).toMatchObject({
      map: { key: "MANIBUS" },
      shareCode: null,
      invalidShare: false,
    });
    expect(mapHref("MANIBUS", "not&valid")).toBe("/map?scenario=MANIBUS");
  });
});
