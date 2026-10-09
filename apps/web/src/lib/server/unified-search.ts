import "server-only";
import {
  accounts,
  and,
  announcements,
  builds,
  buildVersions,
  communityPosts,
  desc,
  dpsResearchRecords,
  dpsResearchVersions,
  eq,
  getDb,
  memberProfiles,
  operations,
  scenarios,
  seasons,
  servers,
  sql,
  users,
} from "@uniz/db";
import { resolveDatabaseUrl } from "@uniz/db/environment";
import { getCurrentAuthState } from "../auth";
import type { CurrentUser } from "../auth-policy";
import { getSteamOverview } from "./steam-overview";
import { searchGameInfoExamples, searchStaticContent } from "./search-static";
import { publishedBuildAccessSql } from "./build-sharing";
import { DPS_RESEARCH_STATUSES, dpsResearchHref } from "../dps-research";
import {
  dpsResearchPublishedVersionAccessSql,
  dpsResearchVerifiedSql,
} from "./dps-research-access";
import {
  SEARCH_CATEGORIES,
  isSearchMember,
  normalizeSearchQuery,
  searchCategory,
  searchPage,
  searchPattern,
  searchExcerpt,
  searchMatches,
  type SearchCategory,
  type SearchGroup,
  type SearchItem,
  type UnifiedSearchData,
} from "../unified-search";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type SearchSql = ReturnType<typeof sql>;
const AUTHORIZATION_LOCK = 912743110;
const GROUP_SIZE = 5;
const CATEGORY_SIZE = 20;

function matching(expression: SearchSql, pattern: string): SearchSql {
  // Bind a literal pattern; strip only whitespace from stored text, never search private JSON.
  return sql`lower(regexp_replace(coalesce(${expression}, ''), '[[:space:]]+', '', 'g')) like ${pattern} escape '\\'`;
}
export function searchBuildAccess(actor: CurrentUser | null): SearchSql {
  return actor && isSearchMember(actor)
    ? sql`(${builds.ownerId} = ${actor.id} or (${publishedBuildAccessSql(actor)}))`
    : publishedBuildAccessSql(null);
}
async function readDatabaseGroups(
  transaction: Transaction,
  actor: CurrentUser | null,
  q: string,
  category: SearchCategory | null,
  page: number,
  researchExampleCount: number,
): Promise<SearchGroup[]> {
  if (!q) return [];
  const size = category ? CATEGORY_SIZE : GROUP_SIZE;
  const offset = category ? (page - 1) * size : 0;
  const pattern = searchPattern(q);
  const groups: SearchGroup[] = [];
  const include = (key: SearchCategory) => !category || key === category;
  const append = (key: SearchCategory, items: SearchItem[]) =>
    groups.push({ category: key, items: items.slice(0, size), hasMore: items.length > size });
  if (include("build")) {
    const owned = actor ? sql`${builds.ownerId} = ${actor.id}` : sql`false`;
    const approvedTitle = sql<string>`(select shared_request.title from build_publications shared_publication join build_share_requests shared_request on shared_request.id = shared_publication.request_id where shared_publication.build_id = ${builds.id})`;
    const approvedDescription = sql<string>`(select shared_request.description from build_publications shared_publication join build_share_requests shared_request on shared_request.id = shared_publication.request_id where shared_publication.build_id = ${builds.id})`;
    const approvedScope = sql<string>`(select shared_request.requested_visibility from build_publications shared_publication join build_share_requests shared_request on shared_request.id = shared_publication.request_id where shared_publication.build_id = ${builds.id})`;
    const title = sql<string>`case when ${owned} then ${builds.title} else ${approvedTitle} end`;
    const description = sql<string>`case when ${owned} then ${builds.description} else ${approvedDescription} end`;
    const visibleVersion = sql<string>`case when ${owned} then (select bv_latest.id from ${buildVersions} bv_latest where bv_latest.build_id = ${builds.id} order by bv_latest.version desc limit 1) else (select shared_request.build_version_id from build_publications shared_publication join build_share_requests shared_request on shared_request.id = shared_publication.request_id where shared_publication.build_id = ${builds.id}) end`;
    const recommendation = sql<string>`(select concat_ws(' ', bv_search.loadout_snapshot #>> '{recommendation,tags}', bv_search.loadout_snapshot #>> '{recommendation,contents}', bv_search.loadout_snapshot #>> '{recommendation,notes}') from ${buildVersions} bv_search where bv_search.id = (${visibleVersion}) and bv_search.schema_version = 'uniz-gear.v2' limit 1)`;
    const updatedAt = sql<Date>`case when ${owned} then ${builds.updatedAt} else (select updated_at from build_publications where build_id = ${builds.id}) end`;
    const rows = await transaction
      .select({
        id: builds.id,
        title,
        excerpt: sql<string>`left(coalesce(${description}, ''), 600)`,
        visibility: sql<string>`case when ${owned} then 'PRIVATE' else ${approvedScope} end`,
      })
      .from(builds)
      .innerJoin(users, eq(users.id, builds.ownerId))
      .where(
        and(
          searchBuildAccess(actor),
          sql`${builds.archivedAt} is null`,
          sql`${users.role} in ('MEMBER', 'OFFICER', 'ADMIN')`,
          sql`exists (select 1 from ${buildVersions} where ${buildVersions.buildId} = ${builds.id})`,
          matching(sql`concat_ws(' ', ${title}, ${description}, ${recommendation})`, pattern),
        ),
      )
      .orderBy(desc(updatedAt), desc(builds.id))
      .limit(size + 1)
      .offset(offset);
    append(
      "build",
      rows.map((row) => ({
        id: row.id,
        category: "build",
        title: row.title,
        excerpt: searchExcerpt(row.excerpt),
        detail:
          row.visibility === "PRIVATE"
            ? "내 비공개 빌드"
            : row.visibility === "HIVE"
              ? "하이브 공유"
              : "공개 빌드",
        href: `/lab/b/${row.id}`,
      })),
    );
  }
  if (include("research")) {
    const owned = actor ? sql`${dpsResearchRecords.ownerId} = ${actor.id}` : sql`false`;
    const visibleVersionId = sql<string>`case when ${owned}
      then (select latest_research.id from dps_research_versions latest_research where latest_research.record_id = ${dpsResearchRecords.id} order by latest_research.version desc limit 1)
      else (select version_id from dps_research_publications where record_id = ${dpsResearchRecords.id}) end`;
    const examplesOnPage = Math.min(size, Math.max(0, researchExampleCount - offset));
    const remainingSize = size - examplesOnPage;
    const title = sql<string>`coalesce(${dpsResearchVersions.payload}->>'title', 'DPS 측정 기록')`;
    const updatedAt = sql<Date>`case when ${owned} then ${dpsResearchRecords.updatedAt} else (select updated_at from dps_research_publications where record_id = ${dpsResearchRecords.id}) end`;
    const rows = await transaction
      .select({
        id: dpsResearchRecords.id,
        version: dpsResearchVersions.version,
        title,
        excerpt: sql<string>`left(coalesce(${dpsResearchVersions.payload}->>'summary', ''), 600)`,
        status: dpsResearchVersions.status,
        owned,
        verified: dpsResearchVerifiedSql(dpsResearchVersions.id),
      })
      .from(dpsResearchRecords)
      .innerJoin(users, eq(users.id, dpsResearchRecords.ownerId))
      .innerJoin(dpsResearchVersions, eq(dpsResearchVersions.id, visibleVersionId))
      .where(
        and(
          sql`${dpsResearchRecords.hiddenAt} is null and ${dpsResearchRecords.archivedAt} is null`,
          sql`${users.role} in ('MEMBER','OFFICER','ADMIN')`,
          sql`exists (select 1 from accounts research_owner_account where research_owner_account.user_id = ${users.id} and research_owner_account.provider = 'discord')`,
          sql`(${owned} or ${dpsResearchPublishedVersionAccessSql(dpsResearchVersions.id)})`,
          matching(
            sql`concat_ws(' ', 'DPS 측정 기록', ${title},
            ${dpsResearchVersions.payload}->>'summary', ${dpsResearchVersions.payload}->>'composition',
            ${dpsResearchVersions.payload}->>'gamePatch', ${dpsResearchVersions.payload}->>'scenario',
            ${dpsResearchVersions.payload}->>'trance', ${dpsResearchVersions.payload}->>'platform',
            ${dpsResearchVersions.payload}->>'target', ${dpsResearchVersions.payload}->>'reloadPolicy',
            ${dpsResearchVersions.payload}->>'measuredAt', ${dpsResearchVersions.payload}->>'durationSeconds',
            ${dpsResearchVersions.payload}->>'distanceMeters', ${dpsResearchVersions.payload}->>'youtubeUrl',
            ${dpsResearchVersions.payload}->>'hitPolicy', ${dpsResearchVersions.payload}->>'buffPolicy',
            ${dpsResearchVersions.payload}->>'procedure', ${dpsResearchVersions.payload}->>'evidenceText',
            ${dpsResearchVersions.payload}->>'trials')`,
            pattern,
          ),
        ),
      )
      .orderBy(desc(updatedAt), desc(dpsResearchRecords.id))
      .limit(remainingSize + 1)
      .offset(Math.max(0, offset - researchExampleCount));
    if (rows.length)
      groups.push({
        category: "research",
        items: rows.slice(0, remainingSize).map((row) => ({
          id: `research:${row.id}`,
          category: "research",
          title: row.title,
          excerpt: searchExcerpt(row.excerpt),
          detail: row.owned
            ? `내 자료 · ${DPS_RESEARCH_STATUSES[row.status]}`
            : row.verified
              ? "게시 승인 · 재현 검토 완료"
              : "게시 승인 · 재현 미확인",
          href: dpsResearchHref(row),
        })),
        hasMore: rows.length > remainingSize,
      });
  }
  if (!actor) return groups;
  if (include("community")) {
    const rows = await transaction
      .select({
        id: communityPosts.id,
        title: communityPosts.title,
        excerpt: sql<string>`left(${communityPosts.body}, 600)`,
        postCategory: communityPosts.category,
      })
      .from(communityPosts)
      .innerJoin(users, eq(users.id, communityPosts.authorId))
      .where(
        and(
          sql`${communityPosts.hiddenAt} is null and ${communityPosts.archivedAt} is null`,
          sql`${users.role} in ('MEMBER', 'OFFICER', 'ADMIN')`,
          matching(sql`concat_ws(' ', ${communityPosts.title}, ${communityPosts.body})`, pattern),
        ),
      )
      .orderBy(desc(communityPosts.createdAt), desc(communityPosts.id))
      .limit(size + 1)
      .offset(offset);
    append(
      "community",
      rows.map(({ postCategory, ...row }) => ({
        ...row,
        category: "community",
        excerpt: searchExcerpt(row.excerpt),
        ...(postCategory === "SHOWCASE" ? { detail: "자랑하기" } : {}),
        href: `/community/${row.id}${postCategory === "SHOWCASE" ? "?section=SHOWCASE" : ""}`,
      })),
    );
  }
  if (include("announcement")) {
    const rows = await transaction
      .select({
        id: announcements.id,
        title: announcements.title,
        excerpt: sql<string>`left(${announcements.content}, 600)`,
      })
      .from(announcements)
      .where(
        and(
          sql`${announcements.archivedAt} is null and ${announcements.publishedAt} <= now()`,
          matching(sql`concat_ws(' ', ${announcements.title}, ${announcements.content})`, pattern),
        ),
      )
      .orderBy(desc(announcements.publishedAt), desc(announcements.id))
      .limit(size + 1)
      .offset(offset);
    append(
      "announcement",
      rows.map((row) => ({
        ...row,
        category: "announcement",
        excerpt: searchExcerpt(row.excerpt),
        href: `/announcements/${row.id}`,
      })),
    );
  }
  if (include("party")) {
    const rows = await transaction
      .select({
        id: operations.id,
        title: operations.title,
        excerpt: sql<string>`left(${operations.description}, 600)`,
      })
      .from(operations)
      .innerJoin(users, eq(users.id, operations.createdById))
      .where(
        and(
          sql`${operations.status} = 'SCHEDULED'`,
          sql`${users.role} in ('MEMBER', 'OFFICER', 'ADMIN')`,
          sql`(${operations.seasonId} is null or exists (select 1 from ${seasons} where ${seasons.id} = ${operations.seasonId} and ${seasons.approvalStatus} = 'APPROVED'))`,
          matching(
            sql`concat_ws(' ', ${operations.title}, ${operations.description}, ${operations.meetingPoint})`,
            pattern,
          ),
        ),
      )
      .orderBy(desc(operations.startsAt), desc(operations.id))
      .limit(size + 1)
      .offset(offset);
    append(
      "party",
      rows.map((row) => ({
        ...row,
        category: "party",
        excerpt: searchExcerpt(row.excerpt),
        href: `/ops/${row.id}`,
      })),
    );
  }
  if (include("season")) {
    const rows = await transaction
      .select({
        id: seasons.id,
        title: seasons.name,
        scenario: scenarios.name,
        server: servers.name,
      })
      .from(seasons)
      .innerJoin(scenarios, eq(scenarios.id, seasons.scenarioId))
      .innerJoin(servers, eq(servers.id, seasons.serverId))
      .where(
        and(
          eq(seasons.approvalStatus, "APPROVED"),
          matching(
            sql`concat_ws(' ', ${seasons.name}, ${scenarios.name}, ${servers.name})`,
            pattern,
          ),
        ),
      )
      .orderBy(desc(seasons.startsAt), desc(seasons.id))
      .limit(size + 1)
      .offset(offset);
    append(
      "season",
      rows.map((row) => ({
        id: row.id,
        category: "season",
        title: row.title,
        excerpt: `${row.scenario} · ${row.server}`,
        href: `/season/${row.id}`,
      })),
    );
  }
  if (actor.role === "ADMIN" && include("member")) {
    // Deliberately select/search only directory labels. UID, email, OAuth grants and bios are excluded.
    const rows = await transaction
      .select({
        id: users.id,
        name: memberProfiles.displayName,
        nickname: memberProfiles.onceHumanNickname,
      })
      .from(users)
      .innerJoin(memberProfiles, eq(memberProfiles.userId, users.id))
      .where(
        and(
          sql`${users.role} in ('MEMBER', 'OFFICER', 'ADMIN')`,
          matching(
            sql`concat_ws(' ', ${memberProfiles.displayName}, ${memberProfiles.onceHumanNickname}, ${memberProfiles.handle})`,
            pattern,
          ),
        ),
      )
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(size + 1)
      .offset(offset);
    append(
      "member",
      rows.map((row) => ({
        id: row.id,
        category: "member",
        title: row.name,
        excerpt: row.nickname,
        href: `/admin/members/${row.id}`,
      })),
    );
  }
  return groups;
}

export async function getUnifiedSearch(
  input: { q?: unknown; category?: unknown; page?: unknown } = {},
): Promise<UnifiedSearchData> {
  const q = normalizeSearchQuery(input.q);
  const category = searchCategory(input.category);
  const page = category ? searchPage(input.page) : 1;
  const researchExamples = searchGameInfoExamples(q);
  const state = await getCurrentAuthState();
  const mock = state.user?.isMock === true || state.user?.id.startsWith("demo-") === true;
  let actor: CurrentUser | null = null;
  let mode: UnifiedSearchData["mode"] =
    mock || !resolveDatabaseUrl(process.env) ? "DEMO" : "PUBLIC";
  let notice: string | null =
    mode === "DEMO"
      ? "미리보기에서는 페이지·지도·장비와 표시 중인 게임 정보 예시를 검색합니다. 실제 하이브 게시물은 포함되지 않습니다."
      : null;
  let groups: SearchGroup[] = [];
  if (mode !== "DEMO") {
    // This request's auth reader already verifies the current grant and bounded Guild
    // evidence (at most five minutes). Keep typing within that established policy;
    // do not spend a second Discord membership request for each search keystroke.
    const eligible = state.status === "AUTHENTICATED" && isSearchMember(state.user);
    if (!eligible && state.status !== "GUEST") {
      mode = "LIMITED";
      notice =
        state.status === "UNAVAILABLE" ||
        state.status === "REAUTH_REQUIRED" ||
        state.status === "LEFT"
          ? "멤버 권한을 확인할 수 없어 공개 콘텐츠만 검색합니다. Discord 연결을 확인해 주세요."
          : "승인된 멤버로 로그인하면 하이브의 빌드·글·파티·공지도 검색할 수 있습니다.";
    }
    try {
      groups = await getDb().transaction(
        async (transaction) => {
          await transaction.execute(sql`set local statement_timeout = '2500ms'`);
          await transaction.execute(
            sql`select pg_advisory_xact_lock_shared(${AUTHORIZATION_LOCK})`,
          );
          if (eligible && state.user) {
            const [fresh] = await transaction
              .select({ id: users.id, name: users.name, role: users.role })
              .from(users)
              .where(eq(users.id, state.user.id))
              .for("share");
            const [discord] = await transaction
              .select({ id: accounts.id })
              .from(accounts)
              .where(and(eq(accounts.userId, state.user.id), eq(accounts.provider, "discord")))
              .limit(1);
            const candidate = fresh ? { ...fresh, isMock: false } : null;
            if (discord && isSearchMember(candidate)) {
              actor = candidate;
              mode = "LIVE";
            } else {
              mode = "LIMITED";
              notice = "현재 계정 권한으로 공개 콘텐츠만 검색합니다.";
            }
          }
          return readDatabaseGroups(transaction, actor, q, category, page, researchExamples.length);
        },
        { isolationLevel: "repeatable read" },
      );
    } catch {
      actor = null;
      mode = "LIMITED";
      notice =
        "게시물 검색에 연결할 수 없습니다. 페이지·지도·장비·게임 정보 예시 검색은 계속 이용할 수 있습니다.";
      groups = [];
    }
  }
  let staticItems = [
    ...searchStaticContent(q, actor).filter((item) => item.category !== "research"),
    ...researchExamples,
  ];
  if (q && (!category || category === "news")) {
    const overview = await getSteamOverview().catch(() => null);
    staticItems = [
      ...staticItems,
      ...(overview?.news.items ?? [])
        .filter((item) => searchMatches(q, item.title, item.summary))
        .map((item): SearchItem => ({
          id: item.id,
          category: "news",
          title: item.title,
          excerpt: searchExcerpt(item.summary),
          href: item.url,
          external: true,
        })),
    ];
  }
  const size = category ? CATEGORY_SIZE : GROUP_SIZE;
  for (const key of Object.keys(SEARCH_CATEGORIES) as SearchCategory[]) {
    if (category && key !== category) continue;
    const matchingItems = staticItems.filter((item) => item.category === key);
    if (!matchingItems.length) continue;
    const start = category ? (page - 1) * size : 0;
    if (key === "research") {
      const existing = groups.find((group) => group.category === key);
      if (existing) {
        existing.items = [...matchingItems.slice(start, start + size), ...existing.items].slice(
          0,
          size,
        );
        existing.hasMore ||= matchingItems.length > start + size;
        continue;
      }
    }
    groups.push({
      category: key,
      items: matchingItems.slice(start, start + size),
      hasMore: matchingItems.length > start + size,
    });
  }
  groups.sort(
    (left, right) =>
      Object.keys(SEARCH_CATEGORIES).indexOf(left.category) -
      Object.keys(SEARCH_CATEGORIES).indexOf(right.category),
  );
  return { q, page, category, groups, mode, notice };
}
