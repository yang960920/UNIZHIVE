CREATE OR REPLACE FUNCTION dps_research_validate_submission(target_id text) RETURNS void LANGUAGE plpgsql AS $$
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
  FOR evidence_image_id IN SELECT image_nodes.value #>> '{}' FROM jsonb_path_query(p, '$.evidenceDocument.** ? (@.type == "image").attrs.imageId') AS image_nodes(value) LOOP
    IF NOT EXISTS (SELECT 1 FROM content_image_references ref JOIN content_images image ON image.id = ref.image_id WHERE ref.research_version_id = target_id AND ref.image_id = evidence_image_id AND image.owner_id = r.owner_id) THEN
      RAISE EXCEPTION 'Research evidence images must be bound to their owner and snapshot' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF nullif(p->>'youtubeUrl','') IS NULL AND NOT EXISTS (SELECT 1 FROM content_image_references ref WHERE ref.research_version_id = target_id) THEN
    RAISE EXCEPTION 'Submitted research requires original evidence' USING ERRCODE = '23514';
  END IF;
END;
$$;
