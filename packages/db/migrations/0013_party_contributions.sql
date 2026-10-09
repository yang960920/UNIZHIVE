ALTER TABLE "operation_participants" ADD COLUMN "contribution" jsonb DEFAULT '{"keys":[],"loadoutNote":"","vulnerability":{"weapon":null,"status":null,"melee":null}}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "operations" ADD COLUMN "requested_contributions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "operation_participants" ADD CONSTRAINT "operation_participants_contribution_valid" CHECK (coalesce(
        jsonb_typeof("operation_participants"."contribution") = 'object'
        AND CASE WHEN jsonb_typeof("operation_participants"."contribution"->'keys') = 'array' THEN
          jsonb_array_length("operation_participants"."contribution"->'keys') <= 10
          AND "operation_participants"."contribution"->'keys' <@ '["weapon-vulnerability","status-vulnerability","melee-vulnerability","bulls-eye","fortress","healing","shield","control","mobility","supplies"]'::jsonb
          ELSE false END
        AND jsonb_typeof("operation_participants"."contribution"->'loadoutNote') = 'string'
        AND length("operation_participants"."contribution"->>'loadoutNote') <= 240
        AND jsonb_typeof("operation_participants"."contribution"->'vulnerability') = 'object'
        AND CASE WHEN jsonb_typeof("operation_participants"."contribution"->'vulnerability'->'weapon') = 'number'
          THEN ("operation_participants"."contribution"->'vulnerability'->>'weapon')::numeric BETWEEN 0 AND 100
          ELSE jsonb_typeof("operation_participants"."contribution"->'vulnerability'->'weapon') = 'null' END
        AND CASE WHEN jsonb_typeof("operation_participants"."contribution"->'vulnerability'->'status') = 'number'
          THEN ("operation_participants"."contribution"->'vulnerability'->>'status')::numeric BETWEEN 0 AND 100
          ELSE jsonb_typeof("operation_participants"."contribution"->'vulnerability'->'status') = 'null' END
        AND CASE WHEN jsonb_typeof("operation_participants"."contribution"->'vulnerability'->'melee') = 'number'
          THEN ("operation_participants"."contribution"->'vulnerability'->>'melee')::numeric BETWEEN 0 AND 100
          ELSE jsonb_typeof("operation_participants"."contribution"->'vulnerability'->'melee') = 'null' END,
        false
      ));--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_requested_contributions_valid" CHECK (CASE WHEN jsonb_typeof("operations"."requested_contributions") = 'array' THEN jsonb_array_length("operations"."requested_contributions") <= 10 AND "operations"."requested_contributions" <@ '["weapon-vulnerability","status-vulnerability","melee-vulnerability","bulls-eye","fortress","healing","shield","control","mobility","supplies"]'::jsonb ELSE false END);