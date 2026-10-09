import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const BATCH = "uniz-starter-content-2026-10-08-v1";
const root = new URL("../../../", import.meta.url);
const content = new URL("./fixtures/sample-content/", import.meta.url);
const output = new URL("outputs/sample-content/", root);
const apply = process.argv.includes("--apply");
class SeedError extends Error {}
function check(condition, message) {
  if (!condition) throw new SeedError(message);
}
check(
  process.argv.slice(2).every((arg) => arg === "--apply"),
  "Use --apply or no arguments.",
);
for (const relative of [".env", "apps/web/.env.local"]) {
  const file = new URL(relative, root);
  if (existsSync(file)) process.loadEnvFile(file);
}
check(process.env.NODE_ENV !== "production", "Sample content is restricted to local development.");
let target;
try {
  target = new URL(process.env.DATABASE_URL ?? "");
} catch {
  throw new SeedError("A valid local database connection is required.");
}
check(
  ["postgres:", "postgresql:"].includes(target.protocol) &&
    ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) &&
    target.port === "5433" &&
    target.pathname === "/uniz_hive",
  "The configured local UNIZ database is required.",
);
const requireRoot = createRequire(new URL("package.json", root));
const requireVitest = createRequire(requireRoot.resolve("vitest/package.json"));
const requireVite = createRequire(requireVitest.resolve("vite/package.json"));
const { tsImport } = await import(pathToFileURL(requireVite.resolve("tsx/esm/api")).href);
const engine = await tsImport("../../../packages/build-engine/src/index.ts", import.meta.url);
const communityPolicy = await tsImport("../src/lib/community-policy.ts", import.meta.url);
const buildPolicy = await tsImport("../src/lib/build-planner-policy.ts", import.meta.url);
const partyPolicy = await tsImport("../src/lib/party-admin-policy.ts", import.meta.url);
const partyContent = await tsImport("../src/lib/party-content.ts", import.meta.url);
const operationPolicy = await tsImport("../src/lib/operation-admin-policy.ts", import.meta.url);

function readDrafts(name) {
  const data = JSON.parse(readFileSync(new URL(name, content), "utf8"));
  check(Array.isArray(data), `${name} must contain a list.`);
  return data;
}
function stableId(kind, key) {
  const hex = createHash("sha256").update(`${BATCH}:${kind}:${key}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}
function grouped(items, field) {
  return Object.fromEntries(
    [...new Set(items.map((item) => item[field]))].map((key) => [
      key,
      items.filter((item) => item[field] === key).length,
    ]),
  );
}
function validateDraftCounts(items, field, expected) {
  const counts = grouped(items, field);
  check(
    JSON.stringify(Object.keys(counts).sort()) === JSON.stringify([...expected].sort()),
    `Unexpected ${field} categories.`,
  );
  check(
    Object.values(counts).every((count) => count === 5),
    `Each ${field} must contain five examples.`,
  );
}
function schedule(draft, categoryIndex, now, seasonStartsAt) {
  const baseTime = Math.max(now.getTime(), seasonStartsAt.getTime());
  const base = new Date(baseTime + 9 * 3600000);
  const variant = Number(draft.sampleKey.split("-").at(-1));
  const day = new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate() + 1 + (variant - 1) + Math.floor(categoryIndex / 4) * 7,
    ),
  );
  const preferred = draft.preferredTime;
  const weekday = preferred.startsWith("토요일")
    ? 6
    : preferred.startsWith("일요일")
      ? 0
      : preferred.startsWith("금요일")
        ? 5
        : null;
  while (weekday === null ? [0, 6].includes(day.getUTCDay()) : day.getUTCDay() !== weekday) {
    day.setUTCDate(day.getUTCDate() + 1);
  }
  const time = preferred.match(/(\d{2}):(\d{2})/);
  check(Boolean(time), "A sample party needs a preferred time.");
  const startsAt = new Date(
    day.getTime() + Number(time[1]) * 3600000 + Number(time[2]) * 60000 - 9 * 3600000,
  );
  return { startsAt, endsAt: new Date(startsAt.getTime() + draft.durationMinutes * 60000) };
}

const buildDrafts = readDrafts("build-drafts.json");
const postDrafts = readDrafts("community-drafts.json");
const partyDrafts = readDrafts("party-drafts.json");
validateDraftCounts(buildDrafts, "visibility", ["HIVE", "PUBLIC"]);
validateDraftCounts(postDrafts, "category", communityPolicy.COMMUNITY_CATEGORIES);
validateDraftCounts(
  partyDrafts,
  "contentKey",
  partyContent.PARTY_CONTENTS.map((item) => item.key),
);
const preparedBuilds = buildDrafts.map((draft) => {
  check(draft.title.startsWith("[예시]"), "Sample builds must be labeled.");
  const parsed = buildPolicy.parseBuildPlannerMutation({
    action: "SAVE_BUILD",
    title: draft.title,
    description: draft.description,
    visibility: draft.visibility,
    loadout: draft.snapshot,
    notes: draft.versionNotes,
  });
  return {
    ...parsed,
    key: draft.key,
    id: stableId("build", draft.key),
    versionId: stableId("build_version", draft.key),
  };
});
check(new Set(preparedBuilds.map((item) => item.key)).size === 10, "Build keys must be unique.");
const hiveBuilds = preparedBuilds.filter((item) => item.visibility === "HIVE");
const postBuilds = new Map(
  hiveBuilds.map((item, index) => [`community-build-0${index + 1}`, item]),
);
const preparedPosts = postDrafts.map((draft) => {
  check(draft.title.startsWith("[예시]"), "Sample posts must be labeled.");
  const build = draft.buildKey ? postBuilds.get(draft.buildKey) : null;
  check(!draft.buildKey || Boolean(build), "A sample build post needs its shared build.");
  const parsed = communityPolicy.communityPostSaveSchema.parse({
    title: draft.title,
    body: draft.body,
    category: draft.category,
    buildVersionId: build?.versionId ?? null,
    isPinned: false,
  });
  return { ...parsed, key: draft.draftKey, id: stableId("community_post", draft.draftKey) };
});
check(new Set(preparedPosts.map((item) => item.key)).size === 25, "Post keys must be unique.");
const requireDb = createRequire(new URL("packages/db/package.json", root));
const sql = requireDb("postgres")(target.toString(), {
  max: 1,
  prepare: false,
  onnotice: () => {},
});
try {
  const result = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(912743110)`;
    const admins = await tx`select u.id,u.name from users u
      where u.role='ADMIN'
      and exists(select 1 from accounts a where a.user_id=u.id and a.provider='discord')
      and exists(select 1 from member_profiles p where p.user_id=u.id and length(trim(p.once_human_uid))>0 and length(trim(p.once_human_nickname))>=2 and length(trim(p.handle))>=3)
      for share of u`;
    check(admins.length === 1, "One existing approved local administrator is required.");
    const author = admins[0];
    const seasons = await tx`select s.*,sc.slug as scenario_slug from seasons s
      inner join scenarios sc on sc.id=s.scenario_id
      where s.approval_status='APPROVED' and s.status in ('PLANNED','ACTIVE') for update of s`;
    check(seasons.length === 1, "One existing open approved season is required.");
    const season = seasons[0];
    const allowed = partyContent.getPartyContentOptions({
      scenarioSlug: season.scenario_slug,
      trancePhenomenon: season.trance_phenomenon,
      gravityContentEnabled: season.gravity_content_enabled,
    });
    // The user explicitly asked to preserve the current environment and defer condensers.
    const activeContents = allowed.filter((item) => item.key !== "gravity-condenser");
    const selectedParties = partyDrafts.filter((draft) =>
      activeContents.some((item) => item.key === draft.contentKey),
    );
    check(
      selectedParties.length === 40,
      "The existing season must support the agreed eight party categories.",
    );
    check(
      new Set(selectedParties.map((item) => item.sampleKey)).size === 40,
      "Party keys must be unique.",
    );
    const now = new Date();
    const preparedParties = selectedParties.map((draft) => {
      check(draft.title.startsWith("[예시]"), "Sample parties must be labeled.");
      const categoryIndex = activeContents.findIndex((item) => item.key === draft.contentKey);
      const contentItem = activeContents[categoryIndex];
      const times = schedule(draft, categoryIndex, now, season.starts_at);
      const parsed = partyPolicy.partySaveSchema.parse({
        seasonId: season.id,
        contentKey: draft.contentKey,
        title: draft.title,
        description: draft.description,
        meetingPoint: draft.meetingPoint,
        capacity: draft.capacity,
        startsAt: times.startsAt.toISOString(),
        endsAt: times.endsAt.toISOString(),
        status: "SCHEDULED",
      });
      operationPolicy.assertOperationSaveAllowed({
        input: { ...parsed, action: "SAVE_OPERATION", type: contentItem.type },
        existing: null,
        currentSeason: null,
        targetSeason: {
          id: season.id,
          status: season.status,
          approvalStatus: season.approval_status,
          startsAt: season.starts_at,
          settlementAt: season.settlement_at,
        },
        participantCount: 0,
        goingCount: 0,
        now,
      });
      return {
        ...parsed,
        ...times,
        type: contentItem.type,
        key: draft.sampleKey,
        id: stableId("operation", draft.sampleKey),
      };
    });
    const manifest = [
      ...preparedBuilds.map((item) => ({
        kind: "build",
        id: item.id,
        key: item.key,
        href: `/lab/b/${item.id}`,
      })),
      ...preparedPosts.map((item) => ({
        kind: "community_post",
        id: item.id,
        key: item.key,
        href: `/community/${item.id}`,
      })),
      ...preparedParties.map((item) => ({
        kind: "operation",
        id: item.id,
        key: item.key,
        href: `/ops/${item.id}`,
      })),
    ];
    const summary = {
      batch: BATCH,
      applied: apply,
      counts: {
        builds: grouped(preparedBuilds, "visibility"),
        community: grouped(preparedPosts, "category"),
        parties: grouped(preparedParties, "contentKey"),
      },
      deferred: { "gravity-condenser": 5 },
      seasonId: season.id,
      partyDateRange: {
        startsAt: preparedParties.reduce(
          (a, b) => (a < b.startsAt ? a : b.startsAt),
          preparedParties[0].startsAt,
        ),
        endsAt: preparedParties.reduce(
          (a, b) => (a > b.endsAt ? a : b.endsAt),
          preparedParties[0].endsAt,
        ),
      },
      created: 0,
      skipped: 0,
      manifest,
    };
    if (!apply) return summary;
    const [before] = await tx`select (select count(*)::integer from users) as users,
      (select count(*)::integer from season_memberships) as memberships,
      (select count(*)::integer from operation_participants) as responses`;
    async function audit(kind, item, action, metadata = {}) {
      await tx`insert into audit_logs(id,actor_id,action,entity_type,entity_id,metadata,created_at,updated_at)
        values(${stableId("audit", `${kind}:${item.key}`)},${author.id},${action},${kind},${item.id},
          ${tx.json({ source: "LOCAL_SAMPLE_CONTENT", batch: BATCH, sampleKey: item.key, ...metadata })},${now},${now})`;
      summary.created++;
    }
    for (const item of preparedBuilds) {
      const [existing] = await tx`select owner_id from builds where id=${item.id}`;
      if (existing) {
        check(existing.owner_id === author.id, "An existing sample has a different owner.");
        summary.skipped++;
        continue;
      }
      await tx`insert into builds(id,owner_id,title,description,visibility,created_at,updated_at)
        values(${item.id},${author.id},${item.title},${item.description},${item.visibility},${now},${now})`;
      await tx`insert into build_versions(id,build_id,version,schema_version,loadout_snapshot,notes,created_at,updated_at)
        values(${item.versionId},${item.id},1,${engine.GEAR_SCHEMA_VERSION},${tx.json(item.loadout)},${item.notes},${now},${now})`;
      await audit("build", item, "build.created", { visibility: item.visibility, version: 1 });
    }
    for (const item of preparedPosts) {
      const [existing] = await tx`select author_id from community_posts where id=${item.id}`;
      if (existing) {
        check(existing.author_id === author.id, "An existing sample has a different author.");
        summary.skipped++;
        continue;
      }
      if (item.buildVersionId) {
        const [linked] = await tx`select b.owner_id,b.visibility,b.archived_at from build_versions v
          inner join builds b on b.id=v.build_id where v.id=${item.buildVersionId}`;
        check(
          linked?.owner_id === author.id &&
            ["HIVE", "PUBLIC"].includes(linked.visibility) &&
            linked.archived_at === null,
          "The linked build must belong to the author and remain shared.",
        );
      }
      await tx`insert into community_posts(id,author_id,category,title,body,build_version_id,is_pinned,created_at,updated_at)
        values(${item.id},${author.id},${item.category},${item.title},${item.body},${item.buildVersionId},false,${now},${now})`;
      await audit("community_post", item, "community.post_created", { category: item.category });
    }
    for (const item of preparedParties) {
      const [existing] =
        await tx`select created_by_id,season_id from operations where id=${item.id}`;
      if (existing) {
        check(
          existing.created_by_id === author.id && existing.season_id === season.id,
          "An existing sample belongs to another author or season.",
        );
        summary.skipped++;
        continue;
      }
      await tx`insert into operations(id,season_id,created_by_id,title,type,content_key,meeting_point,description,starts_at,ends_at,capacity,status,created_at,updated_at)
        values(${item.id},${season.id},${author.id},${item.title},${item.type},${item.contentKey},${item.meetingPoint},${item.description},
          ${item.startsAt},${item.endsAt},${item.capacity},'SCHEDULED',${now},${now})`;
      await audit("operation", item, "party.created", {
        seasonId: season.id,
        contentKey: item.contentKey,
        status: "SCHEDULED",
      });
    }
    const [after] = await tx`select (select count(*)::integer from users) as users,
      (select count(*)::integer from season_memberships) as memberships,
      (select count(*)::integer from operation_participants) as responses`;
    check(
      JSON.stringify(before) === JSON.stringify(after),
      "Existing member and participation counts must remain unchanged.",
    );
    const versions =
      await tx`select schema_version,loadout_snapshot from build_versions where id in ${tx(preparedBuilds.map((item) => item.versionId))}`;
    check(
      versions.length === 10 &&
        versions.every((item) =>
          engine.parseVersionedPlannerSnapshot(item.schema_version, item.loadout_snapshot),
        ),
      "All ten stored build versions must be readable.",
    );
    summary.existingMemberDataPreserved = true;
    const persistedParties =
      await tx`select starts_at,ends_at from operations where id in ${tx(preparedParties.map((item) => item.id))}`;
    check(persistedParties.length === 40, "All forty sample parties must be saved.");
    summary.partyDateRange = {
      startsAt: persistedParties.reduce(
        (a, b) => (a < b.starts_at ? a : b.starts_at),
        persistedParties[0].starts_at,
      ),
      endsAt: persistedParties.reduce(
        (a, b) => (a > b.ends_at ? a : b.ends_at),
        persistedParties[0].ends_at,
      ),
    };
    return summary;
  });
  mkdirSync(output, { recursive: true });
  writeFileSync(
    new URL(apply ? "seed-result.json" : "seed-preview.json", output),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  const { manifest, ...summary } = result;
  console.log(JSON.stringify({ ...summary, totalExamples: manifest.length }, null, 2));
} catch (error) {
  console.error(
    error instanceof SeedError
      ? error.message
      : `Sample data was not applied (${error?.code ?? error?.name ?? "validation failure"}).`,
  );
  process.exitCode = 1;
} finally {
  await sql.end();
}
