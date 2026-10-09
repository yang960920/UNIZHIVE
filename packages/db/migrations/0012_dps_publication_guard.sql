CREATE OR REPLACE FUNCTION dps_research_publication_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_record text; published dps_research_versions; record_active boolean;
BEGIN
  target_record := coalesce(to_jsonb(NEW)->>'record_id', to_jsonb(NEW)->>'id');
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
