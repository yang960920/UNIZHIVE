import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import targets from "../data/target-evidence.json";
import { DATA_CATEGORIES, parseEvidenceCatalog as parseCatalog } from "../src/model/evidence";
import { CATEGORY_FIELD_CONTRACTS } from "../src/model/field-contracts";

function parseEvidenceCatalog(input: unknown) {
  return parseCatalog(input, "2026-10-06");
}

function fixture() {
  return structuredClone(parseEvidenceCatalog(targets));
}

describe("Build data evidence boundaries", () => {
  it("validates all curated catalogs without claiming a current gameplay baseline", () => {
    const directory = new URL("../data/", import.meta.url);
    for (const file of readdirSync(directory).filter((name) => name.endsWith("-evidence.json"))) {
      const catalog = parseEvidenceCatalog(
        JSON.parse(readFileSync(new URL(file, directory), "utf8")),
      );
      expect(catalog.samples.every((sample) => sample.currentValidity === "UNVERIFIED")).toBe(true);
    }
  });

  it("preserves unknown defense as null instead of manufacturing zero", () => {
    const catalog = parseEvidenceCatalog(fixture());
    expect(catalog.samples[0].fields.find((field) => field.path === "defense")?.value).toBeNull();
  });

  it("rejects claiming an unknown stat as OFFICIAL", () => {
    const catalog = fixture();
    catalog.samples[0].fields[2].status = "OFFICIAL";
    catalog.samples[0].fields[2].sourceIds = [catalog.sources[0].id];
    expect(() => parseEvidenceCatalog(catalog)).toThrow();
  });

  it("rejects missing references and duplicate source IDs", () => {
    const catalog = fixture();
    catalog.samples[0].fields[0].sourceIds = ["nonexistent"];
    expect(() => parseEvidenceCatalog(catalog)).toThrow();
    const duplicate = fixture();
    duplicate.sources.push(duplicate.sources[0]);
    expect(() => parseEvidenceCatalog(duplicate)).toThrow();
  });

  it("rejects numeric values without units and reversed ranges", () => {
    const catalog = fixture();
    Object.assign(catalog.samples[0].fields[2], { value: 12, unit: null, status: "UNVERIFIED" });
    expect(() => parseEvidenceCatalog(catalog)).toThrow();
    Object.assign(catalog.samples[0].fields[2], { value: [12, 3], unit: "HP" });
    expect(() => parseEvidenceCatalog(catalog)).toThrow();
  });

  it("requires assumptions for estimates and repeatable independent review for community verification", () => {
    const catalog = fixture();
    Object.assign(catalog.samples[0].fields[2], { value: 12, unit: "HP", status: "ESTIMATED" });
    expect(() => parseEvidenceCatalog(catalog)).toThrow();
    Object.assign(catalog.samples[0].fields[2], {
      status: "COMMUNITY VERIFIED",
      sourceIds: [catalog.sources[0].id],
      verification: {
        method: "test-only procedure",
        repetitions: 3,
        reviewerIds: ["same", "same"],
        evidenceUrls: [catalog.sources[0].url],
      },
    });
    expect(() => parseEvidenceCatalog(catalog)).toThrow();
  });

  it("rejects future evidence dates and non-primary OFFICIAL sources", () => {
    const future = fixture();
    future.sources[0].checkedAt = "2027-01-01";
    expect(() => parseEvidenceCatalog(future)).toThrow();
    const unofficial = fixture();
    unofficial.sources[0].url = "https://example.com/community";
    expect(() => parseEvidenceCatalog(unofficial)).toThrow();
  });

  it("rejects duplicate field paths and ungrounded sample names", () => {
    const duplicate = fixture();
    duplicate.samples[0].fields.push(duplicate.samples[0].fields[0]);
    expect(() => parseEvidenceCatalog(duplicate)).toThrow();
    const renamed = fixture();
    renamed.samples[0].name = "unsupported new item";
    expect(() => parseEvidenceCatalog(renamed)).toThrow();
  });

  it("defines field contracts for all twelve requested research categories", () => {
    expect(Object.keys(CATEGORY_FIELD_CONTRACTS).sort()).toEqual([...DATA_CATEGORIES].sort());
  });

  it("rejects fractional counts and level ranges", () => {
    const catalog = fixture();
    Object.assign(catalog.samples[0].fields[2], { value: 1.5, unit: "COUNT" });
    expect(() => parseEvidenceCatalog(catalog)).toThrow();
    Object.assign(catalog.samples[0].fields[2], { value: [1, 2.5], unit: "LEVEL" });
    expect(() => parseEvidenceCatalog(catalog)).toThrow();
  });

  it("keeps a raw unspecified display number without claiming RPM", () => {
    const catalog = fixture();
    Object.assign(catalog.samples[0].fields[2], {
      value: 400,
      unit: "UNSPECIFIED",
      status: "UNVERIFIED",
    });
    const parsed = parseEvidenceCatalog(catalog);
    expect(parsed.samples[0].fields[2].value).toBe(400);
    expect(parsed.samples[0].fields[2].unit).toBe("UNSPECIFIED");
  });

  it("rejects string or boolean values presented as a numerical stat", () => {
    const catalog = fixture();
    Object.assign(catalog.samples[0].fields[2], { value: "12", unit: "HP" });
    expect(() => parseEvidenceCatalog(catalog)).toThrow();
    Object.assign(catalog.samples[0].fields[2], { value: true, unit: "HP" });
    expect(() => parseEvidenceCatalog(catalog)).toThrow();
  });

  it("rejects future catalog reviews, Steam UGC and another game's official news", () => {
    const future = fixture();
    future.checkedAt = "2099-10-06";
    expect(() => parseEvidenceCatalog(future)).toThrow();
    for (const url of [
      "https://steamcommunity.com/sharedfiles/filedetails/?id=1",
      "https://store.steampowered.com/news/app/730/view/123",
    ]) {
      const catalog = fixture();
      catalog.sources[0].url = url;
      expect(() => parseEvidenceCatalog(catalog)).toThrow();
    }
  });
});
