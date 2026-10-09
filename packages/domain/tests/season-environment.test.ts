import { describe, expect, it } from "vitest";
import {
  getSeasonServerTypeLabel,
  getTrancePhenomenonLabel,
  hasGravityContent,
  TRANCE_PHENOMENA,
} from "../src/season-environment";

describe("season environments", () => {
  it("uses the confirmed Korean phenomenon names without treating them as scenarios", () => {
    expect(getTrancePhenomenonLabel("LUNAR_ORACLE")).toBe("달의 징조");
    expect(getTrancePhenomenonLabel("STARFALL_INVERSION")).toBe("역행하는 별");
    expect(getTrancePhenomenonLabel("LUNAR_REVELRY")).toBe("달빛의 향연");
    expect(getTrancePhenomenonLabel("ABERRANT_PROGENY")).toBe("뒤틀린 공존");
    expect(getTrancePhenomenonLabel("GRAVITY_ABYSS")).toBe("중력의 심연");
    expect(getSeasonServerTypeLabel("PERMANENT")).toBe("영구");
    expect(getSeasonServerTypeLabel()).toContain("미확인");
    expect(getTrancePhenomenonLabel()).toContain("미확인");
  });

  it("offers gravity content only for gravity phenomena despite an older manual flag", () => {
    for (const phenomenon of TRANCE_PHENOMENA.filter((value) => value !== "UNKNOWN")) {
      const available = phenomenon === "STARFALL_INVERSION" || phenomenon === "GRAVITY_ABYSS";
      expect(hasGravityContent(phenomenon, false)).toBe(available);
      expect(hasGravityContent(phenomenon, true)).toBe(available);
    }
  });

  it("preserves legacy gravity availability while the phenomenon is unconfirmed", () => {
    for (const phenomenon of ["UNKNOWN", null, undefined] as const) {
      expect(hasGravityContent(phenomenon, true)).toBe(true);
      expect(hasGravityContent(phenomenon, false)).toBe(false);
      expect(hasGravityContent(phenomenon)).toBe(false);
    }
  });
});
