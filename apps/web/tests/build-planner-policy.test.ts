import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createEmptyPlannerLoadout,
  createEmptyGearLoadout,
  createGearSelection,
  PLANNER_MAX_PAYLOAD_BYTES,
  GEAR_SCHEMA_VERSION,
  GEAR_CATALOG,
  parseVersionedPlannerSnapshot,
} from "@uniz/build-engine";
import type { CurrentUser } from "../src/lib/auth-policy";
import {
  assertBuildOwner,
  BuildPlannerError,
  buildPlannerErrors,
  canReadPlannerBuild,
  nextBuildTimestamp,
  parseBuildPlannerMutation,
  requireBuildActor,
} from "../src/lib/build-planner-policy";

const owner: CurrentUser = { id: randomUUID(), name: "Owner", role: "MEMBER", isMock: false };
const officer: CurrentUser = { id: randomUUID(), name: "Officer", role: "OFFICER", isMock: false };
const savedAt = new Date("2026-10-06T12:00:00.000Z");
const save = () => ({
  action: "SAVE_BUILD",
  title: "Recorded build",
  description: "",
  visibility: "PRIVATE",
  loadout: createEmptyPlannerLoadout(),
  notes: "",
});
const build = (visibility: "PRIVATE" | "HIVE" | "PUBLIC", archivedAt: Date | null = null) => ({
  ownerId: owner.id,
  visibility,
  archivedAt,
  updatedAt: savedAt,
});

describe("Build Planner ownership and immutable-save boundaries", () => {
  it("saves two distinct foods and two distinct drinks for Chef with trusted names", () => {
    const loadout = createEmptyGearLoadout();
    loadout.context.characterClass = "셰프";
    loadout.consumables = {
      foodIds: ["consumable-30110345", "consumable-30110330"],
      drinkIds: ["consumable-30110401", "consumable-30110344"],
      notes: "사슴고기로 제작한 요리 사용",
    };
    loadout.catalogNames = { "consumable-30110345": "Forged food name" };
    const before = structuredClone(loadout);
    const parsed = parseBuildPlannerMutation({ ...save(), loadout });
    if (parsed.action !== "SAVE_BUILD" || parsed.loadout.schemaVersion !== GEAR_SCHEMA_VERSION)
      throw new Error("Expected gear save");
    expect(parsed.loadout.consumables).toEqual(loadout.consumables);
    expect(parsed.loadout.catalogNames).toMatchObject({
      "consumable-30110345": "부서진 빵",
      "consumable-30110401": "기상천외 드링크",
    });
    expect(loadout).toEqual(before);
  });

  it.each(["foodIds", "drinkIds"] as const)(
    "does not pool unused general-class allowances into %s at the save boundary",
    (kind) => {
      const loadout = createEmptyGearLoadout();
      loadout.context.characterClass = "정원사";
      loadout.consumables = {
        foodIds: kind === "foodIds" ? ["consumable-30110345", "consumable-30110330"] : [],
        drinkIds: kind === "drinkIds" ? ["consumable-30110401", "consumable-30110344"] : [],
        notes: "",
      };
      expect(() => parseBuildPlannerMutation({ ...save(), loadout })).toThrow(
        buildPlannerErrors.CONSUMABLE_LIMIT,
      );
      loadout.consumables[kind].pop();
      expect(() => parseBuildPlannerMutation({ ...save(), loadout })).not.toThrow();
    },
  );

  it("rejects duplicate, wrong-kind and fabricated doping IDs in direct save payloads", () => {
    const loadout = createEmptyGearLoadout();
    loadout.context.characterClass = "셰프";
    for (const foodIds of [
      ["consumable-30110345", "consumable-30110345"],
      ["consumable-30110401"],
      ["invented-food"],
    ]) {
      loadout.consumables = { foodIds, drinkIds: [], notes: "" };
      expect(() => parseBuildPlannerMutation({ ...save(), loadout })).toThrow(BuildPlannerError);
    }
  });

  it("rejects same-icon traits in direct save payloads while keeping historical snapshots readable", () => {
    const loadout = createEmptyGearLoadout();
    const deviant = createGearSelection("combatDeviant", "deviant-butterfly");
    deviant.traitIds = ["deviant-trait-400023", "deviant-trait-power-reversal-2"];
    loadout.slots.push(deviant);
    loadout.catalogNames = {
      "deviant-trait-400023": "서로 다른 아이콘이라고 주장하는 클라이언트 이름",
      "deviant-trait-power-reversal-2": "다른 종류라는 클라이언트 이름",
    };
    const before = structuredClone(loadout);
    expect(parseVersionedPlannerSnapshot(GEAR_SCHEMA_VERSION, loadout)).not.toBeNull();
    expect(() => parseBuildPlannerMutation({ ...save(), loadout })).toThrow(
      buildPlannerErrors.TRAIT_ICON_LIMIT,
    );
    expect(loadout).toEqual(before);
    deviant.traitIds.pop();
    loadout.catalogNames = {};
    expect(() => parseBuildPlannerMutation({ ...save(), loadout })).not.toThrow();
  });

  it("rejects two shiny traits at the server boundary even when their icon groups differ", () => {
    const star = GEAR_CATALOG.find((item) => item.id === "deviant-trait-300114")!;
    const yarn = GEAR_CATALOG.find((item) => item.id === "deviant-trait-400102")!;
    expect(star.isDeviantShinyTrait).toBe(true);
    expect(yarn.isDeviantShinyTrait).toBe(true);
    expect(star.traitIconGroup).not.toBe(yarn.traitIconGroup);
    const loadout = createEmptyGearLoadout();
    const deviant = createGearSelection("combatDeviant", "deviant-99000047");
    deviant.traitIds = [star.id, yarn.id];
    loadout.slots.push(deviant);
    expect(() => parseBuildPlannerMutation({ ...save(), loadout })).toThrow(
      buildPlannerErrors.TRAIT_SHINY_LIMIT,
    );
    deviant.traitIds = [yarn.id];
    expect(() => parseBuildPlannerMutation({ ...save(), loadout })).not.toThrow();
  });

  it("accepts an appearance trait together with a distinct fusion trait through the real save boundary", () => {
    const loadout = createEmptyGearLoadout();
    const deviant = createGearSelection("combatDeviant", "deviant-butterfly");
    deviant.traitIds = [
      "deviant-trait-weakspot-master-lavender-blue",
      "deviant-trait-moonlight-ambush",
    ];
    loadout.slots.push(deviant);
    const parsed = parseBuildPlannerMutation({ ...save(), loadout });
    if (parsed.action !== "SAVE_BUILD" || parsed.loadout.schemaVersion !== GEAR_SCHEMA_VERSION)
      throw new Error("Expected gear save");
    expect(parsed.loadout.slots[0].traitIds).toEqual(deviant.traitIds);
    expect(parsed.loadout.catalogNames?.[deviant.traitIds[1]]).toBe("달빛 습격");
  });

  it("accepts inherited animal fusion on the Doll together with Yarn and God Gunner", () => {
    const loadout = createEmptyGearLoadout();
    const deviant = createGearSelection("combatDeviant", "deviant-99000047");
    deviant.traitIds = [
      "deviant-trait-400102",
      "deviant-trait-300010",
      "deviant-trait-moonlight-ambush",
    ];
    loadout.slots.push(deviant);
    const before = structuredClone(loadout);
    const parsed = parseBuildPlannerMutation({ ...save(), loadout });
    if (parsed.action !== "SAVE_BUILD" || parsed.loadout.schemaVersion !== GEAR_SCHEMA_VERSION)
      throw new Error("Expected gear save");
    expect(parsed.loadout.slots[0].traitIds).toEqual(deviant.traitIds);
    expect(parsed.loadout.catalogNames?.["deviant-trait-moonlight-ambush"]).toBe("달빛 습격");
    expect(loadout).toEqual(before);
  });

  it("rejects animal plus furniture fusion with the same icon through direct save payloads", () => {
    const moonlight = GEAR_CATALOG.find((item) => item.id === "deviant-trait-moonlight-ambush")!;
    const precision = GEAR_CATALOG.find((item) => item.id === "deviant-trait-1100011")!;
    expect(moonlight.traitFusionMaterialType).toBe("ANIMAL");
    expect(precision.traitFusionMaterialType).toBe("FURNITURE");
    expect(moonlight.traitIconGroup).toBe(precision.traitIconGroup);
    const loadout = createEmptyGearLoadout();
    const deviant = createGearSelection("combatDeviant", "deviant-99000047");
    deviant.traitIds = [moonlight.id, precision.id];
    loadout.slots.push(deviant);
    expect(() => parseBuildPlannerMutation({ ...save(), loadout })).toThrow(
      buildPlannerErrors.TRAIT_ICON_LIMIT,
    );
    deviant.traitIds = [moonlight.id];
    expect(() => parseBuildPlannerMutation({ ...save(), loadout })).not.toThrow();
  });

  it("does not widen species-specific shiny traits when fusion inheritance is enabled", () => {
    const loadout = createEmptyGearLoadout();
    const deviant = createGearSelection("combatDeviant", "deviant-99000047");
    deviant.traitIds = [
      "deviant-trait-weakspot-master-lavender-blue",
      "deviant-trait-moonlight-ambush",
    ];
    loadout.slots.push(deviant);
    expect(() => parseBuildPlannerMutation({ ...save(), loadout })).toThrow(
      buildPlannerErrors.INVALID_INPUT,
    );
    deviant.traitIds = ["deviant-trait-400102", "deviant-trait-moonlight-ambush"];
    expect(() => parseBuildPlannerMutation({ ...save(), loadout })).not.toThrow();
  });

  it("rejects multiple core armors at the server save boundary while historical versions remain readable", () => {
    const gloves = GEAR_CATALOG.find(
      (item) =>
        item.kind === "ARMOR" &&
        !item.legacyOnly &&
        item.isKeyArmor &&
        item.allowedSlots.includes("gloves"),
    )!;
    const shoes = GEAR_CATALOG.find(
      (item) =>
        item.kind === "ARMOR" &&
        !item.legacyOnly &&
        item.isKeyArmor &&
        item.allowedSlots.includes("shoes"),
    )!;
    const loadout = createEmptyGearLoadout();
    loadout.slots = [
      createGearSelection("gloves", gloves.id),
      createGearSelection("shoes", shoes.id),
    ];
    expect(parseVersionedPlannerSnapshot(GEAR_SCHEMA_VERSION, loadout)).not.toBeNull();
    expect(() => parseBuildPlannerMutation({ ...save(), loadout })).toThrow("핵심 방어구는 1개만");
    loadout.slots.pop();
    expect(() => parseBuildPlannerMutation({ ...save(), loadout })).not.toThrow();
  });
  it("accepts V2 gear through the real save boundary and replaces forged display names", () => {
    const loadout = createEmptyGearLoadout();
    loadout.slots.push(createGearSelection("primary", "weapon-p90-holographic-resonance"));
    loadout.catalogNames = { "weapon-p90-holographic-resonance": "untrusted label" };
    const parsed = parseBuildPlannerMutation({ ...save(), loadout });
    if (parsed.action !== "SAVE_BUILD" || parsed.loadout.schemaVersion !== GEAR_SCHEMA_VERSION)
      throw new Error("Expected gear save");
    expect(parsed.loadout.catalogNames?.["weapon-p90-holographic-resonance"]).toBe(
      "P90-홀로그램 공명",
    );
    expect(parsed.loadout.recommendation.rating).toBeNull();
  });

  it("rejects a client-forged accessory and unsupported schema through the save boundary", () => {
    const loadout = createEmptyGearLoadout();
    const weapon = createGearSelection("primary", "weapon-p90-holographic-resonance");
    weapon.attachments.muzzle = "accessory-compact-reflex-sight";
    loadout.slots.push(weapon);
    expect(() => parseBuildPlannerMutation({ ...save(), loadout })).toThrow(BuildPlannerError);
    expect(() =>
      parseBuildPlannerMutation({ ...save(), loadout: { ...loadout, schemaVersion: "future.v3" } }),
    ).toThrow(BuildPlannerError);
  });
  it.each(["MEMBER", "OFFICER", "ADMIN"] as const)(
    "allows approved %s identity without granting another owner's edits",
    (role) => {
      const actor = { ...owner, role };
      expect(requireBuildActor(actor)).toBe(actor);
      expect(() => assertBuildOwner(actor, build("PRIVATE"), savedAt.toISOString())).not.toThrow();
      expect(() =>
        assertBuildOwner({ ...officer, role }, build("PRIVATE"), savedAt.toISOString()),
      ).toThrow(BuildPlannerError);
    },
  );

  it.each(["GUEST", "APPLICANT"] as const)("denies %s save authorization", (role) => {
    expect(() => requireBuildActor({ ...owner, role })).toThrow(BuildPlannerError);
    expect(canReadPlannerBuild({ ...owner, role }, build("PRIVATE"))).toBe(false);
    expect(canReadPlannerBuild({ ...owner, role }, build("HIVE"))).toBe(false);
  });

  it("denies anonymous, Mock and demo-prefixed saves", () => {
    expect(() => requireBuildActor(null)).toThrow(BuildPlannerError);
    expect(() => requireBuildActor({ ...owner, isMock: true })).toThrow(BuildPlannerError);
    expect(() => requireBuildActor({ ...owner, id: "demo-admin", role: "ADMIN" })).toThrow(
      BuildPlannerError,
    );
  });

  it("requires an approved publication for shared reads and keeps archived records owner-only", () => {
    expect(canReadPlannerBuild(null, build("PUBLIC"))).toBe(false);
    expect(canReadPlannerBuild(null, { ...build("PRIVATE"), approvedVisibility: "PUBLIC" })).toBe(
      true,
    );
    expect(canReadPlannerBuild(null, build("HIVE"))).toBe(false);
    expect(canReadPlannerBuild(officer, build("HIVE"))).toBe(false);
    expect(canReadPlannerBuild(officer, { ...build("PRIVATE"), approvedVisibility: "HIVE" })).toBe(
      true,
    );
    expect(canReadPlannerBuild(null, { ...build("PRIVATE"), approvedVisibility: "HIVE" })).toBe(
      false,
    );
    expect(canReadPlannerBuild(officer, build("PRIVATE"))).toBe(false);
    expect(canReadPlannerBuild(owner, build("PRIVATE"))).toBe(true);
    expect(canReadPlannerBuild(null, build("PUBLIC", savedAt))).toBe(false);
    expect(canReadPlannerBuild(officer, build("PUBLIC", savedAt))).toBe(false);
    expect(canReadPlannerBuild(owner, build("PUBLIC", savedAt))).toBe(true);
  });
  it("validates rich content and canonical video independently from immutable gear snapshots", () => {
    const bodyDocument = {
      schemaVersion: "uniz-content.v1",
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Description mirror", marks: [{ type: "bold" }] }],
        },
      ],
    };
    const result = parseBuildPlannerMutation({
      ...save(),
      description: "Forged mirror",
      bodyDocument,
      youtubeUrl: "https://youtu.be/dQw4w9WgXcQ?t=1m",
    });
    expect(result).toMatchObject({
      description: "Description mirror",
      bodyDocument,
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=60s",
    });
    expect(() =>
      parseBuildPlannerMutation({
        ...save(),
        bodyDocument: {
          ...bodyDocument,
          content: [
            {
              type: "image",
              attrs: { imageId: randomUUID(), alt: "", src: "https://tracker.invalid/image" },
            },
          ],
        },
      }),
    ).toThrow(BuildPlannerError);
    expect(() =>
      parseBuildPlannerMutation({
        ...save(),
        youtubeUrl: "https://youtube.com.invalid/watch?v=dQw4w9WgXcQ",
      }),
    ).toThrow(BuildPlannerError);
    expect(() =>
      parseBuildPlannerMutation({
        ...save(),
        bodyDocument: {
          ...bodyDocument,
          content: [{ type: "paragraph", content: [{ type: "text", text: "a".repeat(5001) }] }],
        },
      }),
    ).toThrow(BuildPlannerError);
  });

  it("rejects stale editors and archived owner edits", () => {
    expect(() => assertBuildOwner(owner, build("PRIVATE"), "2026-10-06T11:59:59.999Z")).toThrow(
      BuildPlannerError,
    );
    expect(() => assertBuildOwner(owner, build("PUBLIC", savedAt), savedAt.toISOString())).toThrow(
      BuildPlannerError,
    );
  });

  it("permits restore ownership checks only for the archived owner", () => {
    expect(() =>
      assertBuildOwner(owner, build("PUBLIC", savedAt), savedAt.toISOString(), true),
    ).not.toThrow();
    expect(() =>
      assertBuildOwner(officer, build("PUBLIC", savedAt), savedAt.toISOString(), true),
    ).toThrow(BuildPlannerError);
  });

  it("advances a version timestamp even within the same millisecond or under a reversed clock", () => {
    expect(nextBuildTimestamp(savedAt, savedAt).getTime()).toBe(savedAt.getTime() + 1);
    expect(nextBuildTimestamp(savedAt, new Date(savedAt.getTime() - 1000)).getTime()).toBe(
      savedAt.getTime() + 1,
    );
  });

  it("requires existing ID and saved timestamp together and rejects client identity fields", () => {
    expect(() => parseBuildPlannerMutation({ ...save(), buildId: randomUUID() })).toThrow(
      BuildPlannerError,
    );
    expect(() =>
      parseBuildPlannerMutation({ ...save(), expectedUpdatedAt: savedAt.toISOString() }),
    ).toThrow(BuildPlannerError);
    for (const field of ["ownerId", "role", "uid", "version"]) {
      expect(() => parseBuildPlannerMutation({ ...save(), [field]: owner.id })).toThrow(
        BuildPlannerError,
      );
    }
  });

  it("bounds serialized input before parsing and safely rejects circular input", () => {
    expect(() =>
      parseBuildPlannerMutation({
        ...save(),
        description: "x".repeat(PLANNER_MAX_PAYLOAD_BYTES + 1),
      }),
    ).toThrow(BuildPlannerError);
    const circular: { value?: unknown } = {};
    circular.value = circular;
    expect(() => parseBuildPlannerMutation(circular)).toThrow(BuildPlannerError);
  });

  it("preserves explicit empty fields and trims metadata without fabricating quantities", () => {
    const parsed = parseBuildPlannerMutation({
      ...save(),
      title: "  Recorded build  ",
      notes: undefined,
      description: undefined,
    });
    expect(parsed.action).toBe("SAVE_BUILD");
    if (parsed.action !== "SAVE_BUILD") throw new Error("Expected save mutation.");
    expect(parsed.title).toBe("Recorded build");
    expect(parsed.notes).toBe("");
    expect(parsed.description).toBe("");
    expect(parsed.loadout.context.gamePatch).toBeNull();
    expect(parsed.loadout.entries).toHaveLength(0);
  });

  it("requires version control for visibility and archive actions", () => {
    expect(() =>
      parseBuildPlannerMutation({
        action: "SET_VISIBILITY",
        buildId: randomUUID(),
        visibility: "PUBLIC",
      }),
    ).toThrow(BuildPlannerError);
    expect(() => parseBuildPlannerMutation({ action: "ARCHIVE", buildId: randomUUID() })).toThrow(
      BuildPlannerError,
    );
    expect(() => parseBuildPlannerMutation({ action: "RESTORE", buildId: randomUUID() })).toThrow(
      BuildPlannerError,
    );
    expect(
      parseBuildPlannerMutation({
        action: "ARCHIVE",
        buildId: randomUUID(),
        expectedUpdatedAt: savedAt.toISOString(),
      }).action,
    ).toBe("ARCHIVE");
  });
});
