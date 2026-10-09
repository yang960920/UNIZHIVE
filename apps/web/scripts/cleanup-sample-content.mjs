import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export const SAMPLE_BATCH = "uniz-starter-content-2026-10-08-v1";
const root = new URL("../../../", import.meta.url);
const output = new URL("outputs/sample-content/", root);
const definitions = new URL("./fixtures/sample-content/", import.meta.url);
const backupDirectory = new URL("artifacts/sample-content-cleanup/", root);
const previewFile = new URL("cleanup-plan.json", output);
const tables = { build: "builds", community_post: "community_posts", operation: "operations" };
export class CleanupError extends Error {}
function check(condition, message) {
  if (!condition) throw new CleanupError(message);
}
export function checksum(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function stableId(kind, key) {
  const h = createHash("sha256")
    .update(`${SAMPLE_BATCH}:${kind}:${key}`)
    .digest("hex")
    .slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20)}`;
}
export function knownDefinition() {
  const manifest = JSON.parse(
    readFileSync(new URL("original-seed-manifest.json", definitions), "utf8"),
  );
  check(
    manifest.batch === SAMPLE_BATCH && manifest.applied === true,
    "Original applied sample manifest required.",
  );
  const buildDrafts = JSON.parse(readFileSync(new URL("build-drafts.json", definitions), "utf8"));
  const postDrafts = JSON.parse(
    readFileSync(new URL("community-drafts.json", definitions), "utf8"),
  );
  const partyDrafts = JSON.parse(readFileSync(new URL("party-drafts.json", definitions), "utf8"));
  const drafts = { build: buildDrafts, community_post: postDrafts, operation: partyDrafts };
  const expected = manifest.manifest.map((entry) => {
    const draft = drafts[entry.kind]?.find(
      (row) => (row.key ?? row.draftKey ?? row.sampleKey) === entry.key,
    );
    check(
      draft && entry.id === stableId(entry.kind, entry.key) && draft.title.startsWith("[예시]"),
      "Manifest ID/title/provenance mismatch.",
    );
    return { ...entry, title: draft.title };
  });
  check(
    expected.length === 75 && new Set(expected.map((row) => row.id)).size === 75,
    "Exactly the original 75 unique sample IDs are required.",
  );
  for (const [kind, count] of Object.entries({ build: 10, community_post: 25, operation: 40 }))
    check(
      expected.filter((row) => row.kind === kind).length === count,
      "Unexpected original sample counts.",
    );
  return expected;
}

export function makeCleanupPlan(snapshot, definition, now = new Date()) {
  const index = new Map(definition.map((row) => [row.id, row]));
  const owners = new Set();
  for (const [kind, rows] of Object.entries(snapshot.rows)) {
    check(
      rows.length === definition.filter((item) => item.kind === kind).length,
      "A sample is missing; refresh or review the existing cleanup first.",
    );
    for (const row of rows) {
      const expected = index.get(row.id);
      check(
        expected?.kind === kind && expected.title === row.title && row.title.startsWith("[예시]"),
        "Unexpected sample ID, title or type; preserve it.",
      );
      const audits = snapshot.seedAudits.filter(
        (audit) => audit.entity_id === row.id && audit.entity_type === kind,
      );
      const owner = row.owner_id ?? row.author_id ?? row.created_by_id;
      check(
        audits.length === 1 &&
          audits[0].actor_id === owner &&
          audits[0].metadata.source === "LOCAL_SAMPLE_CONTENT" &&
          audits[0].metadata.batch === SAMPLE_BATCH &&
          audits[0].metadata.sampleKey === expected.key,
        "Sample audit provenance mismatch; preserve it.",
      );
      owners.add(owner);
      check(
        kind === "operation" ? row.status === "SCHEDULED" : !row.archived_at,
        "Sample state changed; preserve it until reviewed.",
      );
      if (kind === "community_post")
        check(
          row.category !== "SHOWCASE",
          "Actual showcase content must never enter this cleanup.",
        );
    }
  }
  check(
    owners.size === 1 && owners.has(snapshot.actor.id),
    "The current linked administrator must be the original sample author.",
  );
  check(
    snapshot.actor.role === "ADMIN" && snapshot.actor.discord_valid === true,
    "A current approved Discord administrator is required.",
  );
  const posts = snapshot.rows.community_post.slice().sort((a, b) => {
    const interaction = (id) =>
      snapshot.postInteractions.find((row) => row.id === id)?.interactions ?? 0;
    return interaction(b.id) - interaction(a.id) || a.id.localeCompare(b.id);
  });
  const keepPost = posts[0];
  const linkedBuildId = keepPost.build_version_id
    ? snapshot.versionLinks.find((row) => row.id === keepPost.build_version_id)?.build_id
    : null;
  const keepBuild =
    snapshot.rows.build.find((row) => row.id === linkedBuildId) ??
    snapshot.rows.build.find((row) => row.id === stableId("build", "public-rifle-general"));
  check(keepBuild, "One representative sample build is required.");
  const keepParty = snapshot.rows.operation
    .filter((row) => new Date(row.starts_at) > now)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at) || a.id.localeCompare(b.id))[0];
  check(keepParty, "No upcoming example party remains; do not manufacture a new schedule.");
  const removePartyIds = snapshot.rows.operation
    .filter((row) => row.id !== keepParty.id)
    .map((row) => row.id);
  check(
    removePartyIds.every((id) =>
      snapshot.partyDependencies.some(
        (row) => row.id === id && row.participants === 0 && row.roles === 0,
      ),
    ),
    "A party has missing or participant/role data; preserve it.",
  );
  const keep = { build: keepBuild.id, community_post: keepPost.id, operation: keepParty.id };
  const archive = {
    build: snapshot.rows.build.filter((row) => row.id !== keep.build).map((row) => row.id),
    community_post: snapshot.rows.community_post
      .filter((row) => row.id !== keep.community_post)
      .map((row) => row.id),
  };
  check(
    archive.build.length === 9 &&
      archive.community_post.length === 24 &&
      removePartyIds.length === 39,
    "Unexpected cleanup boundary.",
  );
  return {
    batch: SAMPLE_BATCH,
    createdAt: now.toISOString(),
    snapshotHash: checksum(snapshot),
    keep,
    archive,
    deletePartyIds: removePartyIds,
    keepTitles: {
      build: keepBuild.title,
      community_post: keepPost.title,
      operation: keepParty.title,
    },
  };
}

async function snapshot(tx, definition) {
  const rows = {};
  for (const [kind, table] of Object.entries(tables)) {
    const ids = definition.filter((item) => item.kind === kind).map((item) => item.id);
    rows[kind] = await tx`select * from ${tx(table)} where id in ${tx(ids)} order by id`;
  }
  const seedAudits =
    await tx`select actor_id,entity_type,entity_id,metadata from audit_logs where metadata->>'source'='LOCAL_SAMPLE_CONTENT' and metadata->>'batch'=${SAMPLE_BATCH} order by entity_type,entity_id`;
  const actorIds = [...new Set(seedAudits.map((row) => row.actor_id))];
  check(actorIds.length === 1 && actorIds[0], "Exactly one original seed author is required.");
  const [actor] =
    await tx`select u.id,u.role,exists(select 1 from accounts a where a.user_id=u.id and a.provider='discord' and a.access_token is not null and a.expires_at > extract(epoch from now()) + 30 and regexp_split_to_array(coalesce(a.scope,''),'\\s+') @> array['identify','guilds.members.read']) as discord_valid from users u where u.id=${actorIds[0]}`;
  check(actor, "Original sample author is unavailable.");
  const versionLinks =
    await tx`select id,build_id from build_versions where build_id in ${tx(definition.filter((row) => row.kind === "build").map((row) => row.id))} order by id`;
  const postInteractions =
    await tx`select p.id,((select count(*) from community_comments c where c.post_id=p.id)+(select count(*) from community_post_likes l where l.post_id=p.id))::integer as interactions from community_posts p where p.id in ${tx(definition.filter((row) => row.kind === "community_post").map((row) => row.id))} order by p.id`;
  const partyDependencies =
    await tx`select o.id,(select count(*)::integer from operation_participants p where p.operation_id=o.id) as participants,(select count(*)::integer from operation_roles r where r.operation_id=o.id) as roles from operations o where o.id in ${tx(definition.filter((row) => row.kind === "operation").map((row) => row.id))} order by o.id`;
  return { actor, rows, seedAudits, versionLinks, postInteractions, partyDependencies };
}
async function protectedHashes(tx, definition) {
  const hashes = {};
  for (const [kind, table] of Object.entries(tables)) {
    const ids = definition.filter((row) => row.kind === kind).map((row) => row.id);
    const [row] =
      await tx`select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) as hash from ${tx(table)} t where t.id not in ${tx(ids)}`;
    hashes[table] = row.hash;
  }
  // Only hashes leave PostgreSQL: actual article text, UID, image bytes and grants are not backed up.
  for (const table of [
    "users",
    "member_profiles",
    "member_profile_images",
    "announcements",
    "community_comments",
    "community_post_likes",
    "community_comment_likes",
    "build_likes",
    "content_images",
    "content_image_references",
    "seasons",
    "season_memberships",
    "operation_participants",
    "operation_roles",
  ]) {
    const [row] =
      await tx`select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) as hash from ${tx(table)} t`;
    hashes[table] = row.hash;
  }
  const [actualPost] =
    await tx`select id from community_posts where title='용딸님 숭배자들' and category='SHOWCASE' and archived_at is null`;
  check(actualPost, "The protected actual showcase post must remain intact.");
  hashes.protectedPostId = actualPost.id;
  return hashes;
}
async function targetState(tx, plan) {
  const builds = await tx`select * from builds where id in ${tx(plan.archive.build)} order by id`;
  const posts =
    await tx`select * from community_posts where id in ${tx(plan.archive.community_post)} order by id`;
  const parties =
    await tx`select * from operations where id in ${tx(plan.deletePartyIds)} order by id`;
  const requests =
    await tx`select * from build_share_requests where build_id in ${tx(plan.archive.build)} order by id`;
  const publications =
    await tx`select * from build_publications where build_id in ${tx(plan.archive.build)} order by build_id`;
  return { builds, posts, parties, requests, publications };
}
function writeBackup(file, backup, exclusive = false) {
  mkdirSync(backupDirectory, { recursive: true });
  const value = { ...backup, checksum: checksum(backup) };
  writeFileSync(new URL(file, backupDirectory), `${JSON.stringify(value, null, 2)}\n`, {
    flag: exclusive ? "wx" : "w",
    mode: 0o600,
  });
}
function readBackup(file) {
  check(
    /^cleanup-backup-[a-z0-9-]+\.json$/.test(file),
    "Choose a backup filename from artifacts/sample-content-cleanup only.",
  );
  const { checksum: digest, ...backup } = JSON.parse(
    readFileSync(new URL(file, backupDirectory), "utf8"),
  );
  check(
    checksum(backup) === digest && backup.plan?.batch === SAMPLE_BATCH,
    "Backup checksum/batch mismatch.",
  );
  return backup;
}
async function audit(tx, actorId, action, kind, id, runId) {
  await tx`insert into audit_logs(actor_id,action,entity_type,entity_id,metadata) values(${actorId},${action},${kind},${id},${tx.json({ source: "LOCAL_SAMPLE_CLEANUP", batch: SAMPLE_BATCH, runId })})`;
}
async function applyCleanup(sql, definition) {
  check(existsSync(previewFile), "Run the read-only preview before --apply.");
  const approvedPlan = JSON.parse(readFileSync(previewFile, "utf8"));
  check(
    Date.now() - new Date(approvedPlan.createdAt).getTime() <= 30 * 60 * 1000,
    "The preview is older than 30 minutes; refresh it before applying.",
  );
  const runId = randomUUID();
  const file = `cleanup-backup-${Date.now()}-${runId}.json`;
  let backup;
  await sql.begin("isolation level serializable", async (tx) => {
    await tx`set local lock_timeout='5s'`;
    await tx`select pg_advisory_xact_lock(912743110)`;
    for (const [kind, table] of Object.entries(tables))
      await tx`select id from ${tx(table)} where id in ${tx(definition.filter((item) => item.kind === kind).map((item) => item.id))} order by id for update`;
    const before = await snapshot(tx, definition);
    const plan = makeCleanupPlan(before, definition, new Date(approvedPlan.createdAt));
    check(
      checksum(plan) === checksum(approvedPlan),
      "The preview or underlying samples changed; no cleanup applied.",
    );
    check(
      before.rows.operation.find((row) => row.id === plan.keep.operation)?.starts_at > new Date(),
      "The retained party is no longer upcoming; refresh the preview.",
    );
    const protectedBefore = await protectedHashes(tx, definition);
    const targetsBefore = await targetState(tx, plan);
    check(
      targetsBefore.publications.length === 0,
      "A sample build is actively published; preserve it for manual review.",
    );
    backup = {
      runId,
      file,
      actorId: before.actor.id,
      status: "PREPARED",
      plan,
      protectedBefore,
      targetsBefore,
      targetsAfter: null,
    };
    writeBackup(file, backup, true);
    await tx`update builds set archived_at=now(),updated_at=greatest(now(),updated_at+interval '1 millisecond') where id in ${tx(plan.archive.build)} and archived_at is null`;
    await tx`update build_share_requests set status='CANCELLED',updated_at=greatest(now(),updated_at+interval '1 millisecond') where build_id in ${tx(plan.archive.build)} and status='PENDING'`;
    await tx`update community_posts set archived_at=now(),updated_at=greatest(now(),updated_at+interval '1 millisecond') where id in ${tx(plan.archive.community_post)} and archived_at is null`;
    const removed =
      await tx`delete from operations where id in ${tx(plan.deletePartyIds)} returning id`;
    check(removed.length === 39, "Exactly 39 original sample parties must be removed.");
    for (const id of plan.archive.build)
      await audit(tx, before.actor.id, "sample.cleanup.archived", "build", id, runId);
    for (const id of plan.archive.community_post)
      await audit(tx, before.actor.id, "sample.cleanup.archived", "community_post", id, runId);
    for (const id of plan.deletePartyIds)
      await audit(tx, before.actor.id, "sample.cleanup.removed", "operation", id, runId);
    const after = await targetState(tx, plan);
    check(
      after.builds.length === 9 &&
        after.builds.every((row) => row.archived_at) &&
        after.posts.length === 24 &&
        after.posts.every((row) => row.archived_at) &&
        after.parties.length === 0,
      "Cleanup post-check failed; transaction will roll back.",
    );
    const [remaining] =
      await tx`select (select count(*)::integer from builds where id in ${tx(definition.filter((row) => row.kind === "build").map((row) => row.id))} and archived_at is null) as builds,(select count(*)::integer from community_posts where id in ${tx(definition.filter((row) => row.kind === "community_post").map((row) => row.id))} and archived_at is null) as posts,(select count(*)::integer from operations where id in ${tx(definition.filter((row) => row.kind === "operation").map((row) => row.id))}) as parties`;
    check(
      remaining.builds === 1 && remaining.posts === 1 && remaining.parties === 1,
      "One-example-per-area post-check failed.",
    );
    check(
      checksum(await protectedHashes(tx, definition)) === checksum(protectedBefore),
      "Actual content or its dependencies changed; transaction will roll back.",
    );
    backup.targetsAfter = after;
    writeBackup(file, backup);
  });
  backup.status = "APPLIED";
  writeBackup(file, backup);
  return {
    applied: true,
    archivedBuilds: 9,
    archivedPosts: 24,
    removedParties: 39,
    protectedActualContentPreserved: true,
    backup: `artifacts/sample-content-cleanup/${file}`,
    keep: backup.plan.keepTitles,
  };
}
async function restore(sql, definition, file, apply) {
  const backup = readBackup(file);
  check(backup.targetsAfter, "Backup has no completed target-state proof.");
  const valid = Object.fromEntries(
    Object.keys(tables).map((kind) => [
      kind,
      new Set(definition.filter((row) => row.kind === kind).map((row) => row.id)),
    ]),
  );
  check(
    backup.plan.archive.build.every((id) => valid.build.has(id)) &&
      backup.plan.archive.community_post.every((id) => valid.community_post.has(id)) &&
      backup.plan.deletePartyIds.every((id) => valid.operation.has(id)) &&
      backup.plan.archive.build.length === 9 &&
      backup.plan.archive.community_post.length === 24 &&
      backup.plan.deletePartyIds.length === 39,
    "Backup target boundaries are invalid.",
  );
  return sql.begin(
    apply ? "isolation level serializable" : "isolation level repeatable read read only",
    async (tx) => {
      if (apply) {
        await tx`set local lock_timeout='5s'`;
        await tx`select pg_advisory_xact_lock(912743110)`;
      }
      const [actor] =
        await tx`select u.id from users u where u.id=${backup.actorId} and u.role='ADMIN' and exists(select 1 from accounts a where a.user_id=u.id and a.provider='discord' and a.access_token is not null and a.expires_at > extract(epoch from now()) + 30 and regexp_split_to_array(coalesce(a.scope,''),'\\s+') @> array['identify','guilds.members.read'])`;
      check(actor, "The original approved administrator must remain connected.");
      const originalAudits =
        await tx`select actor_id,entity_type,entity_id,metadata from audit_logs where metadata->>'source'='LOCAL_SAMPLE_CONTENT' and metadata->>'batch'=${SAMPLE_BATCH}`;
      for (const entry of definition) {
        const matching = originalAudits.filter(
          (row) =>
            row.entity_type === entry.kind &&
            row.entity_id === entry.id &&
            row.actor_id === backup.actorId &&
            row.metadata.sampleKey === entry.key,
        );
        check(matching.length === 1, "Original sample audit changed; restoration is blocked.");
      }
      check(
        checksum(await targetState(tx, backup.plan)) === checksum(backup.targetsAfter),
        "A target changed after cleanup; preserve it and review manually.",
      );
      if (!apply)
        return {
          applied: false,
          restore: file,
          wouldRestore: { builds: 9, posts: 24, parties: 39 },
        };
      const protectedBefore = await protectedHashes(tx, definition);
      for (const row of backup.targetsBefore.builds)
        await tx`update builds set archived_at=${row.archived_at},updated_at=${row.updated_at} where id=${row.id}`;
      for (const row of backup.targetsBefore.posts)
        await tx`update community_posts set archived_at=${row.archived_at},updated_at=${row.updated_at} where id=${row.id}`;
      for (const row of backup.targetsBefore.requests)
        await tx`update build_share_requests set status=${row.status},updated_at=${row.updated_at} where id=${row.id}`;
      for (const row of backup.targetsBefore.parties) await tx`insert into operations ${tx(row)}`;
      check(
        checksum(await targetState(tx, backup.plan)) === checksum(backup.targetsBefore),
        "Restoration post-check failed; transaction will roll back.",
      );
      check(
        checksum(await protectedHashes(tx, definition)) === checksum(protectedBefore),
        "Actual data changed during restoration; transaction will roll back.",
      );
      await audit(
        tx,
        backup.actorId,
        "sample.cleanup.restored",
        "sample_cleanup",
        backup.runId,
        backup.runId,
      );
      return {
        applied: true,
        restored: file,
        restoredBuilds: 9,
        restoredPosts: 24,
        restoredParties: 39,
        actualContentPreserved: true,
      };
    },
  );
}

async function main() {
  const args = process.argv.slice(2);
  check(
    args.every(
      (arg) => arg === "--apply" || /^--restore=cleanup-backup-[a-z0-9-]+\.json$/.test(arg),
    ),
    "Use no arguments, --apply, or --restore=<backup filename> [--apply].",
  );
  const restoreArg = args.find((arg) => arg.startsWith("--restore="));
  for (const relative of [".env", "apps/web/.env.local"])
    if (existsSync(new URL(relative, root))) process.loadEnvFile(new URL(relative, root));
  check(
    process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1",
    "Local cleanup cannot run in production.",
  );
  let target;
  try {
    target = new URL(process.env.DATABASE_URL ?? "");
  } catch {
    throw new CleanupError("A valid local database connection is required.");
  }
  check(
    ["postgres:", "postgresql:"].includes(target.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) &&
      target.port === "5433" &&
      target.pathname === "/uniz_hive",
    "Only local UNIZ PostgreSQL is allowed.",
  );
  const definition = knownDefinition();
  const require = createRequire(new URL("packages/db/package.json", root));
  const sql = require("postgres")(process.env.DATABASE_URL, {
    max: 1,
    prepare: false,
    onnotice() {},
  });
  try {
    const result = restoreArg
      ? await restore(sql, definition, restoreArg.slice(10), args.includes("--apply"))
      : args.includes("--apply")
        ? await applyCleanup(sql, definition)
        : await sql.begin("isolation level repeatable read read only", async (tx) => {
            const plan = makeCleanupPlan(await snapshot(tx, definition), definition);
            await protectedHashes(tx, definition);
            writeFileSync(previewFile, `${JSON.stringify(plan, null, 2)}\n`);
            return {
              applied: false,
              plan: "outputs/sample-content/cleanup-plan.json",
              keep: plan.keepTitles,
              proposed: {
                archiveBuilds: plan.archive.build.length,
                archivePosts: plan.archive.community_post.length,
                removePartiesWithBackup: plan.deletePartyIds.length,
              },
              actualPostsAndImagesPreserved: true,
              noNewNoticeOrShowcaseExamples: true,
            };
          });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await sql.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(
      error instanceof CleanupError
        ? error.message
        : `Sample cleanup failed safely (${error?.code ?? error?.name ?? "unknown"}).`,
    );
    process.exitCode = 1;
  });
