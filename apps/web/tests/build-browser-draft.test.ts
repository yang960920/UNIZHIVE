import { describe, expect, it } from "vitest";
import { createEmptyGearLoadout, createEmptyPlannerLoadout } from "@uniz/build-engine";
import {
  isGearBrowserBuildDraft,
  isLegacyBrowserBuildDraft,
  type GearBrowserBuildDraft,
  type LegacyBrowserBuildDraft,
} from "../src/components/build-planner/build-browser-draft";

const metadata = {
  format: 1 as const,
  title: "가",
  description: "",
  visibility: "PRIVATE" as const,
  notes: "",
  youtubeUrl: "아직 입력 중인 링크",
  bodyDraft: null,
  baseBuildId: null,
  baseVersionStamp: null,
  baseSourceVersion: null,
};
function gear(): GearBrowserBuildDraft {
  return {
    ...metadata,
    editor: "gear",
    loadout: createEmptyGearLoadout(),
    numberTexts: { "primary.level": "5x" },
    numberErrors: { "primary.level": "숫자를 확인해주세요." },
    focusedSlot: "primary",
  };
}
function legacy(): LegacyBrowserBuildDraft {
  const loadout = createEmptyPlannerLoadout();
  return {
    ...metadata,
    editor: "legacy",
    loadout: {
      ...loadout,
      entries: [
        {
          id: "5f7d7768-fd4e-42f6-8692-fbe685f6a656",
          category: "MOD",
          name: "",
          slotLabel: "",
          linkedEntryId: null,
          reference: null,
          instance: {
            tier: "-",
            stars: "",
            calibration: "3x",
            level: "",
            rolls: [{ label: "", value: "미확인", unit: null }],
          },
          notes: "",
        },
      ],
    },
  };
}

describe("Build browser draft validation", () => {
  it("accepts incomplete gear metadata, whitespace conditions and invalid numeric text", () => {
    const value = gear();
    value.loadout.context.characterClass = "   ";
    expect(isGearBrowserBuildDraft(value)).toBe(true);
    expect(value.numberTexts["primary.level"]).toBe("5x");
    expect(value.loadout.context.characterClass).toBe("   ");
  });

  it("accepts unnamed legacy items and unfinished rolls without converting raw numbers", () => {
    const value = legacy();
    expect(isLegacyBrowserBuildDraft(value)).toBe(true);
    expect(value.loadout.entries[0].instance).toMatchObject({
      tier: "-",
      calibration: "3x",
      rolls: [{ label: "", value: "미확인" }],
    });
  });

  it("keeps incomplete tag text and over-limit prose so publication validation can be corrected later", () => {
    const value = gear();
    value.loadout.recommendation.tags = ["###"];
    value.loadout.recommendation.notes = "메".repeat(2100);
    value.loadout.notes = "모".repeat(2100);
    value.loadout.consumables = { foodIds: [], drinkIds: [], notes: "음".repeat(2100) };
    value.title = "제".repeat(110);
    value.notes = "버".repeat(2100);
    expect(isGearBrowserBuildDraft(value)).toBe(true);
    expect(value.loadout.recommendation.tags).toEqual(["###"]);
    const old = legacy();
    old.loadout.entries[0].name = "이".repeat(130);
    old.loadout.entries[0].notes = "설".repeat(1100);
    old.loadout.entries[0].instance.rolls[0].label = "옵".repeat(70);
    expect(isLegacyBrowserBuildDraft(old)).toBe(true);
  });

  it("keeps pending image originals and raw editor nodes in a recoverable draft", () => {
    const value = gear();
    const uploadId = "d129578f-679c-4a8d-9166-cd221f908389";
    const file = new File(["image bytes"], "photo.png", { type: "image/png" });
    value.bodyDraft = {
      json: { type: "doc", content: [{ type: "image", attrs: { uploadId, alt: "이미지" } }] },
      images: [{ key: uploadId, uploadId, file }],
    };
    expect(isGearBrowserBuildDraft(value)).toBe(true);
    expect(value.bodyDraft.images[0].file).toBe(file);
  });

  it.each([
    null,
    {},
    { ...gear(), editor: "legacy" },
    { ...gear(), visibility: "ADMIN" },
    { ...gear(), loadout: { schemaVersion: "uniz-gear.v2" } },
    { ...gear(), bodyDraft: { json: { type: "script" }, images: [] } },
  ])("rejects malformed or incompatible stored payloads", (value) => {
    expect(isGearBrowserBuildDraft(value)).toBe(false);
  });

  it("bounds stored numeric text and preserves the original optimistic lock baseline", () => {
    const value = gear();
    value.baseBuildId = "fixture-build";
    value.baseVersionStamp = "2026-10-09T00:00:00.000Z";
    value.baseSourceVersion = 1;
    expect(isGearBrowserBuildDraft(value)).toBe(true);
    expect(value.baseVersionStamp).toBe("2026-10-09T00:00:00.000Z");
    value.numberTexts["primary.level"] = "9".repeat(101);
    expect(isGearBrowserBuildDraft(value)).toBe(false);
  });
});
