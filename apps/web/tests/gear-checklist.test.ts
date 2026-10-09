import { describe, expect, it } from "vitest";
import { GEAR_CATALOG, createEmptyGearLoadout, createGearSelection } from "@uniz/build-engine";
import { makeGearChecklist } from "../src/components/build-planner/gear-checklist-text";

describe("saved equipment checklist", () => {
  it("keeps actual levels and suffix separate from recommendation and deviant grades", () => {
    const loadout = createEmptyGearLoadout();
    const weapon = createGearSelection("primary", "weapon-p90-holographic-resonance");
    weapon.level = 50;
    weapon.attachments.module = "module-icebreaker";
    weapon.attachments.moduleSuffix = "module-suffix-ability";
    weapon.attachments.moduleLevel = 13;
    weapon.attachments.ammo = "ammo-medium-caliber-armor-piercing";
    const deviant = createGearSelection("combatDeviant", "deviant-dr-teddy");
    deviant.abilityGrade = 5;
    deviant.activityGrade = 4;
    loadout.slots.push(weapon, deviant);
    loadout.recommendation = { rating: 2, contents: ["보스"], tags: ["약점"], notes: "협동용" };
    const text = makeGearChecklist(loadout);
    expect(text).toContain("주 무기: P90-홀로그램 공명 · Lv.50");
    expect(text).toContain("모듈: 쇄빙〈어빌리티〉 · Lv.13");
    expect(text).toContain("총알: 중구경 철갑탄");
    expect(text).toContain("어빌리티 등급: 5");
    expect(text).toContain("활성 등급: 4");
    expect(text).toContain("추천도: 2/5");
    expect(text).toContain("추천 콘텐츠: 보스");
    expect(text).toContain("태그: #약점");
    expect(text).not.toContain("DPS");
  });

  it("keeps historical names when an item was renamed or removed", () => {
    const loadout = createEmptyGearLoadout();
    loadout.slots.push(
      createGearSelection("primary", "weapon-p90-holographic-resonance"),
      createGearSelection("combatDeviant", "retired-deviant"),
    );
    loadout.catalogNames = {
      "weapon-p90-holographic-resonance": "저장 당시 이름",
      "retired-deviant": "이전 감염물",
    };
    expect(makeGearChecklist(loadout)).toContain("주 무기: 저장 당시 이름");
    expect(makeGearChecklist(loadout)).toContain("전투 감염물: 이전 감염물");
  });

  it("shows unverified cradle unlock conditions only when a cradle is recorded", () => {
    const loadout = createEmptyGearLoadout();
    expect(makeGearChecklist(loadout)).not.toContain("해금 조건");
    loadout.slots.push(createGearSelection("cradle-1", "cradle-light-gear"));
    expect(makeGearChecklist(loadout)).toContain("해금 조건은 아직 확인되지 않았습니다");
  });
  it("corrects a documented Butterfly identity error without rewriting the saved snapshot", () => {
    const butterfly = GEAR_CATALOG.find((item) => item.correctedNames?.includes("나비의꿈"))!;
    expect(butterfly.name).toBe("나비");
    const loadout = createEmptyGearLoadout();
    loadout.slots.push(createGearSelection("combatDeviant", butterfly.id));
    loadout.catalogNames = { [butterfly.id]: "나비의꿈" };
    const before = JSON.stringify(loadout);
    expect(makeGearChecklist(loadout)).toContain("전투 감염물: 나비");
    expect(makeGearChecklist(loadout)).not.toContain("나비의꿈");
    expect(JSON.stringify(loadout)).toBe(before);
  });
});
