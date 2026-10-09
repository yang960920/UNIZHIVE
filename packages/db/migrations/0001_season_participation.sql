ALTER TABLE "seasons" DROP CONSTRAINT "seasons_season_number_unique";--> statement-breakpoint
ALTER TABLE "seasons" DROP CONSTRAINT "seasons_number_positive";--> statement-breakpoint
ALTER TABLE "seasons" DROP CONSTRAINT "seasons_date_order";--> statement-breakpoint
ALTER TABLE "seasons" ALTER COLUMN "settlement_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "season_memberships" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "season_memberships" ADD COLUMN "removed_by_id" text;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "approval_status" text DEFAULT 'APPROVED' NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "created_by_id" text;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "reviewed_by_id" text;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "season_memberships" ADD CONSTRAINT "season_memberships_removed_by_id_users_id_fk" FOREIGN KEY ("removed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seasons_approval_status_index" ON "seasons" USING btree ("approval_status","status");--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_scenario_number_unique" UNIQUE("scenario_id","season_number");--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_number_nonnegative" CHECK ("seasons"."season_number" >= 0);--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_approval_status_valid" CHECK ("seasons"."approval_status" in ('PENDING', 'APPROVED', 'REJECTED'));--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_date_order" CHECK ("seasons"."settlement_at" IS NULL OR "seasons"."settlement_at" > "seasons"."starts_at");