import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  PLANNER_CATEGORIES,
  PLANNER_MAX_ENTRIES,
  PLANNER_MAX_ROLLS,
  PLANNER_REFERENCE_CATALOG,
  PLANNER_SCHEMA_VERSION,
  createEmptyPlannerLoadout,
  getPlannerReferenceCatalog,
  getPlannerWarnings,
  type PlannerEntry,
  type PlannerLoadout,
} from "../src/model/planner";
import { parsePlannerLoadout, plannerLoadoutSchema } from "../src/validation/planner";
import { parseEvidenceCatalog } from "../src/model/evidence";

function entry(overrides: Partial<PlannerEntry> = {}): PlannerEntry {
  return {
    id: randomUUID(),
    category: "WEAPON",
    slotLabel: "",
    name: "직접 기록한 무기",
    linkedEntryId: null,
    reference: null,
    instance: { tier: null, stars: null, calibration: null, level: null, rolls: [] },
    notes: "",
    ...overrides,
  };
}

function loadout(entries: PlannerEntry[] = [entry()]): PlannerLoadout {
  return { ...createEmptyPlannerLoadout(), entries };
}

function referenced(): PlannerEntry {
  const reference = PLANNER_REFERENCE_CATALOG[0];
  return entry({
    category: reference.category,
    name: reference.name,
    reference: { recordId: reference.recordId, revision: reference.revision },
  });
}

describe("Planner unknown values and storage boundaries", () => {
  it("starts with an independent empty snapshot and unknown context", () => {
    const first = createEmptyPlannerLoadout();
    const second = createEmptyPlannerLoadout();
    expect(parsePlannerLoadout(first)).toEqual({
      schemaVersion: PLANNER_SCHEMA_VERSION,
      context: {
        gamePatch: null,
        scenarioKey: null,
        mode: null,
        platform: null,
        characterClass: null,
      },
      entries: [],
    });
    first.entries.push(entry());
    first.context.gamePatch = "user-recorded";
    expect(second.entries).toEqual([]);
    expect(second.context.gamePatch).toBeNull();
  });

  it.each(PLANNER_CATEGORIES)(
    "accepts manual %s records without a catalog or invented stats",
    (category) => {
      const parsed = parsePlannerLoadout(loadout([entry({ category })]));
      expect(parsed.entries[0].reference).toBeNull();
      expect(parsed.entries[0].instance).toEqual({
        tier: null,
        stars: null,
        calibration: null,
        level: null,
        rolls: [],
      });
    },
  );

  it("preserves explicit zero, signed rolls, and unknown units distinctly", () => {
    const item = entry();
    item.instance = {
      tier: 0,
      stars: null,
      calibration: null,
      level: 1234,
      rolls: [
        { label: "기록한 감소량", value: -12.5, unit: "PERCENT" },
        { label: "미확인", value: null, unit: null },
        { label: "명시한 0", value: 0, unit: null },
      ],
    };
    const parsed = parsePlannerLoadout(loadout([item]));
    expect(parsed.entries[0].instance).toEqual(item.instance);
    expect(getPlannerWarnings(parsed)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MANUAL_VALUES_UNVERIFIED", entryId: item.id }),
        expect.objectContaining({ code: "ROLL_UNIT_UNKNOWN", entryId: item.id }),
      ]),
    );
  });

  it("does not enforce unknown real-game maxima or synthesize totals", () => {
    const item = entry();
    item.instance.tier = 1000;
    item.instance.stars = 1000;
    expect(parsePlannerLoadout(loadout([item])).entries[0].instance.stars).toBe(1000);
    expect(parsePlannerLoadout(loadout([item]))).not.toHaveProperty("stats");
    expect(parsePlannerLoadout(loadout([item]))).not.toHaveProperty("dps");
    expect(getPlannerWarnings(loadout([item]))).toContainEqual(
      expect.objectContaining({ code: "COMPATIBILITY_UNVERIFIED" }),
    );
  });

  it.each(["12", Number.NaN, Infinity, -Infinity, -1, 0.5, 1_000_001])(
    "rejects invalid or out-of-storage-range integer values: %s",
    (value) => {
      const item = entry();
      Object.assign(item.instance, { tier: value });
      expect(() => parsePlannerLoadout(loadout([item]))).toThrow(z.ZodError);
    },
  );

  it.each([Number.NaN, Infinity, -Infinity, 1_000_000_001, -1_000_000_001, "3"])(
    "rejects non-finite, coerced, or oversized rolls: %s",
    (value) => {
      const item = entry();
      Object.assign(item.instance, { rolls: [{ label: "roll", value, unit: "FLAT" }] });
      expect(() => parsePlannerLoadout(loadout([item]))).toThrow(z.ZodError);
    },
  );

  it("bounds entries and rolls as storage policy, without fixed game slots", () => {
    const maximum = Array.from({ length: PLANNER_MAX_ENTRIES }, () => entry());
    expect(parsePlannerLoadout(loadout(maximum)).entries).toHaveLength(64);
    expect(() => parsePlannerLoadout(loadout([...maximum, entry()]))).toThrow();
    const item = entry();
    item.instance.rolls = Array.from({ length: PLANNER_MAX_ROLLS }, (_, i) => ({
      label: `roll ${i}`,
      value: null,
      unit: null,
    }));
    expect(parsePlannerLoadout(loadout([item])).entries[0].instance.rolls).toHaveLength(32);
    item.instance.rolls.push({ label: "overflow", value: null, unit: null });
    expect(() => parsePlannerLoadout(loadout([item]))).toThrow();
  });

  it("rejects aggregate UTF-8 payload overflow even within per-field limits", () => {
    const records = Array.from({ length: 64 }, () => {
      const item = entry({ notes: "한".repeat(1000) });
      item.instance.rolls = Array.from({ length: 32 }, () => ({
        label: "한".repeat(60),
        value: null,
        unit: null,
      }));
      return item;
    });
    expect(() => parsePlannerLoadout(loadout(records))).toThrow(/payload limit/);
    expect(plannerLoadoutSchema.safeParse(loadout(records)).success).toBe(false);
  });

  it("rejects original oversized whitespace before trimming", () => {
    const item = entry({ name: `${" ".repeat(600_000)}manual` });
    expect(() => parsePlannerLoadout(loadout([item]))).toThrow(/payload limit/);
  });

  it("rejects cyclic or non-JSON-safe objects with a controlled validation error", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => parsePlannerLoadout(cyclic)).toThrow(z.ZodError);
    expect(() => parsePlannerLoadout({ value: 1n })).toThrow(z.ZodError);
  });

  it("validates nullable context without inventing a scenario, mode, or class", () => {
    const snapshot = loadout();
    snapshot.context = {
      gamePatch: "manual patch label",
      scenarioKey: "WINTER",
      mode: "PVE",
      platform: "PC",
      characterClass: null,
    };
    expect(parsePlannerLoadout(snapshot).context).toEqual(snapshot.context);
    expect(() =>
      parsePlannerLoadout({ ...snapshot, context: { ...snapshot.context, scenarioKey: "FAKE" } }),
    ).toThrow();
  });

  it("does not mutate the caller's snapshot or retained older version", () => {
    const original = loadout();
    const retained = structuredClone(original);
    const parsed = parsePlannerLoadout(original);
    parsed.entries[0].name = "new edit";
    parsed.entries[0].instance.rolls.push({ label: "new roll", value: null, unit: null });
    expect(original).toEqual(retained);
  });
});

describe("Planner input whitelist", () => {
  it.each(["ownerId", "role", "onceHumanUid", "uid", "stats", "dps", "currentValidity"])(
    "rejects extra client-controlled %s fields",
    (key) => {
      expect(() => parsePlannerLoadout({ ...loadout(), [key]: "forged" })).toThrow();
      const item = entry();
      expect(() =>
        parsePlannerLoadout(loadout([Object.assign(item, { [key]: "forged" })])),
      ).toThrow();
    },
  );

  it("rejects forged provenance at every nested write boundary", () => {
    const item = referenced();
    Object.assign(item.reference!, { currentValidity: "VERIFIED", sourceGrade: "OFFICIAL" });
    expect(() => parsePlannerLoadout(loadout([item]))).toThrow();
    const manual = entry();
    Object.assign(manual.instance, { status: "OFFICIAL" });
    expect(() => parsePlannerLoadout(loadout([manual]))).toThrow();
    const roll = entry();
    Object.assign(roll.instance, {
      rolls: [{ label: "roll", value: 3, unit: "PERCENT", status: "OFFICIAL" }],
    });
    expect(() => parsePlannerLoadout(loadout([roll]))).toThrow();
  });

  it("rejects old snapshot tags, missing required fields, and oversized labels", () => {
    expect(() =>
      parsePlannerLoadout({ ...loadout(), schemaVersion: "uniz-loadout.v0.1" }),
    ).toThrow();
    expect(() => parsePlannerLoadout({ schemaVersion: PLANNER_SCHEMA_VERSION })).toThrow();
    expect(() => parsePlannerLoadout(loadout([entry({ name: " ".repeat(2) })]))).toThrow();
    expect(() => parsePlannerLoadout(loadout([entry({ slotLabel: "x".repeat(61) })]))).toThrow();
    expect(() => parsePlannerLoadout(loadout([entry({ notes: "x".repeat(1001) })]))).toThrow();
  });
});

describe("Planner entry linkage", () => {
  it("normalizes UUID case so aliases cannot bypass duplicate identity checks", () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const item = entry({ id: id.toUpperCase() });
    const linked = entry({ linkedEntryId: id });
    expect(parsePlannerLoadout(loadout([item, linked])).entries[0].id).toBe(id);
    expect(() => parsePlannerLoadout(loadout([item, entry({ id })]))).toThrow(/unique/);
  });

  it("permits structural links without claiming game compatibility", () => {
    const weapon = entry();
    const mod = entry({ category: "MOD", linkedEntryId: weapon.id });
    const parsed = parsePlannerLoadout(loadout([weapon, mod]));
    expect(parsed.entries[1].linkedEntryId).toBe(weapon.id);
    expect(getPlannerWarnings(parsed)).toContainEqual(
      expect.objectContaining({ code: "LINK_COMPATIBILITY_UNVERIFIED", entryId: mod.id }),
    );
  });

  it("rejects duplicate identities, self-links, and dangling targets", () => {
    const item = entry();
    expect(() => parsePlannerLoadout(loadout([item, { ...item }]))).toThrow(/unique/);
    expect(() => parsePlannerLoadout(loadout([{ ...item, linkedEntryId: item.id }]))).toThrow(
      /itself/,
    );
    expect(() => parsePlannerLoadout(loadout([{ ...item, linkedEntryId: randomUUID() }]))).toThrow(
      /target/,
    );
  });

  it("rejects both short cycles and cycles downstream of another entry", () => {
    const a = entry();
    const b = entry({ linkedEntryId: a.id });
    a.linkedEntryId = b.id;
    expect(() => parsePlannerLoadout(loadout([a, b]))).toThrow(/cycle/);
    const upstream = entry({ linkedEntryId: a.id });
    expect(() => parsePlannerLoadout(loadout([upstream, a, b]))).toThrow(/cycle/);
  });
});

describe("Historical ITEM references", () => {
  it("exposes twelve frozen item names with current validity UNVERIFIED", () => {
    expect(getPlannerReferenceCatalog()).toBe(PLANNER_REFERENCE_CATALOG);
    expect(PLANNER_REFERENCE_CATALOG).toHaveLength(12);
    expect(Object.isFrozen(PLANNER_REFERENCE_CATALOG)).toBe(true);
    for (const item of PLANNER_REFERENCE_CATALOG) {
      expect(Object.isFrozen(item)).toBe(true);
      expect(item.currentValidity).toBe("UNVERIFIED");
      expect(item).not.toHaveProperty("stats");
      expect(item.revision).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it("accepts exact catalog identity and retains unknown instance values", () => {
    const item = referenced();
    const parsed = parsePlannerLoadout(loadout([item]));
    expect(parsed.entries[0]).toEqual(item);
    expect(parsed.entries[0].instance.tier).toBeNull();
    expect(getPlannerWarnings(parsed)).toContainEqual(
      expect.objectContaining({ code: "HISTORICAL_REFERENCE", entryId: item.id }),
    );
  });

  it("rejects mismatched category, name, identity, and unsupported revision on save", () => {
    const item = referenced();
    expect(() => parsePlannerLoadout(loadout([{ ...item, category: "FOOD" }]))).toThrow(/Category/);
    expect(() =>
      parsePlannerLoadout(loadout([{ ...item, name: "borrowed verified item name" }])),
    ).toThrow(/Name/);
    expect(() =>
      parsePlannerLoadout(
        loadout([{ ...item, reference: { ...item.reference!, recordId: "unknown" } }]),
      ),
    ).toThrow(/reference/);
    const old = {
      ...item,
      reference: { ...item.reference!, revision: `sha256:${"0".repeat(64)}` },
    };
    expect(plannerLoadoutSchema.safeParse(loadout([old])).success).toBe(true);
    expect(() => parsePlannerLoadout(loadout([old]))).toThrow(/revision/);
  });

  it.each([
    "eq-mod-field-guide-system",
    "eq-gear-calibration-system",
    "eq-cradle-override-system",
    "eq-treacherous-tides-20260916",
    "target-test-dummy-history",
    "evidence-ghost-link-overload-v3-0-1",
  ])("does not equip SYSTEM/SET/TARGET/EFFECT record %s", (recordId) => {
    expect(PLANNER_REFERENCE_CATALOG.some((item) => item.recordId === recordId)).toBe(false);
    const item = referenced();
    expect(() =>
      parsePlannerLoadout(loadout([{ ...item, reference: { ...item.reference!, recordId } }])),
    ).toThrow();
  });

  it("supports caller-owned immutable revision catalogs without updating old labels", () => {
    const item = referenced();
    const previous = { ...PLANNER_REFERENCE_CATALOG[0], revision: `sha256:${"0".repeat(64)}` };
    item.reference = { recordId: previous.recordId, revision: previous.revision };
    expect(parsePlannerLoadout(loadout([item]), [previous]).entries[0].name).toBe(previous.name);
  });

  it("pins each revision to exact evidence and source content; renamed records need a new revision", () => {
    function canonical(input: unknown): string {
      if (Array.isArray(input)) return `[${input.map(canonical).join(",")}]`;
      if (input !== null && typeof input === "object") {
        const object = input as Record<string, unknown>;
        return `{${Object.keys(object)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
          .join(",")}}`;
      }
      return JSON.stringify(input);
    }
    const catalogs = [
      "equipment-evidence.json",
      "effects-evidence.json",
      "target-evidence.json",
    ].map((file) =>
      parseEvidenceCatalog(
        JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), "utf8")),
        "2026-10-07",
      ),
    );
    for (const item of PLANNER_REFERENCE_CATALOG) {
      const catalog = catalogs.find((source) =>
        source.samples.some((sample) => sample.id === item.recordId),
      )!;
      const sample = catalog.samples.find((record) => record.id === item.recordId)!;
      const ids = new Set(sample.fields.flatMap((field) => field.sourceIds));
      const sources = catalog.sources
        .filter((source) => ids.has(source.id))
        .sort((a, b) => a.id.localeCompare(b.id));
      const payload = {
        schemaVersion: catalog.schemaVersion,
        kind: catalog.kind,
        checkedAt: catalog.checkedAt,
        sample,
        sources,
      };
      const revision = `sha256:${createHash("sha256").update(canonical(payload)).digest("hex")}`;
      expect(item.revision).toBe(revision);
      expect(item.name).toBe(sample.name);
      expect(item.sourceUrl).toBe(
        catalog.sources.find(
          (source) =>
            source.id === sample.fields.find((field) => field.path === "name")!.sourceIds[0],
        )!.url,
      );
      const renamed = { ...payload, sample: { ...sample, name: "different name" } };
      expect(`sha256:${createHash("sha256").update(canonical(renamed)).digest("hex")}`).not.toBe(
        item.revision,
      );
    }
  });
});
