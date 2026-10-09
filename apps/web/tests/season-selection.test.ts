import { describe, expect, it } from "vitest";
import {
  labelScenario,
  resolveSeasonServerSelection,
  type SeasonSelectionCatalog,
} from "../src/lib/season-selection";

const catalog: SeasonSelectionCatalog = {
  scenarios: [
    { id: "deviation", slug: "deviation", name: "Old Deviation label" },
    { id: "dream", slug: "endless-dream", name: "Old Dream label" },
  ],
  servers: [
    { id: "dream-0070", scenarioId: "dream", name: "E_Dream-X0070", region: "한국" },
    { id: "deviation-0007", scenarioId: "deviation", name: "Deviation-X0007", region: "한국" },
  ],
};

describe("registered season server selection", () => {
  it("initializes both screens from the first registered server, preserving its leading zeros", () => {
    const soleRegisteredServer = { ...catalog, servers: catalog.servers.slice(0, 1) };
    expect(resolveSeasonServerSelection(soleRegisteredServer)).toEqual({
      scenarioId: "dream",
      serverId: "dream-0070",
      scenarioKey: "ENDLESS_DREAM",
      serverNumber: "0070",
      region: "한국",
    });
    expect(resolveSeasonServerSelection(soleRegisteredServer, "dream-0070")).toEqual(
      resolveSeasonServerSelection(soleRegisteredServer),
    );
  });

  it("uses an explicit registered server and its associated scenario rather than scenario order", () => {
    expect(resolveSeasonServerSelection(catalog, "deviation-0007")).toEqual({
      scenarioId: "deviation",
      serverId: "deviation-0007",
      scenarioKey: "DEVIATION",
      serverNumber: "0007",
      region: "한국",
    });
  });

  it.each(["deleted-server", ""])(
    "does not silently switch a stale explicit selection %j to a different server",
    (serverId) => {
      expect(resolveSeasonServerSelection(catalog, serverId)).toBeNull();
    },
  );

  it("returns no selection when no server is registered or its scenario is missing", () => {
    expect(resolveSeasonServerSelection({ ...catalog, servers: [] })).toBeNull();
    expect(resolveSeasonServerSelection({ ...catalog, scenarios: [] })).toBeNull();
  });

  it.each([
    "E_Dream-X70",
    "E_Dream-X00700",
    "E_Dream-X００７０",
    "E_Dream-X0070\n",
    "Manibus-X0070",
    " E_Dream-X0070",
    "Historical server",
  ])(
    "preserves a legacy or unmatched server %j without manufacturing a canonical address",
    (name) => {
      expect(
        resolveSeasonServerSelection({
          ...catalog,
          servers: [{ ...catalog.servers[0], name }],
        }),
      ).toEqual({
        scenarioId: "dream",
        serverId: "dream-0070",
        scenarioKey: null,
        serverNumber: null,
        region: "한국",
      });
    },
  );

  it("preserves an unknown historical scenario and server, including an absent region", () => {
    expect(
      resolveSeasonServerSelection({
        scenarios: [{ id: "legacy", slug: "historic-scenario", name: "Historical scenario" }],
        servers: [{ id: "old-server", scenarioId: "legacy", name: "E_Dream-X0070", region: null }],
      }),
    ).toEqual({
      scenarioId: "legacy",
      serverId: "old-server",
      scenarioKey: null,
      serverNumber: null,
      region: "",
    });
  });
});

describe("consistent scenario display labels", () => {
  it.each([
    ["deviation", "비정상수용(Deviation)"],
    ["manibus", "땃쥐(Manibus)"],
    ["the-way-of-winter", "설산(The Way Of Winter)"],
    ["endless-dream", "무한의 꿈(Endless Dream)"],
  ])("shows the requested label for known scenario %s", (slug, label) => {
    expect(labelScenario({ slug, name: "Previously stored label" })).toBe(label);
  });

  it("keeps the saved label for an unknown historical scenario", () => {
    expect(labelScenario({ slug: "historic-scenario", name: "Historical scenario" })).toBe(
      "Historical scenario",
    );
  });
});
