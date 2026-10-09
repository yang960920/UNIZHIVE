import { describe, expect, it } from "vitest";
import { resolveDatabaseUrl } from "@uniz/db/environment";

describe("resolveDatabaseUrl", () => {
  it("uses the Supabase integration URL when DATABASE_URL is missing", () => {
    expect(resolveDatabaseUrl({ POSTGRES_URL: "postgres://integration.example/test" })).toBe(
      "postgres://integration.example/test",
    );
  });

  it("prefers a nonempty DATABASE_URL and trims surrounding whitespace", () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: "  postgres://explicit.example/test\n",
        POSTGRES_URL: "postgres://integration.example/test",
      }),
    ).toBe("postgres://explicit.example/test");
  });

  it.each(["", " \n\t "])("falls back when DATABASE_URL is blank: %j", (databaseUrl) => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: databaseUrl,
        POSTGRES_URL: " \tpostgres://integration.example/test\n",
      }),
    ).toBe("postgres://integration.example/test");
  });

  it.each([{}, { DATABASE_URL: "", POSTGRES_URL: " \n\t " }])(
    "returns undefined when both supported variables are missing or blank: %j",
    (env) => {
      expect(resolveDatabaseUrl(env)).toBeUndefined();
    },
  );
});
