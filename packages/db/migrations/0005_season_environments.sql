ALTER TABLE "seasons" DROP CONSTRAINT "seasons_scenario_number_unique";--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "server_type" text DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "trance_phenomenon" text DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "migration_open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_scenario_type_number_unique" UNIQUE("scenario_id","server_type","season_number");--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_server_type_valid" CHECK ("seasons"."server_type" in ('UNKNOWN', 'SEASONAL', 'PERMANENT'));--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_trance_phenomenon_valid" CHECK ("seasons"."trance_phenomenon" in ('UNKNOWN', 'NONE', 'LUNAR_ORACLE', 'STARFALL_INVERSION', 'LUNAR_REVELRY', 'ABERRANT_PROGENY', 'GRAVITY_ABYSS'));--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_permanent_settlement" CHECK ("seasons"."server_type" <> 'PERMANENT' OR "seasons"."settlement_at" IS NULL);--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_migration_open_valid" CHECK (NOT "seasons"."migration_open" OR "seasons"."server_type" = 'PERMANENT');