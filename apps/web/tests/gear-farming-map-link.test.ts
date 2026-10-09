import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { GearCatalogItem } from "@uniz/build-engine";

const boundary = vi.hoisted(() => ({ mapLink: vi.fn() }));
vi.mock("@/lib/map-farming", () => ({ getFarmingMapLink: boundary.mapLink }));
vi.mock("next/link", () => ({ default: "Link" }));
vi.mock("next/image", () => ({ default: "Image" }));

import { GearFarmingMapLink } from "../src/components/build-planner/gear-farming-map-link";
import { GearItemInfo } from "../src/components/build-planner/gear-catalog-picker";
import { GEAR_CATALOG } from "@uniz/build-engine";

type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node && typeof node === "object" && "props" in node
    ? text((node as Element).props.children)
    : "";
}

beforeEach(() => {
  boundary.mapLink.mockReset().mockReturnValue(null);
});

describe("verified build farming entry points", () => {
  it("preserves an unsupported or unknown lookup as no link", () => {
    expect(
      GearFarmingMapLink({ kind: "deviant", id: "unknown", scenario: "DEVIATION" }),
    ).toBeNull();
    expect(boundary.mapLink).toHaveBeenCalledWith({
      kind: "deviant",
      id: "unknown",
      name: undefined,
      scenario: "DEVIATION",
    });
  });

  it("opens the verified item and scenario in a separate tab without prefetching or mutation", () => {
    const href = "/map?scenario=WINTER&target=animal-wolf";
    boundary.mapLink.mockReturnValue({ href, label: "지도에서 찾기" });
    const tree = GearFarmingMapLink({
      kind: "material",
      id: "animal-source-id",
      name: "늑대",
      scenario: "WINTER",
    }) as Element;
    const link = elements(tree).find((element) => element.type === "Link")!;
    expect(link.props).toMatchObject({
      href,
      target: "_blank",
      rel: "noopener noreferrer",
      prefetch: false,
      "aria-label": "늑대 · 지도에서 찾기 · 새 탭에서 열기",
    });
    expect(link.props).not.toHaveProperty("onClick");
    expect(boundary.mapLink).toHaveBeenCalledWith({
      kind: "material",
      id: "animal-source-id",
      name: "늑대",
      scenario: "WINTER",
    });
  });

  it("keeps the helper's chosen map visible when the build has no scenario", () => {
    boundary.mapLink.mockReturnValue({
      href: "/map?scenario=MANIBUS&target=animal-wolf",
      label: "지도에서 찾기 · 땃쥐",
    });
    const tree = GearFarmingMapLink({ kind: "material", id: "animal-source-id", scenario: null });
    expect(text(tree)).toContain("지도에서 찾기 · 땃쥐");
    expect(boundary.mapLink.mock.calls[0][0].scenario).toBeNull();
  });

  it("offers a map entry before opening fusion only for a selected deviant", () => {
    const deviant = GEAR_CATALOG.find((item) => item.kind === "DEVIANT")!;
    const tree = GearItemInfo({ item: deviant as GearCatalogItem, scenario: "ENDLESS_DREAM" });
    const links = elements(tree).filter((item) => item.type === GearFarmingMapLink);
    expect(links).toHaveLength(1);
    expect(links[0].props).toMatchObject({
      kind: "deviant",
      id: deviant.id,
      scenario: "ENDLESS_DREAM",
    });
    const weapon = GEAR_CATALOG.find((item) => item.kind === "WEAPON")!;
    expect(
      elements(GearItemInfo({ item: weapon as GearCatalogItem, scenario: "WINTER" })).some(
        (item) => item.type === GearFarmingMapLink,
      ),
    ).toBe(false);
  });
});
