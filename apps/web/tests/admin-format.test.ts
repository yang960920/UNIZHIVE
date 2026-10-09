import { describe, expect, it } from "vitest";
import { fromKstInput, toKstInput } from "../src/lib/admin-format";

describe("administration schedule timezone", () => {
  it("roundtrips Korea time across UTC date boundaries", () => {
    expect(fromKstInput("2026-10-07T00:30")).toBe("2026-10-06T15:30:00.000Z");
    expect(toKstInput("2026-10-06T15:30:00.000Z")).toBe("2026-10-07T00:30");
  });
  it("rejects rolled calendar dates, invalid times and non-date fields", () => {
    for (const invalid of ["2026-02-30T20:00", "2026-10-06T24:00", "2026-10-06T18:60", "x", null])
      expect(() => fromKstInput(invalid)).toThrow();
  });
  it("accepts leap dates and explicit empty optional boundaries", () => {
    expect(fromKstInput("2028-02-29T09:00")).toBe("2028-02-29T00:00:00.000Z");
    expect(fromKstInput("", true)).toBeNull();
    expect(() => fromKstInput("", false)).toThrow();
    expect(toKstInput(null)).toBe("");
  });
  it("retains seconds and milliseconds on unchanged imported records, but uses edited minutes", () => {
    const original = "2026-10-06T15:30:45.123Z";
    expect(fromKstInput("2026-10-07T00:30", false, original)).toBe(original);
    expect(fromKstInput("2026-10-07T00:31", false, original)).toBe("2026-10-06T15:31:00.000Z");
    expect(fromKstInput("", true, original)).toBeNull();
    expect(fromKstInput("2026-10-07T00:30", false, "broken")).toBe("2026-10-06T15:30:00.000Z");
  });
});
