CREATE TABLE "community_comments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"post_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"hidden_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_comments_body_length" CHECK (length(trim("community_comments"."body")) BETWEEN 1 AND 4000)
);
--> statement-breakpoint
CREATE TABLE "community_posts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"author_id" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"build_version_id" text,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"hidden_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_posts_category_valid" CHECK ("community_posts"."category" IN ('GUIDE','TIP','QUESTION','BUILD','GENERAL')),
	CONSTRAINT "community_posts_title_length" CHECK (length(trim("community_posts"."title")) BETWEEN 2 AND 160),
	CONSTRAINT "community_posts_body_length" CHECK (length(trim("community_posts"."body")) BETWEEN 1 AND 20000),
	CONSTRAINT "community_posts_build_link_required" CHECK ("community_posts"."category" <> 'BUILD' OR "community_posts"."build_version_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_build_version_id_build_versions_id_fk" FOREIGN KEY ("build_version_id") REFERENCES "public"."build_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_comments_post_created_index" ON "community_comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "community_comments_author_index" ON "community_comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "community_posts_directory_index" ON "community_posts" USING btree ("archived_at","hidden_at","is_pinned","created_at");--> statement-breakpoint
CREATE INDEX "community_posts_category_created_index" ON "community_posts" USING btree ("category","created_at");--> statement-breakpoint
CREATE INDEX "community_posts_author_index" ON "community_posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "community_posts_build_version_index" ON "community_posts" USING btree ("build_version_id");