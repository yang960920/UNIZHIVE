CREATE TABLE "build_loadout_entries" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"loadout_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"build_id" text NOT NULL,
	"build_version_id" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "build_loadout_entries_version_unique" UNIQUE("loadout_id","build_version_id"),
	CONSTRAINT "build_loadout_entries_position_unique" UNIQUE("loadout_id","position"),
	CONSTRAINT "build_loadout_entries_position_range" CHECK ("build_loadout_entries"."position" BETWEEN 0 AND 31)
);
--> statement-breakpoint
CREATE TABLE "build_loadouts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "build_loadouts_id_owner_unique" UNIQUE("id","owner_id"),
	CONSTRAINT "build_loadouts_title_length" CHECK (length(trim("build_loadouts"."title")) BETWEEN 2 AND 100),
	CONSTRAINT "build_loadouts_notes_length" CHECK (length("build_loadouts"."notes") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "builds" ADD CONSTRAINT "builds_id_owner_unique" UNIQUE("id","owner_id");--> statement-breakpoint
ALTER TABLE "build_loadout_entries" ADD CONSTRAINT "build_loadout_entries_group_owner_fk" FOREIGN KEY ("loadout_id","owner_id") REFERENCES "public"."build_loadouts"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_loadout_entries" ADD CONSTRAINT "build_loadout_entries_build_owner_fk" FOREIGN KEY ("build_id","owner_id") REFERENCES "public"."builds"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_loadout_entries" ADD CONSTRAINT "build_loadout_entries_version_build_fk" FOREIGN KEY ("build_version_id","build_id") REFERENCES "public"."build_versions"("id","build_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_loadouts" ADD CONSTRAINT "build_loadouts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "build_loadouts_owner_updated_index" ON "build_loadouts" USING btree ("owner_id","updated_at");--> statement-breakpoint
ALTER TABLE "build_loadouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "build_loadout_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "build_loadouts", "build_loadout_entries" FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE data_api_role text;
BEGIN
  FOREACH data_api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = data_api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.build_loadouts, public.build_loadout_entries FROM %I', data_api_role);
    END IF;
  END LOOP;
END;
$$;
