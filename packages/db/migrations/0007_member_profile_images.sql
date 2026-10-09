CREATE TABLE "member_profile_images" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"revision" text NOT NULL,
	"content" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_profile_images_user_unique" UNIQUE("user_id"),
	CONSTRAINT "member_profile_images_revision_format" CHECK ("member_profile_images"."revision" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "member_profile_images_content_size" CHECK (octet_length("member_profile_images"."content") between 1 and 524288)
);
--> statement-breakpoint
ALTER TABLE "member_profile_images" ADD CONSTRAINT "member_profile_images_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;