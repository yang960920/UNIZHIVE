import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { CurrentAuthState, CurrentUser } from "../src/lib/auth-policy";
const boundary = vi.hoisted(() => ({
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  database: vi.fn(),
  guild: vi.fn(),
  auth: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/auth", () => ({ getCurrentAuthState: boundary.auth }));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getLiveGuildEligibilityState: boundary.guild,
  getSessionGuildEligibilityState: boundary.guild,
}));
vi.mock("../src/lib/server/steam-overview", () => ({
  getSteamOverview: async () => ({ news: { items: [] } }),
}));
vi.mock("@uniz/db", async (original) => ({
  ...(await original<typeof import("@uniz/db")>()),
  getDb: boundary.database,
}));
import {
  accounts,
  builds,
  communityPosts,
  dpsResearchRecords,
  memberProfiles,
  operations,
  seasons,
  users,
} from "@uniz/db";
import { getUnifiedSearch, searchBuildAccess } from "../src/lib/server/unified-search";

function sqlText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(sqlText).join("");
  if (!value || typeof value !== "object") return "";
  const object = value as { queryChunks?: unknown[]; value?: unknown; name?: string };
  if (object.queryChunks) return sqlText(object.queryChunks);
  if (Array.isArray(object.value)) return sqlText(object.value);
  if (typeof object.value === "string") return object.value;
  return typeof object.name === "string" ? object.name : "";
}
const actor: CurrentUser = { id: "real-fixture", name: "Fixture", role: "ADMIN", isMock: false };
let fresh: CurrentUser | null;
let discordConnected: boolean;
let reads: { table: unknown; fields: string[]; where: string; limit: number; offset: number }[];
let statements: string[];
let communityRows: { id: string; title: string; excerpt: string; postCategory: string }[];
let researchRows: {
  id: string;
  title: string;
  excerpt: string;
  version: number;
  status: "APPROVED";
  owned: boolean;
  verified: boolean;
}[];
function fixtureDatabase() {
  const transaction = {
    execute: async (statement: unknown) => {
      statements.push(sqlText(statement));
    },
    select: (selection: Record<string, unknown>) => {
      const read = {
        table: null as unknown,
        fields: Object.keys(selection),
        where: "",
        limit: 0,
        offset: 0,
      };
      const builder = {
        from(table: unknown) {
          read.table = table;
          reads.push(read);
          return builder;
        },
        innerJoin() {
          return builder;
        },
        where(condition: unknown) {
          read.where = sqlText(condition);
          return builder;
        },
        for() {
          return builder;
        },
        orderBy() {
          return builder;
        },
        limit(value: number) {
          read.limit = value;
          return builder;
        },
        offset(value: number) {
          read.offset = value;
          return builder;
        },
        then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
          const rows =
            read.table === users && read.fields.includes("role")
              ? fresh
                ? [fresh]
                : []
              : read.table === accounts
                ? discordConnected
                  ? [{ id: "discord-fixture" }]
                  : []
                : read.table === communityPosts
                  ? communityRows
                  : read.table === dpsResearchRecords
                    ? researchRows.slice(read.offset, read.offset + read.limit)
                    : [];
          return Promise.resolve(rows).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return {
    transaction: async (work: (transaction: unknown) => Promise<unknown>) => work(transaction),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgres://fixture");
  boundary.state = { user: actor, status: "AUTHENTICATED" };
  boundary.auth.mockImplementation(async () => boundary.state);
  boundary.guild.mockResolvedValue({ status: "UNAVAILABLE" });
  fresh = actor;
  discordConnected = true;
  reads = [];
  statements = [];
  communityRows = [];
  researchRows = [];
  boundary.database.mockImplementation(fixtureDatabase);
});
afterEach(() => vi.unstubAllEnvs());
describe("unified search authorization and SQL projection", () => {
  it("groups visible game-information examples and removes their results when disabled without querying posts", async () => {
    vi.stubEnv("GAME_INFO_EXAMPLES", "single");
    const result = await getUnifiedSearch({ q: "DPS", category: "research" });
    expect(result.category).toBe("research");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({
      category: "research",
      hasMore: false,
      items: [
        {
          href: "/db/dps/sample-sustained-dps",
          detail: "화면 예시 · 실측 아님 · 미검증",
        },
      ],
    });
    expect(
      reads.every(
        (read) =>
          read.table === users || read.table === accounts || read.table === dpsResearchRecords,
      ),
    ).toBe(true);
    vi.stubEnv("GAME_INFO_EXAMPLES", "off");
    const hidden = await getUnifiedSearch({ q: "DPS", category: "research" });
    expect(hidden.groups).toEqual([]);
  });
  it("merges the example with live research into one paginated group without repeating or skipping records", async () => {
    vi.stubEnv("GAME_INFO_EXAMPLES", "single");
    researchRows = Array.from({ length: 21 }, (_, index) => ({
      id: `actual-${index}`,
      title: `Actual DPS ${index}`,
      excerpt: "Measured conditions",
      version: 1,
      status: "APPROVED" as const,
      owned: false,
      verified: index === 0,
    }));
    const first = await getUnifiedSearch({ q: "DPS", category: "research" });
    expect(first.groups).toHaveLength(1);
    expect(first.groups[0].items).toHaveLength(20);
    expect(first.groups[0].hasMore).toBe(true);
    expect(first.groups[0].items[0].detail).toContain("실측 아님");
    expect(first.groups[0].items[1].detail).toBe("게시 승인 · 재현 검토 완료");
    expect(first.groups[0].items[2].detail).toBe("게시 승인 · 재현 미확인");
    const researchQuery = reads.find((read) => read.table === dpsResearchRecords)!;
    expect(researchQuery.limit).toBe(20);
    expect(researchQuery.offset).toBe(0);
    expect(researchQuery.fields).toEqual([
      "id",
      "version",
      "title",
      "excerpt",
      "status",
      "owned",
      "verified",
    ]);
    expect(researchQuery.where).toContain("hidden_at is null");
    expect(researchQuery.where).toContain("archived_at is null");
    expect(researchQuery.where).toContain("dps_research_publications");
    expect(researchQuery.where).not.toContain("submitted_at");
    for (const field of [
      "title",
      "summary",
      "composition",
      "gamePatch",
      "scenario",
      "trance",
      "platform",
      "target",
      "reloadPolicy",
      "hitPolicy",
      "buffPolicy",
      "procedure",
      "evidenceText",
      "trials",
      "measuredAt",
      "durationSeconds",
      "distanceMeters",
      "youtubeUrl",
    ])
      expect(researchQuery.where).toContain(`payload->>'${field}'`);
    expect(researchQuery.where).not.toContain("payload::text");
    expect(researchQuery.where).not.toContain("evidenceDocument");
    reads = [];
    const second = await getUnifiedSearch({ q: "DPS", category: "research", page: "2" });
    expect(second.groups).toHaveLength(1);
    expect(second.groups[0].items.map((item) => item.id)).toEqual([
      "research:actual-19",
      "research:actual-20",
    ]);
    expect(second.groups[0].hasMore).toBe(false);
    expect(reads.find((read) => read.table === dpsResearchRecords)?.offset).toBe(19);
    const all = [...first.groups[0].items, ...second.groups[0].items];
    expect(new Set(all.map((item) => item.id)).size).toBe(22);
    vi.stubEnv("GAME_INFO_EXAMPLES", "off");
    const disabled = await getUnifiedSearch({ q: "DPS", category: "research" });
    expect(disabled.groups).toHaveLength(1);
    expect(disabled.groups[0].items).toHaveLength(20);
    expect(disabled.groups[0].items.every((item) => !item.href.includes("sample-"))).toBe(true);
  });
  it("reuses the authorized request reader without a second Discord call and verifies fresh database role/account", async () => {
    const result = await getUnifiedSearch({ q: "검증" });
    expect(result.mode).toBe("LIVE");
    expect(boundary.auth).toHaveBeenCalledTimes(1);
    expect(boundary.guild).not.toHaveBeenCalled();
    expect(statements.some((statement) => statement.includes("pg_advisory_xact_lock_shared"))).toBe(
      true,
    );
    expect(statements.some((statement) => statement.includes("statement_timeout"))).toBe(true);
    expect(reads.some((read) => read.table === accounts)).toBe(true);
    expect(reads.some((read) => read.table === communityPosts)).toBe(true);
  });
  it("returns only public/static search when guild eligibility, fresh role or account grants fail", async () => {
    for (const status of ["LEFT", "REAUTH_REQUIRED", "UNAVAILABLE"] as const) {
      reads = [];
      boundary.state = { user: null, status };
      const result = await getUnifiedSearch({ q: "검증" });
      expect(result.mode).toBe("LIMITED");
      expect(
        reads.every((read) => read.table === builds || read.table === dpsResearchRecords),
      ).toBe(true);
      expect(reads[0]?.where).not.toContain("'HIVE'");
    }
    boundary.state = { user: actor, status: "AUTHENTICATED" };
    for (const candidate of [
      null,
      { ...actor, role: "APPLICANT" as const },
      { ...actor, role: "GUEST" as const },
    ]) {
      fresh = candidate;
      reads = [];
      expect((await getUnifiedSearch({ q: "검증" })).mode).toBe("LIMITED");
      expect(reads.some((read) => read.table === communityPosts)).toBe(false);
    }
    fresh = actor;
    discordConnected = false;
    reads = [];
    expect((await getUnifiedSearch({ q: "검증" })).mode).toBe("LIMITED");
    expect(reads.some((read) => read.table === communityPosts)).toBe(false);
  });
  it("ignores former administrator privileges after fresh demotion and never searches UID or tokens", async () => {
    fresh = { ...actor, role: "MEMBER" };
    await getUnifiedSearch({ q: "검증" });
    expect(reads.some((read) => read.table === users && read.fields.includes("nickname"))).toBe(
      false,
    );
    reads = [];
    fresh = actor;
    await getUnifiedSearch({ q: "검증" });
    const member = reads.find((read) => read.table === users && read.fields.includes("nickname"));
    expect(member?.fields).toEqual(["id", "name", "nickname"]);
    expect(member?.where).not.toContain("once_human_uid");
    expect(
      reads.flatMap((read) => read.fields).some((field) => /token|uid|email/i.test(field)),
    ).toBe(false);
    expect(reads.some((read) => read.table === memberProfiles)).toBe(false);
  });
  it("bounds per-category pages, excludes archived/hidden/unapproved records and scopes PRIVATE to owner", async () => {
    await getUnifiedSearch({ q: "100%_", category: "build", page: "99" });
    const build = reads.find((read) => read.table === builds)!;
    expect(build.limit).toBe(21);
    expect(build.offset).toBe(980);
    expect(build.where).toContain("archived_at is null");
    expect(build.where).toContain("owner_id = real-fixture");
    expect(build.where).toContain("build_publications");
    expect(build.where).toContain("active_request.status = 'APPROVED'");
    expect(build.where).toContain("%100\\%\\_%");
    expect(build.where).toContain("bv_latest.version desc limit 1");
    reads = [];
    await getUnifiedSearch({ q: "검증" });
    expect(reads.find((read) => read.table === communityPosts)?.where).toContain(
      "hidden_at is null",
    );
    expect(reads.find((read) => read.table === operations)?.where).toContain(
      "approval_status = 'APPROVED'",
    );
    expect(reads.find((read) => read.table === seasons)?.where).toContain("APPROVED");
    expect(sqlText(searchBuildAccess(null))).not.toContain("PRIVATE");
  });
  it("uses explicit safe demo fallback without reading real posts or accepting a demo administrator", async () => {
    boundary.state = {
      user: { ...actor, id: "demo-admin", isMock: true },
      status: "AUTHENTICATED",
    };
    const result = await getUnifiedSearch({ q: "멤버" });
    expect(result.mode).toBe("DEMO");
    expect(result.notice).toContain("미리보기");
    expect(
      result.groups.flatMap((group) => group.items).some((item) => item.href === "/members"),
    ).toBe(false);
    expect(boundary.database).not.toHaveBeenCalled();
    expect(boundary.guild).not.toHaveBeenCalled();
  });
  it("keeps showcase posts searchable with an explicit photo-space destination without selecting documents or image bytes", async () => {
    communityRows = [
      { id: "photo-post", title: "자랑 사진", excerpt: "사진 설명", postCategory: "SHOWCASE" },
      { id: "board-post", title: "일반 게시글", excerpt: "일반 설명", postCategory: "TIP" },
    ];
    const result = await getUnifiedSearch({ q: "설명", category: "community" });
    expect(result.mode).toBe("LIVE");
    expect(result.groups.find((group) => group.category === "community")?.items).toEqual([
      {
        id: "photo-post",
        title: "자랑 사진",
        excerpt: "사진 설명",
        category: "community",
        detail: "자랑하기",
        href: "/community/photo-post?section=SHOWCASE",
      },
      {
        id: "board-post",
        title: "일반 게시글",
        excerpt: "일반 설명",
        category: "community",
        href: "/community/board-post",
      },
    ]);
    const query = reads.find((read) => read.table === communityPosts)!;
    expect(query.fields).toEqual(["id", "title", "excerpt", "postCategory"]);
    expect(query.where).toContain("hidden_at is null");
    expect(query.where).toContain("archived_at is null");
    expect(query.where).toContain("concat_ws(' ', title, body)");
    expect(query.where).not.toContain("SHOWCASE");
    expect(query.where).not.toContain("body_document");
  });
  it("discards all database results and actor authority when a transaction fails", async () => {
    boundary.database.mockReturnValue({
      transaction: async () => {
        throw new Error("private diagnostics");
      },
    });
    const result = await getUnifiedSearch({ q: "멤버" });
    expect(result.mode).toBe("LIMITED");
    expect(JSON.stringify(result)).not.toContain("private diagnostics");
    expect(
      result.groups.flatMap((group) => group.items).some((item) => item.href === "/members"),
    ).toBe(false);
  });
});
