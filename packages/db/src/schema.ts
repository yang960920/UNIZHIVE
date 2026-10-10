import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  HIVE_ROLES,
  MIGRATION_STATUSES,
  OPERATION_TYPES,
  RSVP_STATUSES,
  SEASON_APPROVAL_STATUSES,
  SEASON_STATUSES,
  SEASON_SERVER_TYPES,
  TRANCE_PHENOMENA,
  type PartyContribution,
  type PartyContributionKey,
} from "@uniz/domain";

const id = () =>
  text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`);
const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
const profileImageBytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const hiveRoleEnum = pgEnum("hive_role", HIVE_ROLES);
export const seasonStatusEnum = pgEnum("season_status", SEASON_STATUSES);
export const migrationStatusEnum = pgEnum("migration_status", MIGRATION_STATUSES);
export const operationTypeEnum = pgEnum("operation_type", OPERATION_TYPES);
export const rsvpStatusEnum = pgEnum("rsvp_status", RSVP_STATUSES);
export const operationStatusEnum = pgEnum("operation_status", [
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
]);
export const buildVisibilityEnum = pgEnum("build_visibility", ["PRIVATE", "HIVE", "PUBLIC"]);

export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull().default(""),
    email: text("email"),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),
    role: hiveRoleEnum("role").notNull().default("APPLICANT"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(sql`lower(${table.email})`),
    index("users_role_index").on(table.role),
  ],
);

/** Auth.js v4 Account field names; OAuth tokens stay server-only if ever persisted. */
export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("oauth"),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
    ...timestamps(),
  },
  (table) => [
    unique("accounts_provider_identity_unique").on(table.provider, table.providerAccountId),
    index("accounts_user_index").on(table.userId),
  ],
);

export const userPreferences = pgTable(
  "user_preferences",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps(),
  },
  (table) => [
    unique("user_preferences_user_unique").on(table.userId),
    check("user_preferences_object", sql`jsonb_typeof(${table.preferences}) = 'object'`),
  ],
);

export const memberProfiles = pgTable(
  "member_profiles",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    handle: text("handle").notNull(),
    displayName: text("display_name").notNull(),
    onceHumanNickname: text("once_human_nickname").notNull(),
    onceHumanUid: text("once_human_uid"),
    bio: text("bio"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps(),
  },
  (table) => [
    unique("member_profiles_user_unique").on(table.userId),
    uniqueIndex("member_profiles_handle_unique").on(sql`lower(${table.handle})`),
    check("member_profiles_handle_format", sql`${table.handle} ~ '^[a-zA-Z0-9_-]{3,24}$'`),
  ],
);

/** One normalized custom avatar per account; original uploads and EXIF are never retained. */
export const memberProfileImages = pgTable(
  "member_profile_images",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    revision: text("revision").notNull(),
    content: profileImageBytes("content").notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("member_profile_images_user_unique").on(table.userId),
    check("member_profile_images_revision_format", sql`${table.revision} ~ '^[a-f0-9]{64}$'`),
    check(
      "member_profile_images_content_size",
      sql`octet_length(${table.content}) between 1 and 524288`,
    ),
  ],
);

export const scenarios = pgTable("scenarios", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  ...timestamps(),
});

export const servers = pgTable(
  "servers",
  {
    id: id(),
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => scenarios.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    region: text("region").notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("servers_scenario_name_unique").on(table.scenarioId, table.name),
    unique("servers_id_scenario_unique").on(table.id, table.scenarioId),
    index("servers_region_index").on(table.region),
  ],
);

export const seasons = pgTable(
  "seasons",
  {
    id: id(),
    seasonNumber: integer("season_number").notNull(),
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => scenarios.id, { onDelete: "restrict" }),
    serverId: text("server_id").notNull(),
    name: text("name").notNull(),
    status: seasonStatusEnum("status").notNull().default("PLANNED"),
    gravityContentEnabled: boolean("gravity_content_enabled").notNull().default(false),
    serverType: text("server_type", { enum: SEASON_SERVER_TYPES }).notNull().default("UNKNOWN"),
    trancePhenomenon: text("trance_phenomenon", { enum: TRANCE_PHENOMENA })
      .notNull()
      .default("UNKNOWN"),
    migrationOpen: boolean("migration_open").notNull().default(false),
    approvalStatus: text("approval_status", { enum: SEASON_APPROVAL_STATUSES })
      .notNull()
      .default("APPROVED"),
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedById: text("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    settlementAt: timestamp("settlement_at", { withTimezone: true }),
    voteClosesAt: timestamp("vote_closes_at", { withTimezone: true }),
    currentPhaseOrder: integer("current_phase_order").notNull().default(1),
    ...timestamps(),
  },
  (table) => [
    foreignKey({
      name: "seasons_server_scenario_fk",
      columns: [table.serverId, table.scenarioId],
      foreignColumns: [servers.id, servers.scenarioId],
    }).onDelete("restrict"),
    unique("seasons_scenario_type_number_unique").on(
      table.scenarioId,
      table.serverType,
      table.seasonNumber,
    ),
    check(
      "seasons_server_type_valid",
      sql`${table.serverType} in ('UNKNOWN', 'SEASONAL', 'PERMANENT')`,
    ),
    check(
      "seasons_trance_phenomenon_valid",
      sql`${table.trancePhenomenon} in ('UNKNOWN', 'NONE', 'LUNAR_ORACLE', 'STARFALL_INVERSION', 'LUNAR_REVELRY', 'ABERRANT_PROGENY', 'GRAVITY_ABYSS')`,
    ),
    check(
      "seasons_permanent_settlement",
      sql`${table.serverType} <> 'PERMANENT' OR ${table.settlementAt} IS NULL`,
    ),
    check(
      "seasons_migration_open_valid",
      sql`NOT ${table.migrationOpen} OR ${table.serverType} = 'PERMANENT'`,
    ),
    check("seasons_number_nonnegative", sql`${table.seasonNumber} >= 0`),
    check("seasons_current_phase_positive", sql`${table.currentPhaseOrder} > 0`),
    check(
      "seasons_approval_status_valid",
      sql`${table.approvalStatus} in ('PENDING', 'APPROVED', 'REJECTED')`,
    ),
    check(
      "seasons_date_order",
      sql`${table.settlementAt} IS NULL OR ${table.settlementAt} > ${table.startsAt}`,
    ),
    index("seasons_approval_status_index").on(table.approvalStatus, table.status),
    index("seasons_status_start_index").on(table.status, table.startsAt),
    index("seasons_scenario_index").on(table.scenarioId),
    index("seasons_server_index").on(table.serverId),
  ],
);

export const seasonPhases = pgTable(
  "season_phases",
  {
    id: id(),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    order: integer("phase_order").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    unique("season_phases_season_order_unique").on(table.seasonId, table.order),
    check("season_phases_order_positive", sql`${table.order} > 0`),
    check(
      "season_phases_date_order",
      sql`${table.endsAt} IS NULL OR ${table.startsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`,
    ),
    index("season_phases_start_index").on(table.startsAt),
  ],
);

export const seasonMemberships = pgTable(
  "season_memberships",
  {
    id: id(),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    migrationStatus: migrationStatusEnum("migration_status").notNull().default("UNDECIDED"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedById: text("removed_by_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [
    unique("season_memberships_season_user_unique").on(table.seasonId, table.userId),
    index("season_memberships_user_index").on(table.userId),
    index("season_memberships_migration_index").on(table.seasonId, table.migrationStatus),
  ],
);

export const seasonVoteCandidates = pgTable(
  "season_vote_candidates",
  {
    id: id(),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => scenarios.id, { onDelete: "restrict" }),
    label: text("label").notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("season_vote_candidates_season_scenario_unique").on(table.seasonId, table.scenarioId),
    unique("season_vote_candidates_id_season_unique").on(table.id, table.seasonId),
    index("season_vote_candidates_scenario_index").on(table.scenarioId),
  ],
);

export const seasonVotes = pgTable(
  "season_votes",
  {
    id: id(),
    seasonId: text("season_id").notNull(),
    candidateId: text("candidate_id").notNull(),
    userId: text("user_id").notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("season_votes_season_user_unique").on(table.seasonId, table.userId),
    foreignKey({
      name: "season_votes_candidate_season_fk",
      columns: [table.candidateId, table.seasonId],
      foreignColumns: [seasonVoteCandidates.id, seasonVoteCandidates.seasonId],
    }).onDelete("restrict"),
    foreignKey({
      name: "season_votes_membership_fk",
      columns: [table.seasonId, table.userId],
      foreignColumns: [seasonMemberships.seasonId, seasonMemberships.userId],
    }).onDelete("restrict"),
    index("season_votes_candidate_index").on(table.candidateId),
    index("season_votes_user_index").on(table.userId),
  ],
);

export const operations = pgTable(
  "operations",
  {
    id: id(),
    seasonId: text("season_id").references(() => seasons.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    type: operationTypeEnum("type").notNull(),
    contentKey: text("content_key"),
    meetingPoint: text("meeting_point").notNull().default(""),
    description: text("description").notNull().default(""),
    requestedContributions: jsonb("requested_contributions")
      .$type<PartyContributionKey[]>()
      .notNull()
      .default([]),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    capacity: integer("capacity").notNull(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: operationStatusEnum("status").notNull().default("SCHEDULED"),
    ...timestamps(),
  },
  (table) => [
    check("operations_capacity_positive", sql`${table.capacity} > 0`),
    check(
      "operations_requested_contributions_valid",
      sql`CASE WHEN jsonb_typeof(${table.requestedContributions}) = 'array' THEN jsonb_array_length(${table.requestedContributions}) <= 10 AND ${table.requestedContributions} <@ '["weapon-vulnerability","status-vulnerability","melee-vulnerability","bulls-eye","fortress","healing","shield","control","mobility","supplies"]'::jsonb ELSE false END`,
    ),
    check(
      "operations_date_order",
      sql`${table.endsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`,
    ),
    index("operations_start_status_index").on(table.startsAt, table.status),
    index("operations_season_index").on(table.seasonId),
    index("operations_creator_index").on(table.createdById),
  ],
);

export const operationRoles = pgTable(
  "operation_roles",
  {
    id: id(),
    operationId: text("operation_id")
      .notNull()
      .references(() => operations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    capacity: integer("capacity").notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("operation_roles_operation_name_unique").on(table.operationId, table.name),
    unique("operation_roles_id_operation_unique").on(table.id, table.operationId),
    check("operation_roles_capacity_positive", sql`${table.capacity} > 0`),
  ],
);

export const operationParticipants = pgTable(
  "operation_participants",
  {
    id: id(),
    operationId: text("operation_id")
      .notNull()
      .references(() => operations.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    roleId: text("role_id"),
    status: rsvpStatusEnum("status").notNull(),
    contribution: jsonb("contribution")
      .$type<PartyContribution>()
      .notNull()
      .default({
        keys: [],
        loadoutNote: "",
        vulnerability: { weapon: null, status: null, melee: null },
      }),
    ...timestamps(),
  },
  (table) => [
    unique("operation_participants_operation_user_unique").on(table.operationId, table.userId),
    check(
      "operation_participants_contribution_valid",
      sql`coalesce(
        jsonb_typeof(${table.contribution}) = 'object'
        AND CASE WHEN jsonb_typeof(${table.contribution}->'keys') = 'array' THEN
          jsonb_array_length(${table.contribution}->'keys') <= 10
          AND ${table.contribution}->'keys' <@ '["weapon-vulnerability","status-vulnerability","melee-vulnerability","bulls-eye","fortress","healing","shield","control","mobility","supplies"]'::jsonb
          ELSE false END
        AND jsonb_typeof(${table.contribution}->'loadoutNote') = 'string'
        AND length(${table.contribution}->>'loadoutNote') <= 240
        AND jsonb_typeof(${table.contribution}->'vulnerability') = 'object'
        AND CASE WHEN jsonb_typeof(${table.contribution}->'vulnerability'->'weapon') = 'number'
          THEN (${table.contribution}->'vulnerability'->>'weapon')::numeric BETWEEN 0 AND 100
          ELSE jsonb_typeof(${table.contribution}->'vulnerability'->'weapon') = 'null' END
        AND CASE WHEN jsonb_typeof(${table.contribution}->'vulnerability'->'status') = 'number'
          THEN (${table.contribution}->'vulnerability'->>'status')::numeric BETWEEN 0 AND 100
          ELSE jsonb_typeof(${table.contribution}->'vulnerability'->'status') = 'null' END
        AND CASE WHEN jsonb_typeof(${table.contribution}->'vulnerability'->'melee') = 'number'
          THEN (${table.contribution}->'vulnerability'->>'melee')::numeric BETWEEN 0 AND 100
          ELSE jsonb_typeof(${table.contribution}->'vulnerability'->'melee') = 'null' END,
        false
      )`,
    ),
    foreignKey({
      name: "operation_participants_role_operation_fk",
      columns: [table.roleId, table.operationId],
      foreignColumns: [operationRoles.id, operationRoles.operationId],
    }).onDelete("restrict"),
    index("operation_participants_user_index").on(table.userId),
    index("operation_participants_status_index").on(table.operationId, table.status),
  ],
);

export const announcements = pgTable(
  "announcements",
  {
    id: id(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    isPinned: boolean("is_pinned").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("announcements_published_index").on(table.publishedAt),
    index("announcements_author_index").on(table.authorId),
  ],
);

export const integrationAccounts = pgTable(
  "integration_accounts",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps(),
  },
  (table) => [
    unique("integration_accounts_identity_unique").on(table.provider, table.externalId),
    unique("integration_accounts_user_provider_unique").on(table.userId, table.provider),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps(),
  },
  (table) => [
    index("audit_logs_actor_date_index").on(table.actorId, table.createdAt),
    index("audit_logs_entity_index").on(table.entityType, table.entityId),
  ],
);

export const builds = pgTable(
  "builds",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    visibility: buildVisibilityEnum("visibility").notNull().default("PRIVATE"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("builds_owner_index").on(table.ownerId),
    unique("builds_id_owner_unique").on(table.id, table.ownerId),
    index("builds_visibility_updated_index").on(table.visibility, table.updatedAt),
  ],
);

export const buildVersions = pgTable(
  "build_versions",
  {
    id: id(),
    buildId: text("build_id")
      .notNull()
      .references(() => builds.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    loadoutSnapshot: jsonb("loadout_snapshot").$type<Record<string, unknown>>().notNull(),
    notes: text("notes"),
    title: text("title"),
    description: text("description"),
    bodyDocument: jsonb("body_document").$type<unknown>(),
    youtubeUrl: text("youtube_url"),
    ...timestamps(),
  },
  (table) => [
    unique("build_versions_build_version_unique").on(table.buildId, table.version),
    unique("build_versions_id_build_unique").on(table.id, table.buildId),
    check("build_versions_version_positive", sql`${table.version} > 0`),
    check("build_versions_snapshot_object", sql`jsonb_typeof(${table.loadoutSnapshot}) = 'object'`),
    check(
      "build_versions_body_document_object",
      sql`${table.bodyDocument} IS NULL OR jsonb_typeof(${table.bodyDocument}) = 'object'`,
    ),
    check(
      "build_versions_metadata_lengths",
      sql`(${table.title} IS NULL OR length(trim(${table.title})) BETWEEN 2 AND 100) AND (${table.description} IS NULL OR length(${table.description}) <= 5000) AND (${table.youtubeUrl} IS NULL OR length(${table.youtubeUrl}) <= 2048)`,
    ),
  ],
);

export const buildLoadouts = pgTable(
  "build_loadouts",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    unique("build_loadouts_id_owner_unique").on(table.id, table.ownerId),
    index("build_loadouts_owner_updated_index").on(table.ownerId, table.updatedAt),
    check("build_loadouts_title_length", sql`length(trim(${table.title})) BETWEEN 2 AND 100`),
    check("build_loadouts_notes_length", sql`length(${table.notes}) <= 2000`),
  ],
).enableRLS();

export const buildLoadoutEntries = pgTable(
  "build_loadout_entries",
  {
    id: id(),
    loadoutId: text("loadout_id").notNull(),
    ownerId: text("owner_id").notNull(),
    buildId: text("build_id").notNull(),
    buildVersionId: text("build_version_id").notNull(),
    position: integer("position").notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("build_loadout_entries_version_unique").on(table.loadoutId, table.buildVersionId),
    unique("build_loadout_entries_position_unique").on(table.loadoutId, table.position),
    check("build_loadout_entries_position_range", sql`${table.position} BETWEEN 0 AND 31`),
    foreignKey({
      name: "build_loadout_entries_group_owner_fk",
      columns: [table.loadoutId, table.ownerId],
      foreignColumns: [buildLoadouts.id, buildLoadouts.ownerId],
    }).onDelete("restrict"),
    foreignKey({
      name: "build_loadout_entries_build_owner_fk",
      columns: [table.buildId, table.ownerId],
      foreignColumns: [builds.id, builds.ownerId],
    }).onDelete("restrict"),
    foreignKey({
      name: "build_loadout_entries_version_build_fk",
      columns: [table.buildVersionId, table.buildId],
      foreignColumns: [buildVersions.id, buildVersions.buildId],
    }).onDelete("restrict"),
  ],
).enableRLS();

export const communityPosts = pgTable(
  "community_posts",
  {
    id: id(),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    category: text("category", {
      enum: ["GUIDE", "TIP", "QUESTION", "BUILD", "SHOWCASE", "GENERAL"],
    }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    bodyDocument: jsonb("body_document").$type<unknown>(),
    youtubeUrl: text("youtube_url"),
    buildVersionId: text("build_version_id").references(() => buildVersions.id, {
      onDelete: "restrict",
    }),
    isPinned: boolean("is_pinned").notNull().default(false),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    check(
      "community_posts_category_valid",
      sql`${table.category} IN ('GUIDE','TIP','QUESTION','BUILD','SHOWCASE','GENERAL')`,
    ),
    check("community_posts_title_length", sql`length(trim(${table.title})) BETWEEN 2 AND 160`),
    check("community_posts_body_length", sql`length(trim(${table.body})) BETWEEN 1 AND 20000`),
    check(
      "community_posts_body_document_object",
      sql`${table.bodyDocument} IS NULL OR jsonb_typeof(${table.bodyDocument}) = 'object'`,
    ),
    check(
      "community_posts_youtube_length",
      sql`${table.youtubeUrl} IS NULL OR length(${table.youtubeUrl}) <= 2048`,
    ),
    check(
      "community_posts_build_link_required",
      sql`${table.category} <> 'BUILD' OR ${table.buildVersionId} IS NOT NULL`,
    ),
    index("community_posts_directory_index").on(
      table.archivedAt,
      table.hiddenAt,
      table.isPinned,
      table.createdAt,
    ),
    index("community_posts_category_created_index").on(table.category, table.createdAt),
    index("community_posts_author_index").on(table.authorId),
    index("community_posts_build_version_index").on(table.buildVersionId),
  ],
);

export const communityComments = pgTable(
  "community_comments",
  {
    id: id(),
    postId: text("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "restrict" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    parentId: text("parent_id"),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    check("community_comments_body_length", sql`length(trim(${table.body})) BETWEEN 1 AND 4000`),
    check(
      "community_comments_parent_not_self",
      sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`,
    ),
    unique("community_comments_id_post_unique").on(table.id, table.postId),
    foreignKey({
      name: "community_comments_parent_post_fk",
      columns: [table.parentId, table.postId],
      foreignColumns: [table.id, table.postId],
    }).onDelete("restrict"),
    index("community_comments_parent_created_index").on(table.parentId, table.createdAt),
    index("community_comments_post_created_index").on(table.postId, table.createdAt),
    index("community_comments_author_index").on(table.authorId),
  ],
);

export const buildShareRequests = pgTable(
  "build_share_requests",
  {
    id: id(),
    buildId: text("build_id")
      .notNull()
      .references(() => builds.id, { onDelete: "restrict" }),
    buildVersionId: text("build_version_id")
      .notNull()
      .references(() => buildVersions.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    requestedVisibility: buildVisibilityEnum("requested_visibility").notNull(),
    status: text("status", { enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "REVOKED"] })
      .notNull()
      .default("PENDING"),
    reviewerId: text("reviewer_id").references(() => users.id, { onDelete: "restrict" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note").notNull().default(""),
    recommendationScore: integer("recommendation_score"),
    recommendationNote: text("recommendation_note").notNull().default(""),
    ...timestamps(),
  },
  (table) => [
    foreignKey({
      name: "build_share_requests_version_build_fk",
      columns: [table.buildVersionId, table.buildId],
      foreignColumns: [buildVersions.id, buildVersions.buildId],
    }).onDelete("restrict"),
    check(
      "build_share_requests_visibility_valid",
      sql`${table.requestedVisibility} IN ('HIVE', 'PUBLIC')`,
    ),
    check(
      "build_share_requests_status_valid",
      sql`${table.status} IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REVOKED')`,
    ),
    check(
      "build_share_requests_score_valid",
      sql`${table.recommendationScore} IS NULL OR ${table.recommendationScore} BETWEEN 1 AND 5`,
    ),
    check(
      "build_share_requests_approved_review_required",
      sql`${table.status} <> 'APPROVED' OR (${table.reviewerId} IS NOT NULL AND ${table.reviewedAt} IS NOT NULL)`,
    ),
    check(
      "build_share_requests_note_lengths",
      sql`length(${table.reviewNote}) <= 1000 AND length(${table.recommendationNote}) <= 500`,
    ),
    check(
      "build_share_requests_metadata_lengths",
      sql`length(trim(${table.title})) BETWEEN 2 AND 100 AND length(${table.description}) <= 5000`,
    ),
    uniqueIndex("build_share_requests_one_pending")
      .on(table.buildId)
      .where(sql`${table.status} = 'PENDING'`),
    unique("build_share_requests_id_build_unique").on(table.id, table.buildId),
    index("build_share_requests_status_created_index").on(table.status, table.createdAt),
    index("build_share_requests_version_index").on(table.buildVersionId),
  ],
);

export const buildPublications = pgTable(
  "build_publications",
  {
    buildId: text("build_id")
      .primaryKey()
      .references(() => builds.id, { onDelete: "restrict" }),
    requestId: text("request_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "build_publications_request_build_fk",
      columns: [table.requestId, table.buildId],
      foreignColumns: [buildShareRequests.id, buildShareRequests.buildId],
    }).onDelete("restrict"),
    unique("build_publications_request_unique").on(table.requestId),
  ],
);

export const dpsResearchRecords = pgTable(
  "dps_research_records",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("dps_research_records_owner_index").on(table.ownerId),
    index("dps_research_records_directory_index").on(
      table.archivedAt,
      table.hiddenAt,
      table.createdAt,
    ),
  ],
);
export const dpsResearchVersions = pgTable(
  "dps_research_versions",
  {
    id: id(),
    recordId: text("record_id")
      .notNull()
      .references(() => dpsResearchRecords.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    status: text("status", {
      enum: [
        "DRAFT",
        "PENDING",
        "CHANGES_REQUESTED",
        "REJECTED",
        "APPROVED",
        "CANCELLED",
        "REVOKED",
      ],
    })
      .notNull()
      .default("DRAFT"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewerId: text("reviewer_id").references(() => users.id, { onDelete: "restrict" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note").notNull().default(""),
    ...timestamps(),
  },
  (table) => [
    unique("dps_research_versions_record_version_unique").on(table.recordId, table.version),
    unique("dps_research_versions_id_record_unique").on(table.id, table.recordId),
    uniqueIndex("dps_research_versions_one_pending")
      .on(table.recordId)
      .where(sql`${table.status} = 'PENDING'`),
    index("dps_research_versions_review_index").on(table.status, table.submittedAt),
    check("dps_research_versions_positive_version", sql`${table.version} > 0`),
    check(
      "dps_research_versions_payload_object",
      sql`jsonb_typeof(${table.payload}) = 'object' AND octet_length(${table.payload}::text) <= 524288`,
    ),
    check(
      "dps_research_versions_status_valid",
      sql`${table.status} IN ('DRAFT','PENDING','CHANGES_REQUESTED','REJECTED','APPROVED','CANCELLED','REVOKED')`,
    ),
    check(
      "dps_research_versions_submission_required",
      sql`${table.status} NOT IN ('PENDING','CHANGES_REQUESTED','REJECTED','APPROVED','REVOKED') OR ${table.submittedAt} IS NOT NULL`,
    ),
    check(
      "dps_research_versions_review_required",
      sql`${table.status} NOT IN ('CHANGES_REQUESTED','REJECTED','APPROVED','REVOKED') OR (${table.reviewerId} IS NOT NULL AND ${table.reviewedAt} IS NOT NULL)`,
    ),
    check("dps_research_versions_review_note_length", sql`length(${table.reviewNote}) <= 2000`),
  ],
);
export const dpsResearchPublications = pgTable(
  "dps_research_publications",
  {
    recordId: text("record_id")
      .primaryKey()
      .references(() => dpsResearchRecords.id, { onDelete: "restrict" }),
    versionId: text("version_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("dps_research_publications_version_unique").on(table.versionId),
    foreignKey({
      name: "dps_research_publications_version_record_fk",
      columns: [table.versionId, table.recordId],
      foreignColumns: [dpsResearchVersions.id, dpsResearchVersions.recordId],
    }).onDelete("restrict"),
  ],
);
export const dpsResearchVerifications = pgTable(
  "dps_research_verifications",
  {
    id: id(),
    versionId: text("version_id")
      .notNull()
      .references(() => dpsResearchVersions.id, { onDelete: "restrict" }),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    confirmed: boolean("confirmed").notNull(),
    note: text("note").notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("dps_research_verifications_reviewer_unique").on(table.versionId, table.reviewerId),
    check(
      "dps_research_verifications_note_length",
      sql`length(trim(${table.note})) BETWEEN 2 AND 1000`,
    ),
  ],
);

export const contentImages = pgTable(
  "content_images",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    revision: text("revision").notNull(),
    content: profileImageBytes("content").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("content_images_owner_revision_unique").on(table.ownerId, table.revision),
    check("content_images_revision_valid", sql`${table.revision} ~ '^[a-f0-9]{64}$'`),
    check("content_images_size_valid", sql`octet_length(${table.content}) BETWEEN 1 AND 524288`),
    check(
      "content_images_dimensions_valid",
      sql`${table.width} BETWEEN 1 AND 1920 AND ${table.height} BETWEEN 1 AND 1920`,
    ),
    index("content_images_owner_created_index").on(table.ownerId, table.createdAt),
  ],
);

export const contentImageReferences = pgTable(
  "content_image_references",
  {
    id: id(),
    imageId: text("image_id")
      .notNull()
      .references(() => contentImages.id, { onDelete: "restrict" }),
    postId: text("post_id").references(() => communityPosts.id, { onDelete: "restrict" }),
    buildVersionId: text("build_version_id").references(() => buildVersions.id, {
      onDelete: "restrict",
    }),
    researchVersionId: text("research_version_id").references(() => dpsResearchVersions.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "content_image_references_one_target",
      sql`(${table.postId} IS NOT NULL)::integer + (${table.buildVersionId} IS NOT NULL)::integer + (${table.researchVersionId} IS NOT NULL)::integer = 1`,
    ),
    unique("content_image_references_post_unique").on(table.imageId, table.postId),
    unique("content_image_references_version_unique").on(table.imageId, table.buildVersionId),
    unique("content_image_references_research_unique").on(table.imageId, table.researchVersionId),
    index("content_image_references_post_index").on(table.postId),
    index("content_image_references_version_index").on(table.buildVersionId),
    index("content_image_references_research_index").on(table.researchVersionId),
  ],
);

export const communityPostLikes = pgTable(
  "community_post_likes",
  {
    id: id(),
    postId: text("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("community_post_likes_actor_unique").on(table.postId, table.userId),
    index("community_post_likes_user_index").on(table.userId),
  ],
);
export const communityCommentLikes = pgTable(
  "community_comment_likes",
  {
    id: id(),
    commentId: text("comment_id")
      .notNull()
      .references(() => communityComments.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("community_comment_likes_actor_unique").on(table.commentId, table.userId),
    index("community_comment_likes_user_index").on(table.userId),
  ],
);
export const buildLikes = pgTable(
  "build_likes",
  {
    id: id(),
    buildId: text("build_id")
      .notNull()
      .references(() => builds.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("build_likes_actor_unique").on(table.buildId, table.userId),
    index("build_likes_user_index").on(table.userId),
  ],
);
