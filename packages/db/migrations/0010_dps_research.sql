CREATE TABLE "dps_research_publications" (
	"record_id" text PRIMARY KEY NOT NULL,
	"version_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dps_research_publications_version_unique" UNIQUE("version_id")
);
--> statement-breakpoint
CREATE TABLE "dps_research_records" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"owner_id" text NOT NULL,
	"hidden_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dps_research_verifications" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"version_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"confirmed" boolean NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dps_research_verifications_reviewer_unique" UNIQUE("version_id","reviewer_id"),
	CONSTRAINT "dps_research_verifications_note_length" CHECK (length(trim("dps_research_verifications"."note")) BETWEEN 2 AND 1000)
);
--> statement-breakpoint
CREATE TABLE "dps_research_versions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"record_id" text NOT NULL,
	"version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewer_id" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dps_research_versions_record_version_unique" UNIQUE("record_id","version"),
	CONSTRAINT "dps_research_versions_id_record_unique" UNIQUE("id","record_id"),
	CONSTRAINT "dps_research_versions_positive_version" CHECK ("dps_research_versions"."version" > 0),
	CONSTRAINT "dps_research_versions_payload_object" CHECK (jsonb_typeof("dps_research_versions"."payload") = 'object' AND octet_length("dps_research_versions"."payload"::text) <= 524288),
	CONSTRAINT "dps_research_versions_status_valid" CHECK ("dps_research_versions"."status" IN ('DRAFT','PENDING','CHANGES_REQUESTED','REJECTED','APPROVED','CANCELLED','REVOKED')),
	CONSTRAINT "dps_research_versions_submission_required" CHECK ("dps_research_versions"."status" NOT IN ('PENDING','CHANGES_REQUESTED','REJECTED','APPROVED','REVOKED') OR "dps_research_versions"."submitted_at" IS NOT NULL),
	CONSTRAINT "dps_research_versions_review_required" CHECK ("dps_research_versions"."status" NOT IN ('CHANGES_REQUESTED','REJECTED','APPROVED','REVOKED') OR ("dps_research_versions"."reviewer_id" IS NOT NULL AND "dps_research_versions"."reviewed_at" IS NOT NULL)),
	CONSTRAINT "dps_research_versions_review_note_length" CHECK (length("dps_research_versions"."review_note") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "content_image_references" DROP CONSTRAINT "content_image_references_one_target";--> statement-breakpoint
ALTER TABLE "content_image_references" ADD COLUMN "research_version_id" text;--> statement-breakpoint
ALTER TABLE "dps_research_publications" ADD CONSTRAINT "dps_research_publications_record_id_dps_research_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."dps_research_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dps_research_publications" ADD CONSTRAINT "dps_research_publications_version_record_fk" FOREIGN KEY ("version_id","record_id") REFERENCES "public"."dps_research_versions"("id","record_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dps_research_records" ADD CONSTRAINT "dps_research_records_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dps_research_verifications" ADD CONSTRAINT "dps_research_verifications_version_id_dps_research_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."dps_research_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dps_research_verifications" ADD CONSTRAINT "dps_research_verifications_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dps_research_versions" ADD CONSTRAINT "dps_research_versions_record_id_dps_research_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."dps_research_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dps_research_versions" ADD CONSTRAINT "dps_research_versions_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dps_research_records_owner_index" ON "dps_research_records" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "dps_research_records_directory_index" ON "dps_research_records" USING btree ("archived_at","hidden_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dps_research_versions_one_pending" ON "dps_research_versions" USING btree ("record_id") WHERE "dps_research_versions"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "dps_research_versions_review_index" ON "dps_research_versions" USING btree ("status","submitted_at");--> statement-breakpoint
ALTER TABLE "content_image_references" ADD CONSTRAINT "content_image_references_research_version_id_dps_research_versions_id_fk" FOREIGN KEY ("research_version_id") REFERENCES "public"."dps_research_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_image_references_research_index" ON "content_image_references" USING btree ("research_version_id");--> statement-breakpoint
ALTER TABLE "content_image_references" ADD CONSTRAINT "content_image_references_research_unique" UNIQUE("image_id","research_version_id");--> statement-breakpoint
ALTER TABLE "content_image_references" ADD CONSTRAINT "content_image_references_one_target" CHECK (("content_image_references"."post_id" IS NOT NULL)::integer + ("content_image_references"."build_version_id" IS NOT NULL)::integer + ("content_image_references"."research_version_id" IS NOT NULL)::integer = 1);
--> statement-breakpoint
CREATE FUNCTION dps_research_record_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR ROW(NEW.id,NEW.owner_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.owner_id,OLD.created_at) THEN
    RAISE EXCEPTION 'Research ownership and history are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER dps_research_record_guard BEFORE UPDATE OR DELETE ON dps_research_records FOR EACH ROW EXECUTE FUNCTION dps_research_record_guard();
--> statement-breakpoint
CREATE FUNCTION dps_research_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Research versions cannot be deleted' USING ERRCODE = '23514'; END IF;
  PERFORM id FROM dps_research_records WHERE id = NEW.record_id FOR UPDATE;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('DRAFT','PENDING') OR NEW.reviewer_id IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_note <> '' THEN
      RAISE EXCEPTION 'New research versions must start as drafts or submissions' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.id,NEW.record_id,NEW.version,NEW.payload,NEW.created_at,NEW.submitted_at) IS DISTINCT FROM ROW(OLD.id,OLD.record_id,OLD.version,OLD.payload,OLD.created_at,OLD.submitted_at) THEN
    RAISE EXCEPTION 'Research snapshots are immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = OLD.status THEN
    IF ROW(NEW.reviewer_id,NEW.reviewed_at,NEW.review_note) IS DISTINCT FROM ROW(OLD.reviewer_id,OLD.reviewed_at,OLD.review_note) THEN
      RAISE EXCEPTION 'Review metadata may change only through a status transition' USING ERRCODE = '23514';
    END IF;
  ELSIF NOT ((OLD.status = 'PENDING' AND NEW.status IN ('APPROVED','CHANGES_REQUESTED','REJECTED','CANCELLED')) OR (OLD.status = 'APPROVED' AND NEW.status = 'REVOKED')) THEN
    RAISE EXCEPTION 'Invalid research review transition' USING ERRCODE = '23514';
  END IF;
  IF NEW.status <> OLD.status AND NEW.status IN ('APPROVED','CHANGES_REQUESTED','REJECTED','REVOKED') AND NOT EXISTS (
    SELECT 1 FROM users reviewer WHERE reviewer.id = NEW.reviewer_id AND reviewer.role = 'ADMIN'
      AND EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = reviewer.id AND a.provider = 'discord')
  ) THEN RAISE EXCEPTION 'Research publication decisions require an administrator' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER dps_research_version_guard BEFORE INSERT OR UPDATE OR DELETE ON dps_research_versions FOR EACH ROW EXECUTE FUNCTION dps_research_version_guard();
--> statement-breakpoint
CREATE FUNCTION dps_research_validate_submission(target_id text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE p jsonb; r dps_research_records; target_record_id text; evidence_image_id text;
BEGIN
  SELECT v.payload,v.record_id INTO p,target_record_id FROM dps_research_versions v WHERE v.id = target_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing research version' USING ERRCODE = '23514'; END IF;
  SELECT * INTO r FROM dps_research_records WHERE id = target_record_id;
  IF r.hidden_at IS NOT NULL OR r.archived_at IS NOT NULL OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = r.owner_id AND u.role IN ('MEMBER','OFFICER','ADMIN') AND EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = u.id AND a.provider = 'discord')) THEN
    RAISE EXCEPTION 'Research author must be an active connected member' USING ERRCODE = '23514';
  END IF;
  IF length(trim(coalesce(p->>'title',''))) NOT BETWEEN 2 AND 100 OR coalesce(jsonb_typeof(p->'trials'),'null') <> 'array' OR jsonb_array_length(p->'trials') NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Submitted research requires a title and trials' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p->'trials') trial WHERE coalesce(jsonb_typeof(trial->'dps'),'null') <> 'number' OR (trial->>'dps')::numeric <= 0 OR (trial->>'dps')::numeric > 1e12) THEN
    RAISE EXCEPTION 'Invalid observed result' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['gamePatch','scenario','platform','target','reloadPolicy','hitPolicy','buffPolicy','procedure','measuredAt']) field WHERE length(trim(coalesce(p->>field,''))) = 0)
    OR coalesce(jsonb_typeof(p->'durationSeconds'),'null') <> 'number' OR (p->>'durationSeconds')::numeric <= 0 OR (p->>'durationSeconds')::numeric > 3600
    OR coalesce(jsonb_typeof(p->'distanceMeters'),'null') <> 'number' OR (p->>'distanceMeters')::numeric < 0 OR (p->>'distanceMeters')::numeric > 10000
    OR (nullif(p->>'buildVersionId','') IS NULL AND length(trim(coalesce(p->>'composition',''))) = 0) THEN
    RAISE EXCEPTION 'Submitted research requires reproducible conditions' USING ERRCODE = '23514';
  END IF;
  IF nullif(p->>'buildVersionId','') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM build_versions bv JOIN builds b ON b.id = bv.build_id JOIN users u ON u.id = b.owner_id
    JOIN build_publications bp ON bp.build_id = b.id JOIN build_share_requests current_request ON current_request.id = bp.request_id AND current_request.build_id = b.id
    WHERE bv.id = p->>'buildVersionId' AND b.archived_at IS NULL AND u.role IN ('MEMBER','OFFICER','ADMIN') AND current_request.status = 'APPROVED' AND current_request.requested_visibility = 'PUBLIC'
      AND EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = u.id AND a.provider = 'discord')
      AND EXISTS (SELECT 1 FROM build_share_requests historical WHERE historical.build_id = b.id AND historical.build_version_id = bv.id AND historical.status = 'APPROVED' AND historical.requested_visibility = 'PUBLIC')
  ) THEN RAISE EXCEPTION 'A submitted research build must be publicly approved' USING ERRCODE = '23514'; END IF;
  IF nullif(p->>'youtubeUrl','') IS NOT NULL AND (p->>'youtubeUrl') !~ '^https://www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}(&t=[0-9]+s)?$' THEN
    RAISE EXCEPTION 'Invalid evidence video reference' USING ERRCODE = '23514';
  END IF;
  FOR evidence_image_id IN SELECT value #>> '{}' FROM jsonb_path_query(p, '$.evidenceDocument.** ? (@.type == "image").attrs.imageId') LOOP
    IF NOT EXISTS (SELECT 1 FROM content_image_references ref JOIN content_images image ON image.id = ref.image_id WHERE ref.research_version_id = target_id AND ref.image_id = evidence_image_id AND image.owner_id = r.owner_id) THEN
      RAISE EXCEPTION 'Research evidence images must be bound to their owner and snapshot' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF nullif(p->>'youtubeUrl','') IS NULL AND NOT EXISTS (SELECT 1 FROM content_image_references ref WHERE ref.research_version_id = target_id) THEN
    RAISE EXCEPTION 'Submitted research requires original evidence' USING ERRCODE = '23514';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION dps_research_submission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ((TG_OP = 'INSERT' AND NEW.status = 'PENDING') OR (TG_OP = 'UPDATE' AND NEW.status = 'APPROVED' AND OLD.status <> 'APPROVED'))
    AND EXISTS (SELECT 1 FROM dps_research_versions WHERE id = NEW.id AND status IN ('PENDING','APPROVED')) THEN
    PERFORM dps_research_validate_submission(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER dps_research_submission_guard AFTER INSERT OR UPDATE ON dps_research_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dps_research_submission_guard();
--> statement-breakpoint
CREATE FUNCTION dps_research_publication_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_record text; published dps_research_versions; record_active boolean;
BEGIN
  target_record := CASE WHEN TG_TABLE_NAME = 'dps_research_records' THEN NEW.id ELSE NEW.record_id END;
  SELECT v.* INTO published FROM dps_research_publications p JOIN dps_research_versions v ON v.id = p.version_id AND v.record_id = p.record_id WHERE p.record_id = target_record;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF published.status <> 'APPROVED' THEN RAISE EXCEPTION 'Only approved research can be published' USING ERRCODE = '23514'; END IF;
  SELECT hidden_at IS NULL AND archived_at IS NULL INTO record_active FROM dps_research_records WHERE id = target_record;
  IF NOT record_active THEN RAISE EXCEPTION 'Hidden or archived research cannot retain a publication' USING ERRCODE = '23514'; END IF;
  -- External build/author validity is checked at new publication and by every read ACL.
  -- Timestamp updates must not freeze corrections after a linked build stops sharing.
  IF TG_TABLE_NAME = 'dps_research_publications' THEN PERFORM dps_research_validate_submission(published.id); END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER dps_research_publication_guard AFTER INSERT OR UPDATE ON dps_research_publications DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dps_research_publication_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER dps_research_record_publication_guard AFTER UPDATE ON dps_research_records DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dps_research_publication_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER dps_research_version_publication_guard AFTER UPDATE ON dps_research_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dps_research_publication_guard();
--> statement-breakpoint
CREATE FUNCTION dps_research_verification_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE record_owner text; target_record_id text; version_status text;
BEGIN
  SELECT v.record_id INTO target_record_id FROM dps_research_versions v WHERE v.id = NEW.version_id;
  SELECT r.owner_id INTO record_owner FROM dps_research_records r WHERE r.id = target_record_id FOR UPDATE;
  SELECT v.status INTO version_status FROM dps_research_versions v WHERE v.id = NEW.version_id FOR SHARE;
  IF TG_OP = 'UPDATE' AND ROW(NEW.id,NEW.version_id,NEW.reviewer_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.version_id,OLD.reviewer_id,OLD.created_at) THEN
    RAISE EXCEPTION 'Verification identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF record_owner = NEW.reviewer_id OR version_status <> 'APPROVED' OR NOT EXISTS (SELECT 1 FROM dps_research_publications p WHERE p.record_id = target_record_id) THEN
    RAISE EXCEPTION 'Verification requires another author and an approved published record' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users reviewer WHERE reviewer.id = NEW.reviewer_id AND reviewer.role IN ('OFFICER','ADMIN') AND EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = reviewer.id AND a.provider = 'discord')) THEN
    RAISE EXCEPTION 'Verification requires a connected officer or administrator' USING ERRCODE = '23514';
  END IF;
  PERFORM dps_research_validate_submission(NEW.version_id);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER dps_research_verification_guard BEFORE INSERT OR UPDATE ON dps_research_verifications FOR EACH ROW EXECUTE FUNCTION dps_research_verification_guard();
--> statement-breakpoint
CREATE FUNCTION dps_research_image_reference_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE research_owner text; p jsonb;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.research_version_id IS NOT NULL THEN RAISE EXCEPTION 'Research evidence references are immutable' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.research_version_id IS NULL THEN RETURN NEW; END IF;
  SELECT r.owner_id,v.payload INTO research_owner,p FROM dps_research_versions v JOIN dps_research_records r ON r.id = v.record_id WHERE v.id = NEW.research_version_id;
  IF NOT EXISTS (SELECT 1 FROM content_images image WHERE image.id = NEW.image_id AND image.owner_id = research_owner)
    OR NOT EXISTS (SELECT 1 FROM jsonb_path_query(p, '$.evidenceDocument.** ? (@.type == "image").attrs.imageId') image_ref WHERE image_ref #>> '{}' = NEW.image_id) THEN
    RAISE EXCEPTION 'Evidence must match the immutable research snapshot and owner' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER dps_research_image_reference_guard BEFORE INSERT OR UPDATE OR DELETE ON content_image_references FOR EACH ROW EXECUTE FUNCTION dps_research_image_reference_guard();
