# Live operational provider

HOME and SEASON now select their data source on the server for every request.

- Guests and development mock accounts keep the explicitly labelled public demonstration. Browser demo changes remain local and never reach PostgreSQL.
- Real Discord users awaiting approval see a profile and approval notice. Their screens contain no operating fixture records or interactive operating controls.
- Approved real users receive only PostgreSQL records. A missing current season, operation, vote, announcement, build, or history produces its own empty state. Database failures produce an error state, never an automatic demo fallback.

HOME and SEASON also consume the live authorization status separately from the signed account identity used by the header. A temporary Discord connection failure keeps that account visible and offers a delayed retry, expired authorization prompts another login, and confirmed guild departure explains the rejoin and approval process. None of these real-session states displays public demo records or allows protected writes. Authenticated real GUEST accounts see the joining notice.

## Read boundary

`apps/web/src/lib/server/operational-repository.ts` returns the public DTO defined in `apps/web/src/lib/data/operational-types.ts`. It rechecks the user's database role inside a repeatable-read transaction. ISO date strings are serialized explicitly. No email, game UID, OAuth token, credential, integration metadata, or build loadout enters this DTO.

HOME selects the newest approved ACTIVE or SETTLEMENT season as its current season. `/season` lists approved registered seasons; `/season/[id]` reads only the selected season. Persisted seasons use `currentPhaseOrder`, independent of phase dates, and known scenario templates exclude retired extra phase rows. Member counts and migration/vote summaries use approved, nonremoved participants. Settlement can be absent; the provider returns null for its date and countdown. Operation capacity uses all persisted Going reservations, including reservations retained after a participant loses membership. Historical season membership remains recorded independently of current approval. Discord presence, Steam statistics, community guides/gallery, and game calculation data remain unavailable; they are not fabricated.

`LiveDashboard` and `LiveSeasonHub` share reusable current season, migration, and voting cards. Existing demo components and their sample fixture records remain unchanged.

## Mutations

`mutateOperationalData` is a Server Action with a strict Zod discriminated input. Inputs choose only the target and desired state; they cannot supply an actor, role, membership, tally, timestamp, or permission. It derives the actor from `getCurrentUser`, rejects mock identities, and then calls the server-only repository. The repository rechecks the persisted role and linked Discord account before writing.

- RSVP: locks the operation row, checks SCHEDULED status and a future start, checks membership and the current phase for season-bound operations, and checks total capacity and any existing role assignment's capacity before a new Going reservation. A current Going participant can retain or release their place at capacity. It upserts one response per operation and member. This phase does not assign new operation roles.
- Migration: locks the selected season row and requires approved nonarchived status, a registered participant and the final manual phase. PLANNED seasons also allow this when their administrator has selected the final phase. It updates the existing membership with a strictly increasing version; it does not auto-enrol users. Returning to a previous phase hides the form without deleting the saved status.
- Vote: requires approved ACTIVE or SETTLEMENT status, season participation and a valid selected phase, rejects a missing or elapsed deadline and candidates from other seasons, then replaces the existing member vote through the season/user unique constraint. Votes close exactly at the deadline. Old demonstration fixtures without a manual pointer keep their date-based policy.

Transactions acquire the shared authorization advisory lock before locking the fresh user to serialize against concurrent role revocation and administration. Season-bound RSVP locks the season before the operation. All writers for operation capacity lock the operation; season administration locks the season before changing phases, membership, candidates, or voting dates. Audit rows and the corresponding mutation commit together. Audit metadata contains state identifiers only, never game UID or credentials.

Live actions show pending state and visible success/error messages, disable duplicate button submissions, and refresh server data after success. They never write localStorage. The Server Action authenticates on every request, including direct requests outside the UI.

## Registration scope and verification

These views read and update registered operating records. `/admin/seasons` creates the season and internal scenario/server references together, automatically configures phases and manages participants and voting candidates. ADMIN alone can move the current phase backwards or forwards with a checked season version. `/admin/operations` registers and manages operations. Approved members can find every registered operation and respond through `/ops` and `/ops/[id]`; public attendees exclude revoked members while their saved reservations still count toward capacity. Announcement registration remains a later phase. No sample records are seeded into the live database.

`apps/web/tests/operational-policy.test.ts` checks strict inputs, forged actors, mock and applicant denial, approved roles, season membership/status/phase boundaries, vote deadline/candidate checks, and RSVP capacity/release decisions. PostgreSQL integration verification exercises transaction persistence and concurrent reservation behavior separately. Real Discord authentication still requires the user's own consent through Discord.
