ALTER TABLE "seasons" ADD COLUMN "current_phase_order" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_current_phase_positive" CHECK ("seasons"."current_phase_order" > 0);--> statement-breakpoint
-- Record replaced labels before applying the supplied fixed scenario names.
-- Phase IDs, original dates and extra legacy rows remain intact.
WITH templates (slug, names) AS (
  VALUES
    ('deviation', ARRAY['1단계', '2단계', '3단계']),
    ('manibus', ARRAY['공중의 그림자', '스타로이드 제어', '스타더스트의 포효', '터치 오브 스카이', '새로운 새벽']),
    ('the-way-of-winter', ARRAY['얼어붙은 땅', '하늘을 메우는 불씨', '꺼지지 않는 불씨', '동틀 무렵']),
    ('endless-dream', ARRAY['악몽의 부상', '이상한 꿈의 확산', '불길한 징조의 침식', '현실과 허상의 교차', '끝없는 어둠', '무한한 꿈'])
)
INSERT INTO "audit_logs" (action, entity_type, entity_id, metadata)
SELECT
  'season.phase.template_migrated', 'season_phase', phase.id,
  jsonb_build_object('seasonId', season.id, 'phaseOrder', phase.phase_order, 'previousName', phase.name, 'nextName', template.names[phase.phase_order])
FROM "season_phases" AS phase
JOIN "seasons" AS season ON season.id = phase.season_id
JOIN "scenarios" AS scenario ON scenario.id = season.scenario_id
JOIN templates AS template ON template.slug = scenario.slug
WHERE phase.phase_order BETWEEN 1 AND cardinality(template.names)
  AND phase.name IS DISTINCT FROM template.names[phase.phase_order];--> statement-breakpoint
WITH templates (slug, names) AS (
  VALUES
    ('deviation', ARRAY['1단계', '2단계', '3단계']),
    ('manibus', ARRAY['공중의 그림자', '스타로이드 제어', '스타더스트의 포효', '터치 오브 스카이', '새로운 새벽']),
    ('the-way-of-winter', ARRAY['얼어붙은 땅', '하늘을 메우는 불씨', '꺼지지 않는 불씨', '동틀 무렵']),
    ('endless-dream', ARRAY['악몽의 부상', '이상한 꿈의 확산', '불길한 징조의 침식', '현실과 허상의 교차', '끝없는 어둠', '무한한 꿈'])
)
INSERT INTO "season_phases" (season_id, name, phase_order)
SELECT season.id, named.name, named.phase_order::integer
FROM "seasons" AS season
JOIN "scenarios" AS scenario ON scenario.id = season.scenario_id
JOIN templates AS template ON template.slug = scenario.slug
CROSS JOIN LATERAL unnest(template.names) WITH ORDINALITY AS named(name, phase_order)
ON CONFLICT (season_id, phase_order) DO UPDATE
SET name = EXCLUDED.name, updated_at = NOW()
WHERE "season_phases".name IS DISTINCT FROM EXCLUDED.name;--> statement-breakpoint
-- Unknown legacy scenarios retain their existing phase list; repair only a missing pointer.
UPDATE "seasons" AS season
SET current_phase_order = (
  SELECT MIN(phase.phase_order) FROM "season_phases" AS phase WHERE phase.season_id = season.id
), updated_at = GREATEST(season.updated_at + INTERVAL '1 millisecond', NOW())
WHERE NOT EXISTS (
  SELECT 1 FROM "season_phases" AS phase
  WHERE phase.season_id = season.id AND phase.phase_order = season.current_phase_order
)
AND EXISTS (SELECT 1 FROM "season_phases" AS phase WHERE phase.season_id = season.id);
