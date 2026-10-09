import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  postgres: vi.fn(),
  drizzle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("postgres", () => ({ default: mocks.postgres }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: mocks.drizzle }));

describe("getDb runtime configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("POSTGRES_URL", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lazily initializes from POSTGRES_URL and caches the database", async () => {
    const sqlClient = {};
    const database = {};
    mocks.postgres.mockReturnValue(sqlClient);
    mocks.drizzle.mockReturnValue(database);
    vi.stubEnv("POSTGRES_URL", " \npostgres://integration.example/test\t ");

    const { getDb } = await import("../src/client");
    expect(mocks.postgres).not.toHaveBeenCalled();
    expect(mocks.drizzle).not.toHaveBeenCalled();

    expect(getDb()).toBe(database);
    expect(mocks.postgres).toHaveBeenCalledExactlyOnceWith("postgres://integration.example/test", {
      max: 5,
      prepare: false,
    });
    expect(mocks.drizzle).toHaveBeenCalledExactlyOnceWith(sqlClient, {
      schema: expect.any(Object),
    });

    vi.stubEnv("DATABASE_URL", "postgres://changed.example/test");
    expect(getDb()).toBe(database);
    expect(mocks.postgres).toHaveBeenCalledTimes(1);
    expect(mocks.drizzle).toHaveBeenCalledTimes(1);
  });

  it("reports both supported variable names when configuration is blank", async () => {
    vi.stubEnv("DATABASE_URL", " \n\t ");
    vi.stubEnv("POSTGRES_URL", " \t ");

    const { getDb } = await import("../src/client");
    expect(() => getDb()).toThrow(
      "DATABASE_URL or POSTGRES_URL is required for live database access.",
    );
    expect(mocks.postgres).not.toHaveBeenCalled();
    expect(mocks.drizzle).not.toHaveBeenCalled();
  });
});
