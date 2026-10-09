# Member approval and profile management

This operational phase uses the existing PostgreSQL `users`, `accounts`, `member_profiles`, and `audit_logs` tables. It does not delete accounts or historical season participation.

Full member information and membership administration are now `ADMIN`-only. The separate self-profile path and contextual season/party attendee names remain available under their existing participation rules. See [Member privacy](member-privacy.md) for the current role matrix and data boundaries.

## User flow

1. A member signs in using Discord. The server verifies membership in the configured UNIZ guild, and a new account starts as `APPLICANT`.
2. `/onboarding` collects a profile identifier, display name, Once Human nickname, private game UID, and optional introduction. The identifier uses 3–24 letters, digits, `-`, or `_`; ordinary members are not offered it as a public profile address. Approved returning members skip first-time onboarding and use `/onboarding?edit=1` when intentionally editing their own profile.
3. An `ADMIN` opens `/admin/members`. Completed pending profiles appear first. Missing profiles remain visible with approval disabled. Officers cannot open the membership management section or invoke its management Actions.
4. Approval rechecks the target's Discord membership, re-reads administrator authorization from locked database rows, and assigns `MEMBER`. Rejection assigns `GUEST`; approval cancellation assigns `APPLICANT`; an administrator can reopen a held application when Discord membership is confirmed.
5. `/members` and `/members/[handle]` show member information only to administrators. The profile owner retains the separate self-profile edit path. Administrators use `/admin/members/[id]` for private profile review and editing.

When a held member signs in again, the Discord authorization layer starts a new application as `APPLICANT`; it never restores a previous privileged role automatically.

## Authorization and privacy

- The admin layout, page, action, and server data layer each enforce authorization. Server Actions do not trust role or identity supplied by a browser form.
- Real PostgreSQL mutations reject mock actors. Development identities can view their own separate preview; they cannot edit actual members.
- `ADMIN` alone approves, rejects, reopens, cancels approval, and assigns or changes member roles. An officer cannot administer another account. Actors cannot change their own role through the management form.
- All role and profile changes acquire PostgreSQL advisory transaction lock `912743110`, then lock affected user rows in stable order and the target profile. Discord sign-in, confirmed guild departure, and bootstrap use the same advisory lock. A current actor role is re-read inside every write transaction.
- Manual role changes cannot remove the final administrator. Confirmed Discord guild departure always revokes access, including administrators: membership security takes precedence over retaining a departed administrator.
- The UID is selected only by the dedicated owner/administrator editor. The administrator member directory, profile summary, approval list, session, and audit records omit its value. Audit reasons are predefined codes, which prevent free-form UID/token text entering audit metadata.
- Member list, management list, and target-identity reads recheck the current DB administrator role and Discord connection under the authorization lock. A stale administrator display cannot grant access after a persisted demotion. Denied member administration does not sign an approved member or officer out of their other features.
- The admin profile Action uses `saveManagedMemberProfile`, which requires administrator status even for an own-profile payload. The self-profile Action uses the separately authorized owner path. Non-administrators receive no global member picker from season administration; only administrators can add other participants through `ENROL_MEMBERS`.
- Each write and audit append are committed atomically. Unknown or unavailable guild eligibility blocks approval/promotion; it does not infer membership from an old role.

## First administrator

No Discord login implicitly becomes an administrator. One explicit local setup operation is required after a chosen owner has signed in and completed their profile.

Dry-run from the repository root:

```powershell
node --conditions=react-server apps/web/scripts/bootstrap-admin.mjs --discord-id <Discord-user-ID>
```

When it reports `READY`, the explicitly authorized setup operation adds `--apply`:

```powershell
node --conditions=react-server apps/web/scripts/bootstrap-admin.mjs --discord-id <Discord-user-ID> --apply
```

The script loads ignored local settings itself and requires a loopback PostgreSQL host, a linked authenticated Discord account, a completed profile, a fresh OAuth token, and a successful direct guild membership check. It rejects production, existing administrators, and a prior `admin.bootstrap` audit record. It locks and rechecks eligibility before the atomic role update/audit append. It prints only a small status and safe user identity, never UID, tokens, database connection strings, or secrets. It is a one-time setup command and cannot be used silently as an administrator recovery mechanism.

## Validation

`apps/web/tests/member-policy.test.ts` checks profile completion and guild proof, repeated approvals, mock actors, forged actor fields, self-role changes, officer denial, privileged target handling, final-admin protection, reason validation, handle normalization, and owner/administrator private profile authorization. Direct route and admin section checks are covered by member page and admin authorization tests. `member-admin-access.integration.ts` verifies direct reads/Actions, current DB roles, Discord connection removal, self editing, restricted season pickers and scoped roster preservation with PostgreSQL rollback fixtures. The operational integration suite retains administrator approval and owner-profile regression coverage.
