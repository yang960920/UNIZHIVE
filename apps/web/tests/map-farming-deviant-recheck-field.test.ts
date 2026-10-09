import { describe, expect, it } from "vitest";
import { FIELD_DEVIANT_RECHECK_GUIDES } from "../src/lib/map-farming-deviant-recheck-field-data";
import { DEVIANT_ACQUISITION_GUIDES } from "../src/lib/map-farming-deviant-acquisition-data";
import { FARMING_TARGETS } from "../src/lib/map-farming-targets";

describe("Korean field-deviant acquisition recheck", () => {
  it("does not promote scenario-unspecified reports to verified ED acquisition", () => {
    for (const [key, record] of Object.entries(FIELD_DEVIANT_RECHECK_GUIDES)) {
      expect(FARMING_TARGETS.some((target) => target.key === key)).toBe(true);
      expect(record.verifiedScenarios).not.toContain("ENDLESS_DREAM");
      const endless = record.scenarios?.ENDLESS_DREAM;
      expect(endless?.summary.trim()).toBeTruthy();
      expect(endless?.scopeLabel).toMatch(/사례 미확인/);
      expect(endless?.location).toBeUndefined();
      expect(endless?.locationUrl).toBeUndefined();
      for (const guide of [record.default, endless!]) {
        expect(guide.sources.some((source) => source.label.includes("202"))).toBe(true);
        for (const source of guide.sources) {
          expect(new URL(source.url).protocol).toBe("https:");
          expect(source.title?.trim()).toBeTruthy();
        }
      }
    }
  });

  it("retains separately sourced winter and SCP routes", () => {
    for (const [key, record] of Object.entries(FIELD_DEVIANT_RECHECK_GUIDES)) {
      for (const scenario of ["WINTER", "DEVIATION"] as const) {
        expect(record.scenarios?.[scenario]).toEqual(
          DEVIANT_ACQUISITION_GUIDES[key]!.scenarios?.[scenario],
        );
      }
    }
  });

  it("keeps crafting and weapon-crate routes useful alongside evidence limits", () => {
    const mini = FIELD_DEVIANT_RECHECK_GUIDES["99000050"]!;
    expect(mini.scenarios?.ENDLESS_DREAM?.summary).toContain("제작한 뒤 수령");
    expect(mini.default.sources.some((source) => source.url.includes("no=228640"))).toBe(true);
    expect(FIELD_DEVIANT_RECHECK_GUIDES["99000038"]?.scenarios?.ENDLESS_DREAM?.summary).toContain(
      "무기 상자",
    );
    expect(FIELD_DEVIANT_RECHECK_GUIDES["99000035"]?.scenarios?.ENDLESS_DREAM?.summary).toContain(
      "양파",
    );
  });

  it("requires the current pollution zone and rejects generic Rosetta guarantees", () => {
    const mini = FIELD_DEVIANT_RECHECK_GUIDES["99000053"]!;
    expect(mini.default.summary).toContain("오염 지역 안에");
    expect(mini.default.scopeLabel).toContain("연결");
    expect(mini.scenarios?.ENDLESS_DREAM?.summary).toContain("서버마다 위치");
    expect(mini.scenarios?.ENDLESS_DREAM?.summary).toContain("일반 로제타의 확정 보상");
    expect(mini.scenarios?.ENDLESS_DREAM?.summary).toContain("안내하지 않습니다");
    expect(mini.default.sources.map((source) => source.url)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/20250312/"),
        expect.stringContaining("/20260121/"),
      ]),
    );
  });

  it("separates one-time quest candidates from repeat farming and retired workshop defense", () => {
    const maiden = FIELD_DEVIANT_RECHECK_GUIDES["99000049"]!;
    expect(maiden.default.summary).toContain("최초 보상 후보");
    expect(maiden.scenarios?.ENDLESS_DREAM?.summary).toContain("반복 파밍으로 안내하지");
    expect(maiden.scenarios?.ENDLESS_DREAM?.summary).toContain("옛 방어 공방");
    expect(maiden.default.sources.some((source) => source.url.includes("NPC"))).toBe(true);
  });

  it("does not transplant the Manibus reward into ED or declare Voodoo unobtainable", () => {
    const wind = FIELD_DEVIANT_RECHECK_GUIDES["99000032"]!;
    expect(wind.default.summary).toContain("컨트롤러는 필요하지 않습니다");
    expect(wind.scenarios?.ENDLESS_DREAM?.summary).toContain("그대로 적용하지 않습니다");
    const doll = FIELD_DEVIANT_RECHECK_GUIDES["99000047"]!.scenarios!.ENDLESS_DREAM!;
    expect(doll.summary).toContain("해안 광장");
    expect(doll.summary).not.toMatch(/획득 불가|타우러스/);
  });
});
