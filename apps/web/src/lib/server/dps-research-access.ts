import "server-only";
import { builds, buildVersions, sql } from "@uniz/db";
import type { CurrentUser } from "../auth-policy";
import { isDpsMember, isDpsStaff } from "../dps-research";
import { approvedBuildVersionAccessSql } from "./build-sharing";

type SqlValue = ReturnType<typeof sql> | { getSQL(): ReturnType<typeof sql> };

/** A research record may publicly cite only a currently shared PUBLIC approved build version. */
export function dpsLinkedPublicBuildAccessSql(payload: SqlValue) {
  return sql`(coalesce(${payload}->>'buildVersionId', '') = '' or exists (
    select 1 from ${builds}
    join ${buildVersions} dps_linked_version on dps_linked_version.build_id = ${builds.id}
    where dps_linked_version.id = ${payload}->>'buildVersionId'
      and ${approvedBuildVersionAccessSql(null, sql`dps_linked_version.id`)}
  ))`;
}

/** Approved history remains public only while a valid approved publication is active. */
export function dpsResearchPublishedVersionAccessSql(versionId: SqlValue) {
  return sql`exists (
    select 1 from dps_research_versions dps_visible_version
    join dps_research_records dps_visible_record on dps_visible_record.id = dps_visible_version.record_id
    join users dps_visible_owner on dps_visible_owner.id = dps_visible_record.owner_id
    join dps_research_publications dps_active_publication on dps_active_publication.record_id = dps_visible_record.id
    join dps_research_versions dps_active_version on dps_active_version.id = dps_active_publication.version_id and dps_active_version.record_id = dps_visible_record.id
    where dps_visible_version.id = ${versionId}
      and dps_visible_version.status = 'APPROVED' and dps_active_version.status = 'APPROVED'
      and dps_visible_record.hidden_at is null and dps_visible_record.archived_at is null
      and dps_visible_owner.role in ('MEMBER','OFFICER','ADMIN')
      and exists (select 1 from accounts dps_owner_account where dps_owner_account.user_id = dps_visible_owner.id and dps_owner_account.provider = 'discord')
      and ${dpsLinkedPublicBuildAccessSql(sql`dps_visible_version.payload`)}
      and ${dpsLinkedPublicBuildAccessSql(sql`dps_active_version.payload`)}
  )`;
}

/** Caller passes the current server-authorized principal, refreshed inside the read transaction. */
export function dpsResearchVersionAccessSql(actor: CurrentUser | null, versionId: SqlValue) {
  const owner = isDpsMember(actor)
    ? sql`exists (
        select 1 from dps_research_versions dps_owned_version
        join dps_research_records dps_owned_record on dps_owned_record.id = dps_owned_version.record_id
        where dps_owned_version.id = ${versionId} and dps_owned_record.owner_id = ${actor.id}
      )`
    : sql`false`;
  const submitted = isDpsStaff(actor)
    ? sql`exists (select 1 from dps_research_versions dps_submitted_version where dps_submitted_version.id = ${versionId} and dps_submitted_version.submitted_at is not null)`
    : sql`false`;
  return sql`(${owner} or ${submitted} or ${dpsResearchPublishedVersionAccessSql(versionId)})`;
}

/** Reproduction evidence is separate from permission to publish and excludes the author's vote. */
export function dpsResearchVerifiedSql(versionId: SqlValue) {
  return sql<boolean>`exists (
    select 1 from dps_research_versions dps_verified_version
    join dps_research_records dps_verified_record on dps_verified_record.id = dps_verified_version.record_id
    where dps_verified_version.id = ${versionId}
      and case when jsonb_typeof(dps_verified_version.payload->'trials') = 'array' then jsonb_array_length(dps_verified_version.payload->'trials') >= 3 else false end
      and (length(coalesce(dps_verified_version.payload->>'youtubeUrl', '')) > 0 or exists (select 1 from content_image_references dps_evidence where dps_evidence.research_version_id = dps_verified_version.id))
      and (select count(distinct dps_verification.reviewer_id) from dps_research_verifications dps_verification
        join users dps_verifier on dps_verifier.id = dps_verification.reviewer_id and dps_verifier.role in ('OFFICER','ADMIN')
        where dps_verification.version_id = dps_verified_version.id and dps_verification.confirmed = true and dps_verification.reviewer_id <> dps_verified_record.owner_id
          and exists (select 1 from accounts verifier_account where verifier_account.user_id = dps_verifier.id and verifier_account.provider = 'discord')) >= 2
  )`;
}
