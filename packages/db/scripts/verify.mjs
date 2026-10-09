import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";

// Standalone verification deliberately uses the driver, avoiding Next.js/server-only runtime.
const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

class VerificationError extends Error {}
class FixtureRollback extends Error {}

const expectedTables = [
  "accounts",
  "announcements",
  "audit_logs",
  "build_likes",
  "build_publications",
  "build_share_requests",
  "build_versions",
  "builds",
  "community_comments",
  "community_comment_likes",
  "community_posts",
  "community_post_likes",
  "content_images",
  "content_image_references",
  "dps_research_publications",
  "dps_research_records",
  "dps_research_verifications",
  "dps_research_versions",
  "integration_accounts",
  "member_profiles",
  "member_profile_images",
  "operation_participants",
  "operation_roles",
  "operations",
  "scenarios",
  "season_memberships",
  "season_phases",
  "season_vote_candidates",
  "season_votes",
  "seasons",
  "servers",
  "users",
  "user_preferences",
];
const passed = [];
const fixtureIds = [];

function assert(condition, message) {
  if (!condition) throw new VerificationError(message);
}

async function verify(sql) {
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  const found = tables.map((table) => table.table_name);
  assert(
    JSON.stringify(found) === JSON.stringify([...expectedTables].sort()),
    `Expected exactly ${expectedTables.length} application tables.`,
  );
  const columns = await sql`
    SELECT table_name, column_name, is_nullable
    FROM information_schema.columns WHERE table_schema = 'public'
  `;
  for (const table of expectedTables) {
    const requiredColumns =
      table === "build_publications"
        ? ["build_id", "request_id", "updated_at"]
        : table === "dps_research_publications"
          ? ["record_id", "version_id", "updated_at"]
          : [
                "build_likes",
                "community_comment_likes",
                "community_post_likes",
                "content_image_references",
              ].includes(table)
            ? ["id", "created_at"]
            : ["id", "created_at", "updated_at"];
    for (const column of requiredColumns) {
      assert(
        columns.some(
          (item) =>
            item.table_name === table && item.column_name === column && item.is_nullable === "NO",
        ),
        `${table}.${column} must exist and be non-null.`,
      );
    }
  }
  passed.push(`${expectedTables.length} application tables and consistent identity/audit columns`);

  const migrations = readMigrationFiles({
    migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
  });
  const applied = await sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations`;
  assert(migrations.length > 0, "Checked-in migration journal is missing.");
  assert(
    applied.length === migrations.length,
    "Applied migration journal must contain each checked-in migration exactly once.",
  );
  for (const migration of migrations) {
    assert(
      applied.some(
        (item) =>
          item.hash === migration.hash &&
          String(item.created_at) === String(migration.folderMillis),
      ),
      "Applied Drizzle migration hash must match checked-in SQL.",
    );
  }
  passed.push("Drizzle migration journal and SQL hashes match");

  // Throwing the dedicated sentinel rolls back ALL fixtures, including successful writes.
  try {
    await sql.begin(async (tx) => {
      async function expectRejection(label, code, query) {
        let rejected = false;
        try {
          await tx.savepoint(async (savepoint) => {
            await query(savepoint);
          });
        } catch (error) {
          assert(
            error?.code === code,
            `${label}: expected SQLSTATE ${code}; got ${error?.code ?? "unknown"}.`,
          );
          rejected = true;
        }
        assert(rejected, `${label}: invalid write was accepted.`);
        passed.push(label);
      }

      const suffix = randomUUID();
      const [owner] =
        await tx`INSERT INTO users (name, role) VALUES ('Verification owner', 'MEMBER') RETURNING id`;
      const [other] =
        await tx`INSERT INTO users (name, role) VALUES ('Verification second member', 'MEMBER') RETURNING id`;
      fixtureIds.push({ table: "users", id: owner.id }, { table: "users", id: other.id });
      const [preferences] =
        await tx`INSERT INTO user_preferences (user_id, preferences) VALUES (${owner.id}, '{"showGuide":false}'::jsonb) RETURNING id`;
      fixtureIds.push({ table: "user_preferences", id: preferences.id });
      await expectRejection(
        "one preferences record per account",
        "23505",
        (sp) => sp`INSERT INTO user_preferences (user_id) VALUES (${owner.id})`,
      );
      await expectRejection(
        "preferences require an existing account",
        "23503",
        (sp) => sp`INSERT INTO user_preferences (user_id) VALUES (${randomUUID()})`,
      );
      await expectRejection(
        "preferences must contain an object",
        "23514",
        (sp) =>
          sp`INSERT INTO user_preferences (user_id, preferences) VALUES (${other.id}, '[]'::jsonb)`,
      );
      await tx`INSERT INTO user_preferences (user_id, preferences) VALUES (${owner.id}, '{"showGuide":true}'::jsonb)
        ON CONFLICT (user_id) DO UPDATE SET preferences = EXCLUDED.preferences`;
      const ownPreferences =
        await tx`SELECT preferences FROM user_preferences WHERE user_id = ${owner.id}`;
      const otherPreferences =
        await tx`SELECT preferences FROM user_preferences WHERE user_id = ${other.id}`;
      assert(
        ownPreferences.length === 1 &&
          ownPreferences[0].preferences.showGuide === true &&
          otherPreferences.length === 0,
        "Preference updates must stay within the selected account.",
      );
      passed.push("preferences update without touching another account");
      const imageRevision = "a".repeat(64);
      const imageBytes = Buffer.from("verification image bytes");
      const [image] = await tx`
        INSERT INTO member_profile_images (user_id, revision, content)
        VALUES (${owner.id}, ${imageRevision}, ${imageBytes}) RETURNING id
      `;
      fixtureIds.push({ table: "member_profile_images", id: image.id });
      await expectRejection(
        "one custom image per account",
        "23505",
        (sp) => sp`
        INSERT INTO member_profile_images (user_id, revision, content)
        VALUES (${owner.id}, ${imageRevision}, ${imageBytes})
      `,
      );
      await expectRejection(
        "profile image requires an existing account",
        "23503",
        (sp) => sp`
        INSERT INTO member_profile_images (user_id, revision, content)
        VALUES (${randomUUID()}, ${imageRevision}, ${imageBytes})
      `,
      );
      await expectRejection(
        "profile image revision must be a SHA-256 digest",
        "23514",
        (sp) => sp`
        INSERT INTO member_profile_images (user_id, revision, content)
        VALUES (${other.id}, 'invalid', ${imageBytes})
      `,
      );
      await expectRejection(
        "empty profile images are rejected",
        "23514",
        (sp) => sp`
        INSERT INTO member_profile_images (user_id, revision, content)
        VALUES (${other.id}, ${imageRevision}, ${Buffer.alloc(0)})
      `,
      );
      await expectRejection(
        "profile images are bounded to 512 KiB",
        "23514",
        (sp) => sp`
        INSERT INTO member_profile_images (user_id, revision, content)
        VALUES (${other.id}, ${imageRevision}, ${Buffer.alloc(524289)})
      `,
      );
      await tx`UPDATE member_profile_images SET revision = ${"b".repeat(64)} WHERE user_id = ${owner.id}`;
      const ownImages =
        await tx`SELECT revision FROM member_profile_images WHERE user_id = ${owner.id}`;
      const otherImages =
        await tx`SELECT id FROM member_profile_images WHERE user_id = ${other.id}`;
      assert(
        ownImages.length === 1 &&
          ownImages[0].revision === "b".repeat(64) &&
          otherImages.length === 0,
        "Image updates must remain isolated to the owner.",
      );
      passed.push("profile image updates stay within the selected account");
      const [scenarioA] =
        await tx`INSERT INTO scenarios (slug, name) VALUES (${`verify-a-${suffix}`}, 'Verification scenario A') RETURNING id`;
      const [scenarioB] =
        await tx`INSERT INTO scenarios (slug, name) VALUES (${`verify-b-${suffix}`}, 'Verification scenario B') RETURNING id`;
      fixtureIds.push(
        { table: "scenarios", id: scenarioA.id },
        { table: "scenarios", id: scenarioB.id },
      );
      const [serverA] =
        await tx`INSERT INTO servers (scenario_id, name, region) VALUES (${scenarioA.id}, 'Verification server A', 'KR') RETURNING id`;
      const [serverB] =
        await tx`INSERT INTO servers (scenario_id, name, region) VALUES (${scenarioB.id}, 'Verification server B', 'KR') RETURNING id`;
      const [{ next_number: nextNumber }] =
        await tx`SELECT COALESCE(MAX(season_number), 0)::integer + 1 AS next_number FROM seasons`;
      const [seasonA] = await tx`
        INSERT INTO seasons (season_number, scenario_id, server_id, name, starts_at, settlement_at)
        VALUES (${nextNumber}, ${scenarioA.id}, ${serverA.id}, 'Verification season A', NOW(), NOW() + INTERVAL '30 days') RETURNING id
      `;
      const [seasonB] = await tx`
        INSERT INTO seasons (season_number, scenario_id, server_id, name, starts_at, settlement_at)
        VALUES (${nextNumber + 1}, ${scenarioB.id}, ${serverB.id}, 'Verification season B', NOW(), NOW() + INTERVAL '30 days') RETURNING id
      `;
      const [optionalSeason] = await tx`
        INSERT INTO seasons (season_number, scenario_id, server_id, name, starts_at, approval_status, created_by_id)
        VALUES (0, ${scenarioA.id}, ${serverA.id}, 'Optional settlement verification', NOW(), 'PENDING', ${owner.id})
        RETURNING id, settlement_at, approval_status, created_by_id, current_phase_order
      `;
      fixtureIds.push({ table: "seasons", id: optionalSeason.id });
      assert(
        optionalSeason.settlement_at === null &&
          optionalSeason.approval_status === "PENDING" &&
          optionalSeason.created_by_id === owner.id &&
          optionalSeason.current_phase_order === 1,
        "A new season must permit X0000, optional settlement and pending approval.",
      );
      passed.push("Season accepts X0000, pending approval and no settlement date");
      await expectRejection(
        "Non-positive manual current phase order is rejected",
        "23514",
        (sp) => sp`UPDATE seasons SET current_phase_order = 0 WHERE id = ${optionalSeason.id}`,
      );
      await tx`
        INSERT INTO seasons (season_number, scenario_id, server_id, name, starts_at)
        VALUES (0, ${scenarioB.id}, ${serverB.id}, 'Same number in another scenario', NOW())
      `;
      passed.push("The same season number is accepted in different scenarios");
      await expectRejection(
        "Duplicate season number within one scenario is rejected",
        "23505",
        (sp) => sp`
          INSERT INTO seasons (season_number, scenario_id, server_id, name, starts_at)
          VALUES (0, ${scenarioA.id}, ${serverA.id}, 'Duplicate scenario/number', NOW())
        `,
      );
      await expectRejection(
        "Negative season number is rejected",
        "23514",
        (sp) => sp`
          INSERT INTO seasons (season_number, scenario_id, server_id, name, starts_at)
          VALUES (-1, ${scenarioA.id}, ${serverA.id}, 'Negative number', NOW())
        `,
      );
      await expectRejection(
        "Unrecognized season approval status is rejected",
        "23514",
        (sp) => sp`UPDATE seasons SET approval_status = 'INVALID' WHERE id = ${optionalSeason.id}`,
      );
      await expectRejection(
        "Season reviewer must reference an existing user",
        "23503",
        (sp) =>
          sp`UPDATE seasons SET reviewed_by_id = ${randomUUID()} WHERE id = ${optionalSeason.id}`,
      );
      await expectRejection(
        "Season rejects a server from another scenario",
        "23503",
        (sp) => sp`
        INSERT INTO seasons (season_number, scenario_id, server_id, name, starts_at, settlement_at)
        VALUES (${nextNumber + 2}, ${scenarioB.id}, ${serverA.id}, 'Invalid verification season', NOW(), NOW() + INTERVAL '30 days')
      `,
      );

      for (let order = 1; order <= 9; order += 1) {
        await tx`INSERT INTO season_phases (season_id, name, phase_order) VALUES (${seasonA.id}, ${`Verification Phase ${order}`}, ${order})`;
      }
      const [{ count: phaseCount }] =
        await tx`SELECT COUNT(*)::integer AS count FROM season_phases WHERE season_id = ${seasonA.id}`;
      assert(phaseCount === 9, "Variable phase count must allow nine phases.");
      passed.push("Nine phases are accepted without a six-phase limit");
      await expectRejection(
        "Duplicate phase order is rejected",
        "23505",
        (sp) =>
          sp`INSERT INTO season_phases (season_id, name, phase_order) VALUES (${seasonA.id}, 'Duplicate', 1)`,
      );
      await expectRejection(
        "Non-positive phase order is rejected",
        "23514",
        (sp) =>
          sp`INSERT INTO season_phases (season_id, name, phase_order) VALUES (${seasonA.id}, 'Invalid', 0)`,
      );

      await tx`INSERT INTO season_memberships (season_id, user_id) VALUES (${seasonA.id}, ${owner.id})`;
      await expectRejection(
        "Duplicate season membership is rejected",
        "23505",
        (sp) =>
          sp`INSERT INTO season_memberships (season_id, user_id) VALUES (${seasonA.id}, ${owner.id})`,
      );
      const [candidateA] =
        await tx`INSERT INTO season_vote_candidates (season_id, scenario_id, label) VALUES (${seasonA.id}, ${scenarioA.id}, 'Verification candidate A') RETURNING id`;
      const [candidateB] =
        await tx`INSERT INTO season_vote_candidates (season_id, scenario_id, label) VALUES (${seasonA.id}, ${scenarioB.id}, 'Verification candidate B') RETURNING id`;
      const [foreignCandidate] =
        await tx`INSERT INTO season_vote_candidates (season_id, scenario_id, label) VALUES (${seasonB.id}, ${scenarioA.id}, 'Verification foreign candidate') RETURNING id`;
      await expectRejection(
        "Vote rejects a candidate from another season",
        "23503",
        (sp) =>
          sp`INSERT INTO season_votes (season_id, user_id, candidate_id) VALUES (${seasonA.id}, ${owner.id}, ${foreignCandidate.id})`,
      );
      await expectRejection(
        "Vote requires membership in the same season",
        "23503",
        (sp) =>
          sp`INSERT INTO season_votes (season_id, user_id, candidate_id) VALUES (${seasonA.id}, ${other.id}, ${candidateA.id})`,
      );
      const [vote] =
        await tx`INSERT INTO season_votes (season_id, user_id, candidate_id) VALUES (${seasonA.id}, ${owner.id}, ${candidateA.id}) RETURNING id`;
      await expectRejection(
        "Second vote by the same member is rejected",
        "23505",
        (sp) =>
          sp`INSERT INTO season_votes (season_id, user_id, candidate_id) VALUES (${seasonA.id}, ${owner.id}, ${candidateB.id})`,
      );
      await tx`UPDATE season_votes SET candidate_id = ${candidateB.id}, updated_at = NOW() WHERE id = ${vote.id}`;
      const changedVotes =
        await tx`SELECT candidate_id FROM season_votes WHERE season_id = ${seasonA.id} AND user_id = ${owner.id}`;
      assert(
        changedVotes.length === 1 && changedVotes[0].candidate_id === candidateB.id,
        "Changing a vote must preserve a single vote.",
      );
      passed.push("Changing a vote preserves one member/season choice");
      await tx`
        UPDATE season_memberships SET removed_at = NOW(), removed_by_id = ${other.id}
        WHERE season_id = ${seasonA.id} AND user_id = ${owner.id}
      `;
      const [removed] = await tx`
        SELECT removed_at, removed_by_id FROM season_memberships
        WHERE season_id = ${seasonA.id} AND user_id = ${owner.id}
      `;
      const [retainedBallot] = await tx`SELECT id FROM season_votes WHERE id = ${vote.id}`;
      assert(
        removed.removed_at !== null &&
          removed.removed_by_id === other.id &&
          retainedBallot.id === vote.id,
        "Removing season participation must retain its membership and previous ballot history.",
      );
      passed.push("Logical participant removal preserves membership and previous vote history");

      const [operationA] =
        await tx`INSERT INTO operations (title, type, starts_at, capacity, created_by_id) VALUES ('Verification operation A', 'OTHER', NOW(), 10, ${owner.id}) RETURNING id`;
      const [operationB] =
        await tx`INSERT INTO operations (title, type, starts_at, capacity, created_by_id) VALUES ('Verification operation B', 'OTHER', NOW(), 10, ${owner.id}) RETURNING id`;
      const [roleA] =
        await tx`INSERT INTO operation_roles (operation_id, name, capacity) VALUES (${operationA.id}, 'Verification role A', 2) RETURNING id`;
      const [roleB] =
        await tx`INSERT INTO operation_roles (operation_id, name, capacity) VALUES (${operationB.id}, 'Verification role B', 2) RETURNING id`;
      await expectRejection(
        "RSVP rejects a role from another operation",
        "23503",
        (sp) =>
          sp`INSERT INTO operation_participants (operation_id, user_id, role_id, status) VALUES (${operationA.id}, ${owner.id}, ${roleB.id}, 'GOING')`,
      );
      await tx`INSERT INTO operation_participants (operation_id, user_id, role_id, status) VALUES (${operationA.id}, ${owner.id}, ${roleA.id}, 'GOING')`;
      await expectRejection(
        "Duplicate operation participant is rejected",
        "23505",
        (sp) =>
          sp`INSERT INTO operation_participants (operation_id, user_id, status) VALUES (${operationA.id}, ${owner.id}, 'MAYBE')`,
      );

      const handle = `verify_${suffix.slice(0, 8)}`;
      await tx`INSERT INTO member_profiles (user_id, handle, display_name, once_human_nickname) VALUES (${owner.id}, ${handle}, 'Verification owner', 'Verification owner')`;
      await expectRejection(
        "Case-insensitive duplicate member handle is rejected",
        "23505",
        (sp) =>
          sp`INSERT INTO member_profiles (user_id, handle, display_name, once_human_nickname) VALUES (${other.id}, ${handle.toUpperCase()}, 'Verification other', 'Verification other')`,
      );

      const [build] =
        await tx`INSERT INTO builds (owner_id, title) VALUES (${owner.id}, 'Verification build') RETURNING id`;
      const [version] =
        await tx`INSERT INTO build_versions (build_id, version, schema_version, loadout_snapshot) VALUES (${build.id}, 1, 'verification-only', '{}'::jsonb) RETURNING id`;
      await tx`INSERT INTO build_versions (build_id, version, schema_version, loadout_snapshot) VALUES (${build.id}, 2, 'verification-only', '{}'::jsonb)`;
      const [{ count: versionCount }] =
        await tx`SELECT COUNT(*)::integer AS count FROM build_versions WHERE build_id = ${build.id}`;
      assert(versionCount === 2, "A build must support separate version snapshots.");
      passed.push("A build accepts separate append-only version snapshots");
      await expectRejection(
        "Duplicate build version number is rejected",
        "23505",
        (sp) =>
          sp`INSERT INTO build_versions (build_id, version, schema_version, loadout_snapshot) VALUES (${build.id}, 1, 'verification-only', '{}'::jsonb)`,
      );
      await expectRejection(
        "Non-object loadout snapshot is rejected",
        "23514",
        (sp) =>
          sp`INSERT INTO build_versions (build_id, version, schema_version, loadout_snapshot) VALUES (${build.id}, 3, 'verification-only', '[]'::jsonb)`,
      );
      await expectRejection(
        "BuildVersion UPDATE is blocked by immutable trigger",
        "P0001",
        (sp) => sp`UPDATE build_versions SET notes = 'Invalid mutation' WHERE id = ${version.id}`,
      );
      await expectRejection(
        "BuildVersion DELETE is blocked by immutable trigger",
        "P0001",
        (sp) => sp`DELETE FROM build_versions WHERE id = ${version.id}`,
      );
      await tx`UPDATE builds SET title = 'Verification metadata edit', updated_at = NOW() WHERE id = ${build.id}`;
      const [preserved] = await tx`SELECT notes FROM build_versions WHERE id = ${version.id}`;
      assert(preserved.notes === null, "Metadata editing must preserve the original snapshot.");
      passed.push("Build metadata can change while its version snapshot remains intact");

      for (const category of ["GUIDE", "TIP", "QUESTION", "BUILD", "SHOWCASE", "GENERAL"]) {
        const [categoryPost] =
          await tx`INSERT INTO community_posts (author_id, category, title, body, build_version_id) VALUES (${owner.id}, ${category}, 'Category verification post', 'Text without photos', ${category === "BUILD" ? version.id : null}) RETURNING category, body_document`;
        assert(
          categoryPost.category === category,
          "Every supported community category must persist.",
        );
        assert(
          categoryPost.body_document === null,
          "Community categories must not require photos.",
        );
      }
      passed.push("Showcase and existing community categories accept text-only posts");
      await expectRejection(
        "Unknown community category is rejected",
        "23514",
        (sp) =>
          sp`INSERT INTO community_posts (author_id, category, title, body) VALUES (${owner.id}, 'UNKNOWN', 'Invalid category post', 'Verification body')`,
      );
      await expectRejection(
        "Build category still requires a linked version",
        "23514",
        (sp) =>
          sp`INSERT INTO community_posts (author_id, category, title, body) VALUES (${owner.id}, 'BUILD', 'Unlinked build post', 'Verification body')`,
      );

      const [post] =
        await tx`INSERT INTO community_posts (author_id, category, title, body) VALUES (${owner.id}, 'GENERAL', 'Verification post', 'Verification body') RETURNING id`;
      const [otherPost] =
        await tx`INSERT INTO community_posts (author_id, category, title, body) VALUES (${owner.id}, 'GENERAL', 'Other verification post', 'Verification body') RETURNING id`;
      const [comment] =
        await tx`INSERT INTO community_comments (post_id, author_id, body) VALUES (${post.id}, ${owner.id}, 'Parent comment') RETURNING id`;
      const [reply] =
        await tx`INSERT INTO community_comments (post_id, author_id, parent_id, body) VALUES (${post.id}, ${other.id}, ${comment.id}, 'Reply') RETURNING id`;
      await expectRejection(
        "Replies cannot cross posts",
        "23503",
        (sp) =>
          sp`INSERT INTO community_comments (post_id, author_id, parent_id, body) VALUES (${otherPost.id}, ${other.id}, ${comment.id}, 'Wrong post')`,
      );
      await expectRejection(
        "Replies are limited to one level",
        "23514",
        (sp) =>
          sp`INSERT INTO community_comments (post_id, author_id, parent_id, body) VALUES (${post.id}, ${owner.id}, ${reply.id}, 'Too deep')`,
      );
      await expectRejection(
        "Parents with replies cannot become replies",
        "23514",
        (sp) => sp`UPDATE community_comments SET parent_id = ${reply.id} WHERE id = ${comment.id}`,
      );
      await tx`INSERT INTO community_post_likes (post_id, user_id) VALUES (${post.id}, ${owner.id})`;
      await expectRejection(
        "A member can like a post only once",
        "23505",
        (sp) =>
          sp`INSERT INTO community_post_likes (post_id, user_id) VALUES (${post.id}, ${owner.id})`,
      );
      await tx`INSERT INTO community_comment_likes (comment_id, user_id) VALUES (${reply.id}, ${owner.id})`;
      await expectRejection(
        "A member can like a reply only once",
        "23505",
        (sp) =>
          sp`INSERT INTO community_comment_likes (comment_id, user_id) VALUES (${reply.id}, ${owner.id})`,
      );
      await tx`INSERT INTO build_likes (build_id, user_id) VALUES (${build.id}, ${owner.id})`;
      await expectRejection(
        "A member can like a build only once",
        "23505",
        (sp) => sp`INSERT INTO build_likes (build_id, user_id) VALUES (${build.id}, ${owner.id})`,
      );
      const [request] =
        await tx`INSERT INTO build_share_requests (build_id, build_version_id, title, requested_visibility) VALUES (${build.id}, ${version.id}, 'Submitted verification build', 'HIVE') RETURNING id`;
      await expectRejection(
        "Only one pending share request per build",
        "23505",
        (sp) =>
          sp`INSERT INTO build_share_requests (build_id, build_version_id, title, requested_visibility) VALUES (${build.id}, ${version.id}, 'Second pending request', 'PUBLIC')`,
      );
      await expectRejection(
        "Submitted metadata cannot change",
        "23514",
        (sp) =>
          sp`UPDATE build_share_requests SET title = 'Changed after submission' WHERE id = ${request.id}`,
      );
      await expectRejection(
        "Approvals require a reviewer and review time",
        "23514",
        (sp) => sp`UPDATE build_share_requests SET status = 'APPROVED' WHERE id = ${request.id}`,
      );
      await expectRejection(
        "Administrator recommendation scores are 1 through 5",
        "23514",
        (sp) =>
          sp`UPDATE build_share_requests SET recommendation_score = 6 WHERE id = ${request.id}`,
      );
      const [bodyImage] =
        await tx`INSERT INTO content_images (owner_id, revision, content, width, height) VALUES (${owner.id}, ${imageRevision}, ${imageBytes}, 1280, 720) RETURNING id`;
      await expectRejection(
        "Body images deduplicate per owner",
        "23505",
        (sp) =>
          sp`INSERT INTO content_images (owner_id, revision, content, width, height) VALUES (${owner.id}, ${imageRevision}, ${imageBytes}, 1280, 720)`,
      );
      await expectRejection(
        "Body images are bounded to 512 KiB",
        "23514",
        (sp) =>
          sp`INSERT INTO content_images (owner_id, revision, content, width, height) VALUES (${other.id}, ${imageRevision}, ${Buffer.alloc(524289)}, 1280, 720)`,
      );
      await expectRejection(
        "Body images cannot exceed 1920 pixels",
        "23514",
        (sp) =>
          sp`INSERT INTO content_images (owner_id, revision, content, width, height) VALUES (${other.id}, ${imageRevision}, ${imageBytes}, 1921, 720)`,
      );
      await expectRejection(
        "Image references require exactly one target",
        "23514",
        (sp) =>
          sp`INSERT INTO content_image_references (image_id, post_id, build_version_id) VALUES (${bodyImage.id}, ${post.id}, ${version.id})`,
      );
      await tx`INSERT INTO content_image_references (image_id, post_id) VALUES (${bodyImage.id}, ${post.id})`;
      await expectRejection(
        "Image references are unique within a post",
        "23505",
        (sp) =>
          sp`INSERT INTO content_image_references (image_id, post_id) VALUES (${bodyImage.id}, ${post.id})`,
      );

      throw new FixtureRollback();
    });
  } catch (error) {
    if (!(error instanceof FixtureRollback)) throw error;
  }

  for (const fixture of fixtureIds) {
    const remaining = await sql`SELECT id FROM ${sql(fixture.table)} WHERE id = ${fixture.id}`;
    assert(remaining.length === 0, "All transient fixture rows must be rolled back.");
  }
  passed.push("Entire fixture transaction rolled back; no persistent seed or cleanup");
}

let sql;
try {
  if (!process.env.DATABASE_URL)
    throw new VerificationError("DATABASE_URL is required for database verification.");
  sql = postgres(process.env.DATABASE_URL, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    onnotice: () => {},
  });
  await verify(sql);
  for (const check of passed) console.log(`PASS ${check}`);
  console.log(`Database verification passed: ${passed.length} checks; fixtures rolled back.`);
} catch (error) {
  // Never print the connection URL, driver stack, query parameters, or credentials.
  console.error(
    error instanceof VerificationError
      ? error.message
      : `Database verification failed (${error?.code ?? "connection/schema error"}).`,
  );
  process.exitCode = 1;
} finally {
  if (sql) await sql.end({ timeout: 5 });
}
