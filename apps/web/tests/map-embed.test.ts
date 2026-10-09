import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { getMapView } from "../src/lib/map-navigation";

const boundary = vi.hoisted(() => ({ push: vi.fn(), copy: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: boundary.push }) }));
vi.mock("@/lib/map-navigation", () => import("../src/lib/map-navigation"));
vi.mock("@/lib/map-farming", () => import("../src/lib/map-farming"));
vi.mock("@/components/user-preferences-provider", async () => {
  const { DEFAULT_USER_PREFERENCES } = await import("../src/lib/user-preferences");
  return { useUserPreferences: () => ({ preferences: DEFAULT_USER_PREFERENCES }) };
});
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (value: unknown) => [value, vi.fn()],
  useRef: () => ({ current: null }),
  useEffect: vi.fn(),
}));
import { MapEmbed } from "../src/components/map-embed";

type Element = ReactElement<Record<string, unknown>>;
function nodes(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const item = node as Element;
  return [item, ...nodes(item.props.children)];
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Element).props.children);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("navigator", { clipboard: { writeText: boundary.copy } });
  vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:3000" } });
});
describe("interactive map controls", () => {
  it("uses one silo selector and opens distinct reward links from the adjacent list", () => {
    const elements = nodes(
      MapEmbed({ view: getMapView({ scenario: "ENDLESS_DREAM", location: "locations-silos" }) }),
    );
    const select = elements.find(
      (item) => item.type === "select" && item.props.name === "location",
    )!;
    const siloOptions = nodes(select.props.children).filter(
      (item) => item.type === "option" && String(item.props.value).includes("silo"),
    );
    expect(siloOptions.map((item) => item.props.value)).toEqual(["locations-silos"]);
    const nav = elements.find(
      (item) => item.type === "nav" && item.props["aria-label"] === "개별 사일로 선택",
    )!;
    const links = nodes(nav.props.children).filter((item) => typeof item.props.href === "string");
    expect(links).toHaveLength(10);
    expect(links.map((item) => item.props.href)).toContain(
      "/map?scenario=ENDLESS_DREAM&location=silo-theta-manibus",
    );
    const focused = nodes(
      MapEmbed({ view: getMapView({ scenario: "ENDLESS_DREAM", location: "silo-alpha-manibus" }) }),
    );
    expect(
      focused.find((item) => item.type === "select" && item.props.name === "location")?.props.value,
    ).toBe("locations-silos");
  });
  it("switches the scenario without carrying the previous map's share code", () => {
    const view = getMapView({ scenario: "MANIBUS", share: "route1" });
    const elements = nodes(MapEmbed({ view }));
    const select = elements.find((item) => item.type === "select")!;
    (select.props.onChange as (event: unknown) => void)({ target: { value: "WINTER" } });
    expect(boundary.push).toHaveBeenCalledWith("/map?scenario=WINTER", { scroll: false });
    expect(nodes(select.props.children).filter((item) => item.type === "option")).toHaveLength(4);
    expect(elements.find((item) => item.type === "form")?.props).toMatchObject({
      action: "/map",
      method: "get",
    });
  });
  it("switches farming targets, clears them, and retains them when changing scenario", () => {
    const view = getMapView({ scenario: "MANIBUS", target: "dr-teddy" });
    const elements = nodes(MapEmbed({ view }));
    const targetSelect = elements.find(
      (item) => item.type === "select" && item.props.name === "target",
    )!;
    (targetSelect.props.onChange as (event: unknown) => void)({ target: { value: "dr-teddy" } });
    expect(boundary.push).toHaveBeenLastCalledWith("/map?scenario=MANIBUS&target=dr-teddy", {
      scroll: false,
    });
    (targetSelect.props.onChange as (event: unknown) => void)({ target: { value: "" } });
    expect(boundary.push).toHaveBeenLastCalledWith("/map?scenario=MANIBUS", { scroll: false });
    const scenarioSelect = elements.find(
      (item) => item.type === "select" && item.props.name === "scenario",
    )!;
    (scenarioSelect.props.onChange as (event: unknown) => void)({ target: { value: "WINTER" } });
    expect(boundary.push).toHaveBeenLastCalledWith("/map?scenario=WINTER&target=dr-teddy", {
      scroll: false,
    });
  });
  it("copies the current local route and visibly attributes the original shared TH.GL map", async () => {
    const view = getMapView({ scenario: "ENDLESS_DREAM", share: "route1" });
    const elements = nodes(MapEmbed({ view }));
    const button = elements.find(
      (item) => item.type === "button" && text(item.props.children).includes("지도 링크 복사"),
    )!;
    await (button.props.onClick as () => Promise<void>)();
    expect(boundary.copy).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/map?scenario=ENDLESS_DREAM&share=route1",
    );
    const links = elements.filter((item) => item.type === "a");
    expect(links).toHaveLength(2);
    expect(
      links.every(
        (item) => item.props.href === view.originalUrl && item.props.rel === "noopener noreferrer",
      ),
    ).toBe(true);
    expect(text(elements.map((item) => item.props.children))).toContain("Interactive map by TH.GL");
  });
  it("copies the exact farming target instead of an unfiltered map", async () => {
    const view = getMapView({ scenario: "ENDLESS_DREAM", target: "butterfly" });
    const button = nodes(MapEmbed({ view })).find(
      (item) => item.type === "button" && text(item.props.children).includes("지도 링크 복사"),
    )!;
    await (button.props.onClick as () => Promise<void>)();
    expect(boundary.copy).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/map?scenario=ENDLESS_DREAM&target=butterfly",
    );
  });
});
