CREATE TABLE "build_likes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"build_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "build_likes_actor_unique" UNIQUE("build_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "build_publications" (
	"build_id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "build_publications_request_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "build_share_requests" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"build_id" text NOT NULL,
	"build_version_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"requested_visibility" "build_visibility" NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reviewer_id" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text DEFAULT '' NOT NULL,
	"recommendation_score" integer,
	"recommendation_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "build_share_requests_id_build_unique" UNIQUE("id","build_id"),
	CONSTRAINT "build_share_requests_visibility_valid" CHECK ("build_share_requests"."requested_visibility" IN ('HIVE', 'PUBLIC')),
	CONSTRAINT "build_share_requests_status_valid" CHECK ("build_share_requests"."status" IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REVOKED')),
	CONSTRAINT "build_share_requests_score_valid" CHECK ("build_share_requests"."recommendation_score" IS NULL OR "build_share_requests"."recommendation_score" BETWEEN 1 AND 5),
	CONSTRAINT "build_share_requests_approved_review_required" CHECK ("build_share_requests"."status" <> 'APPROVED' OR ("build_share_requests"."reviewer_id" IS NOT NULL AND "build_share_requests"."reviewed_at" IS NOT NULL)),
	CONSTRAINT "build_share_requests_note_lengths" CHECK (length("build_share_requests"."review_note") <= 1000 AND length("build_share_requests"."recommendation_note") <= 500),
	CONSTRAINT "build_share_requests_metadata_lengths" CHECK (length(trim("build_share_requests"."title")) BETWEEN 2 AND 100 AND length("build_share_requests"."description") <= 5000)
);
--> statement-breakpoint
CREATE TABLE "community_comment_likes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"comment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_comment_likes_actor_unique" UNIQUE("comment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "community_post_likes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_post_likes_actor_unique" UNIQUE("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "content_image_references" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"image_id" text NOT NULL,
	"post_id" text,
	"build_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_image_references_post_unique" UNIQUE("image_id","post_id"),
	CONSTRAINT "content_image_references_version_unique" UNIQUE("image_id","build_version_id"),
	CONSTRAINT "content_image_references_one_target" CHECK (("content_image_references"."post_id" IS NOT NULL)::integer + ("content_image_references"."build_version_id" IS NOT NULL)::integer = 1)
);
--> statement-breakpoint
CREATE TABLE "content_images" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"owner_id" text NOT NULL,
	"revision" text NOT NULL,
	"content" "bytea" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_images_owner_revision_unique" UNIQUE("owner_id","revision"),
	CONSTRAINT "content_images_revision_valid" CHECK ("content_images"."revision" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "content_images_size_valid" CHECK (octet_length("content_images"."content") BETWEEN 1 AND 524288),
	CONSTRAINT "content_images_dimensions_valid" CHECK ("content_images"."width" BETWEEN 1 AND 1920 AND "content_images"."height" BETWEEN 1 AND 1920)
);
--> statement-breakpoint
ALTER TABLE "build_versions" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "build_versions" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "build_versions" ADD COLUMN "body_document" jsonb;--> statement-breakpoint
ALTER TABLE "build_versions" ADD COLUMN "youtube_url" text;--> statement-breakpoint
ALTER TABLE "community_comments" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "community_posts" ADD COLUMN "body_document" jsonb;--> statement-breakpoint
ALTER TABLE "community_posts" ADD COLUMN "youtube_url" text;--> statement-breakpoint
ALTER TABLE "build_versions" ADD CONSTRAINT "build_versions_id_build_unique" UNIQUE("id","build_id");--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_id_post_unique" UNIQUE("id","post_id");--> statement-breakpoint
ALTER TABLE "build_likes" ADD CONSTRAINT "build_likes_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_likes" ADD CONSTRAINT "build_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_publications" ADD CONSTRAINT "build_publications_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_publications" ADD CONSTRAINT "build_publications_request_build_fk" FOREIGN KEY ("request_id","build_id") REFERENCES "public"."build_share_requests"("id","build_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_share_requests" ADD CONSTRAINT "build_share_requests_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_share_requests" ADD CONSTRAINT "build_share_requests_build_version_id_build_versions_id_fk" FOREIGN KEY ("build_version_id") REFERENCES "public"."build_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_share_requests" ADD CONSTRAINT "build_share_requests_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_share_requests" ADD CONSTRAINT "build_share_requests_version_build_fk" FOREIGN KEY ("build_version_id","build_id") REFERENCES "public"."build_versions"("id","build_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comment_likes" ADD CONSTRAINT "community_comment_likes_comment_id_community_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."community_comments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comment_likes" ADD CONSTRAINT "community_comment_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_likes" ADD CONSTRAINT "community_post_likes_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_likes" ADD CONSTRAINT "community_post_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_image_references" ADD CONSTRAINT "content_image_references_image_id_content_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."content_images"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_image_references" ADD CONSTRAINT "content_image_references_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_image_references" ADD CONSTRAINT "content_image_references_build_version_id_build_versions_id_fk" FOREIGN KEY ("build_version_id") REFERENCES "public"."build_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_images" ADD CONSTRAINT "content_images_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "build_likes_user_index" ON "build_likes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "build_share_requests_one_pending" ON "build_share_requests" USING btree ("build_id") WHERE "build_share_requests"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "build_share_requests_status_created_index" ON "build_share_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "build_share_requests_version_index" ON "build_share_requests" USING btree ("build_version_id");--> statement-breakpoint
CREATE INDEX "community_comment_likes_user_index" ON "community_comment_likes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "community_post_likes_user_index" ON "community_post_likes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "content_image_references_post_index" ON "content_image_references" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "content_image_references_version_index" ON "content_image_references" USING btree ("build_version_id");--> statement-breakpoint
CREATE INDEX "content_images_owner_created_index" ON "content_images" USING btree ("owner_id","created_at");--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_parent_post_fk" FOREIGN KEY ("parent_id","post_id") REFERENCES "public"."community_comments"("id","post_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_comments_parent_created_index" ON "community_comments" USING btree ("parent_id","created_at");--> statement-breakpoint
ALTER TABLE "build_versions" ADD CONSTRAINT "build_versions_body_document_object" CHECK ("build_versions"."body_document" IS NULL OR jsonb_typeof("build_versions"."body_document") = 'object');--> statement-breakpoint
ALTER TABLE "build_versions" ADD CONSTRAINT "build_versions_metadata_lengths" CHECK (("build_versions"."title" IS NULL OR length(trim("build_versions"."title")) BETWEEN 2 AND 100) AND ("build_versions"."description" IS NULL OR length("build_versions"."description") <= 5000) AND ("build_versions"."youtube_url" IS NULL OR length("build_versions"."youtube_url") <= 2048));--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_parent_not_self" CHECK ("community_comments"."parent_id" IS NULL OR "community_comments"."parent_id" <> "community_comments"."id");--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_body_document_object" CHECK ("community_posts"."body_document" IS NULL OR jsonb_typeof("community_posts"."body_document") = 'object');--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_youtube_length" CHECK ("community_posts"."youtube_url" IS NULL OR length("community_posts"."youtube_url") <= 2048);
--> statement-breakpoint
CREATE FUNCTION community_comment_parent_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_depth text;
BEGIN
  -- Serialize hierarchy changes with post/comment writes before inspecting the parent.
  PERFORM id FROM community_posts WHERE id = NEW.post_id FOR UPDATE;
  IF NEW.parent_id IS NOT NULL THEN
    SELECT parent_id INTO parent_depth FROM community_comments WHERE id = NEW.parent_id FOR SHARE;
    IF parent_depth IS NOT NULL OR EXISTS (SELECT 1 FROM community_comments WHERE parent_id = NEW.id) THEN
      RAISE EXCEPTION 'Replies are limited to one level' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER community_comment_parent_guard BEFORE INSERT OR UPDATE OF post_id, parent_id ON community_comments FOR EACH ROW EXECUTE FUNCTION community_comment_parent_guard();
--> statement-breakpoint
CREATE FUNCTION build_share_request_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.build_id, NEW.build_version_id, NEW.title, NEW.description, NEW.requested_visibility)
    IS DISTINCT FROM ROW(OLD.build_id, OLD.build_version_id, OLD.title, OLD.description, OLD.requested_visibility) THEN
    RAISE EXCEPTION 'Submitted build metadata is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER build_share_request_snapshot_guard BEFORE UPDATE ON build_share_requests FOR EACH ROW EXECUTE FUNCTION build_share_request_snapshot_guard();
--> statement-breakpoint
-- Existing shared builds enter the same review queue as new submissions. Personal history is kept.
INSERT INTO build_share_requests (build_id, build_version_id, title, description, requested_visibility, status)
SELECT b.id, v.id, b.title, coalesce(b.description, ''), b.visibility, 'PENDING'
FROM builds b
JOIN LATERAL (SELECT id FROM build_versions WHERE build_id = b.id ORDER BY version DESC LIMIT 1) v ON true
WHERE b.visibility IN ('HIVE', 'PUBLIC') AND b.archived_at IS NULL;
--> statement-breakpoint
UPDATE builds SET visibility = 'PRIVATE' WHERE visibility IN ('HIVE', 'PUBLIC');
