ALTER TABLE "operations" ADD COLUMN "content_key" text;--> statement-breakpoint
ALTER TABLE "operations" ADD COLUMN "meeting_point" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "gravity_content_enabled" boolean DEFAULT false NOT NULL;