CREATE TYPE "public"."build_visibility" AS ENUM('PRIVATE', 'HIVE', 'PUBLIC');--> statement-breakpoint
CREATE TYPE "public"."hive_role" AS ENUM('GUEST', 'APPLICANT', 'MEMBER', 'OFFICER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."migration_status" AS ENUM('UNDECIDED', 'JOINING', 'PRE_REGISTERED', 'READY', 'MIGRATED');--> statement-breakpoint
CREATE TYPE "public"."operation_status" AS ENUM('SCHEDULED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."operation_type" AS ENUM('PRIME_WAR', 'RAID', 'FARM', 'EXPLORATION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('GOING', 'MAYBE', 'UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."season_status" AS ENUM('PLANNED', 'ACTIVE', 'SETTLEMENT', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"type" text DEFAULT 'oauth' NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_identity_unique" UNIQUE("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"author_id" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "build_versions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"build_id" text NOT NULL,
	"version" integer NOT NULL,
	"schema_version" text NOT NULL,
	"loadout_snapshot" jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "build_versions_build_version_unique" UNIQUE("build_id","version"),
	CONSTRAINT "build_versions_version_positive" CHECK ("build_versions"."version" > 0),
	CONSTRAINT "build_versions_snapshot_object" CHECK (jsonb_typeof("build_versions"."loadout_snapshot") = 'object')
);
--> statement-breakpoint
CREATE TABLE "builds" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"visibility" "build_visibility" DEFAULT 'PRIVATE' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_accounts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_accounts_identity_unique" UNIQUE("provider","external_id"),
	CONSTRAINT "integration_accounts_user_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "member_profiles" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"handle" text NOT NULL,
	"display_name" text NOT NULL,
	"once_human_nickname" text NOT NULL,
	"once_human_uid" text,
	"bio" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_profiles_user_unique" UNIQUE("user_id"),
	CONSTRAINT "member_profiles_handle_format" CHECK ("member_profiles"."handle" ~ '^[a-zA-Z0-9_-]{3,24}$')
);
--> statement-breakpoint
CREATE TABLE "operation_participants" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"operation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text,
	"status" "rsvp_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operation_participants_operation_user_unique" UNIQUE("operation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "operation_roles" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"operation_id" text NOT NULL,
	"name" text NOT NULL,
	"capacity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operation_roles_operation_name_unique" UNIQUE("operation_id","name"),
	CONSTRAINT "operation_roles_id_operation_unique" UNIQUE("id","operation_id"),
	CONSTRAINT "operation_roles_capacity_positive" CHECK ("operation_roles"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "operations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"season_id" text,
	"title" text NOT NULL,
	"type" "operation_type" NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"capacity" integer NOT NULL,
	"created_by_id" text NOT NULL,
	"status" "operation_status" DEFAULT 'SCHEDULED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_capacity_positive" CHECK ("operations"."capacity" > 0),
	CONSTRAINT "operations_date_order" CHECK ("operations"."ends_at" IS NULL OR "operations"."ends_at" > "operations"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scenarios_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "season_memberships" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"season_id" text NOT NULL,
	"user_id" text NOT NULL,
	"migration_status" "migration_status" DEFAULT 'UNDECIDED' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_memberships_season_user_unique" UNIQUE("season_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "season_phases" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"season_id" text NOT NULL,
	"name" text NOT NULL,
	"phase_order" integer NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_phases_season_order_unique" UNIQUE("season_id","phase_order"),
	CONSTRAINT "season_phases_order_positive" CHECK ("season_phases"."phase_order" > 0),
	CONSTRAINT "season_phases_date_order" CHECK ("season_phases"."ends_at" IS NULL OR "season_phases"."starts_at" IS NULL OR "season_phases"."ends_at" > "season_phases"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "season_vote_candidates" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"season_id" text NOT NULL,
	"scenario_id" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_vote_candidates_season_scenario_unique" UNIQUE("season_id","scenario_id"),
	CONSTRAINT "season_vote_candidates_id_season_unique" UNIQUE("id","season_id")
);
--> statement-breakpoint
CREATE TABLE "season_votes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"season_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_votes_season_user_unique" UNIQUE("season_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"season_number" integer NOT NULL,
	"scenario_id" text NOT NULL,
	"server_id" text NOT NULL,
	"name" text NOT NULL,
	"status" "season_status" DEFAULT 'PLANNED' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"settlement_at" timestamp with time zone NOT NULL,
	"vote_closes_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_season_number_unique" UNIQUE("season_number"),
	CONSTRAINT "seasons_number_positive" CHECK ("seasons"."season_number" > 0),
	CONSTRAINT "seasons_date_order" CHECK ("seasons"."settlement_at" > "seasons"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"scenario_id" text NOT NULL,
	"name" text NOT NULL,
	"region" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "servers_scenario_name_unique" UNIQUE("scenario_id","name"),
	CONSTRAINT "servers_id_scenario_unique" UNIQUE("id","scenario_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text,
	"email_verified" timestamp with time zone,
	"image" text,
	"role" "hive_role" DEFAULT 'APPLICANT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_versions" ADD CONSTRAINT "build_versions_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builds" ADD CONSTRAINT "builds_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_accounts" ADD CONSTRAINT "integration_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_participants" ADD CONSTRAINT "operation_participants_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_participants" ADD CONSTRAINT "operation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_participants" ADD CONSTRAINT "operation_participants_role_operation_fk" FOREIGN KEY ("role_id","operation_id") REFERENCES "public"."operation_roles"("id","operation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_roles" ADD CONSTRAINT "operation_roles_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_memberships" ADD CONSTRAINT "season_memberships_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_memberships" ADD CONSTRAINT "season_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_phases" ADD CONSTRAINT "season_phases_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_vote_candidates" ADD CONSTRAINT "season_vote_candidates_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_vote_candidates" ADD CONSTRAINT "season_vote_candidates_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_votes" ADD CONSTRAINT "season_votes_candidate_season_fk" FOREIGN KEY ("candidate_id","season_id") REFERENCES "public"."season_vote_candidates"("id","season_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_votes" ADD CONSTRAINT "season_votes_membership_fk" FOREIGN KEY ("season_id","user_id") REFERENCES "public"."season_memberships"("season_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_server_scenario_fk" FOREIGN KEY ("server_id","scenario_id") REFERENCES "public"."servers"("id","scenario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_index" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "announcements_published_index" ON "announcements" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "announcements_author_index" ON "announcements" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_date_index" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_index" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "builds_owner_index" ON "builds" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "builds_visibility_updated_index" ON "builds" USING btree ("visibility","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "member_profiles_handle_unique" ON "member_profiles" USING btree (lower("handle"));--> statement-breakpoint
CREATE INDEX "operation_participants_user_index" ON "operation_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "operation_participants_status_index" ON "operation_participants" USING btree ("operation_id","status");--> statement-breakpoint
CREATE INDEX "operations_start_status_index" ON "operations" USING btree ("starts_at","status");--> statement-breakpoint
CREATE INDEX "operations_season_index" ON "operations" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "operations_creator_index" ON "operations" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "season_memberships_user_index" ON "season_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "season_memberships_migration_index" ON "season_memberships" USING btree ("season_id","migration_status");--> statement-breakpoint
CREATE INDEX "season_phases_start_index" ON "season_phases" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "season_vote_candidates_scenario_index" ON "season_vote_candidates" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "season_votes_candidate_index" ON "season_votes" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "season_votes_user_index" ON "season_votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "seasons_status_start_index" ON "seasons" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "seasons_scenario_index" ON "seasons" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "seasons_server_index" ON "seasons" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "servers_region_index" ON "servers" USING btree ("region");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_role_index" ON "users" USING btree ("role");
--> statement-breakpoint
-- Snapshots referenced by community posts must remain immutable across newer versions.
CREATE FUNCTION prevent_build_version_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Build versions are immutable; insert a new version instead.';
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER build_versions_immutable
BEFORE UPDATE OR DELETE ON build_versions
FOR EACH ROW EXECUTE FUNCTION prevent_build_version_mutation();
