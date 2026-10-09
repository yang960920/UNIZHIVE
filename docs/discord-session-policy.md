# Discord session and guild authorization policy

The live OAuth application requests `identify guilds.members.read`. The configured application client ID, client secret, guild ID, database URL, and a stable `NEXTAUTH_SECRET` stay in `apps/web/.env.local`. A bot token is not required for this login flow.

## Authorization response issuer

The Discord provider explicitly sets `issuer: https://discord.com`, matching the [official authorization-server metadata](https://discord.com/.well-known/openid-configuration). Discord may return an `iss` query parameter in the authorization response. NextAuth4's built-in provider omitted its expected issuer, so the installed OAuth client rejected those callbacks before token exchange. The expected issuer is a trusted constant, never learned from callback input. Existing state-cookie validation, scopes, code exchange, `/users/@me` profile retrieval and Guild membership authorization remain unchanged. ID-token mode is not enabled. Regression tests use the actual installed provider normalization and OAuth callback client with synthetic grants; foreign issuers, wrong/missing state and missing signed state cookies still fail before exchange.

## Token custody

- `accounts.access_token` and `accounts.refresh_token` contain versioned AES-256-GCM ciphertext, never plaintext. HKDF-SHA-256 derives a separate encryption key from the stable authentication secret; authenticated additional data binds each envelope to the Discord account ID and access/refresh column. Each write uses a fresh random 96-bit nonce.
- The authentication secret must contain at least 32 characters. Blank or short secrets cannot persist live OAuth tokens. Changing this secret invalidates sessions and makes earlier token envelopes unreadable; those users must sign in again. This implementation does not provide an automatic key rotation migration.
- OAuth access, refresh and ID tokens are never stored in the JWT, returned by the session callback, sent to the browser, or included in audit metadata. Unauthenticated legacy plaintext account values are rejected.
- Scopes and expiry are stored as non-secret account metadata. Account rows and user history remain intact when credentials are cleared.

## Internal permissions and Discord verification

`apps/web/src/lib/server/discord-authorization.ts` exports:

```ts
getLiveGuildEligibility(userId: string): Promise<
  "MEMBER" | "LEFT" | "UNAVAILABLE" | "REAUTH_REQUIRED"
>
getLiveGuildEligibilityState(userId: string): Promise<{
  status: "MEMBER" | "LEFT" | "UNAVAILABLE" | "REAUTH_REQUIRED";
  retryAfterSeconds: number | null;
}>
getSessionGuildEligibilityState(userId: string): Promise<{
  status: "MEMBER" | "LEFT" | "UNAVAILABLE" | "REAUTH_REQUIRED";
  retryAfterSeconds: number | null;
}>
```

The session callback validates the signed identity and reads its current database user without calling Discord. `getCurrentSessionState()` exposes this identity only for the account/navigation display. It must never authorize a protected read or mutation. `getCurrentAuthState()` and `getCurrentUser()` use `getSessionGuildEligibilityState()` before exposing an authorized user. Each request validates the current database account, consent scope, expiry and token generation. A successful Guild check can be reused for at most five minutes for that exact user, Guild, linked Discord ID and encrypted-token generation. Database roles are read again after this check, so approval withdrawal or role changes take effect on the next request, including during this reuse window. Existing development mock identities continue to use their restricted development-only policy.

The authentication options resolve the configured signing secret when used instead of retaining an earlier development fallback after an environment reload. React `cache` and request-owned header object WeakMaps share repeated session/authorization reads inside the same HTTP request, including its action and response render. The separate positive membership snapshot stores only a hash key and server verification timestamp, never a role or plaintext credential. Its fixed lifetime is not extended by access, timeouts or rate limits. Concurrent pending Discord transport requests are also merged until settlement. Mutation repositories still re-read actor and target roles in their own database transactions.

`getLiveGuildEligibilityState()` and the string `getLiveGuildEligibility()` always query Discord afresh, including when checking a target before approving or changing membership roles. Successful sign-in seeds the session snapshot only after Discord has confirmed the user and the matching identity/token generation has been persisted. Missing or cleared credentials, reduced scopes, unreadable tokens and token replacement cannot use an older snapshot. Confirmed absence, unauthorized grants and mismatched identities invalidate that generation; a late older success cannot restore it. An expired snapshot with an unavailable fresh check denies access instead of extending stale membership indefinitely.

`getCurrentAuthState()` returns `{ user, status, retryAfterSeconds? }`, where status is `GUEST`, `AUTHENTICATED`, `REAUTH_REQUIRED`, `UNAVAILABLE`, or `LEFT`. Only an absent session without an existing session cookie is an anonymous `GUEST`; an unreadable existing cookie is `REAUTH_REQUIRED`. A blocked live session never becomes anonymous demo data. The session callback recomputes the safe identity `authStatus` on the server, ignoring any JWT status marker. The authorized reader omits the user for blocked states, while temporary Discord failures leave the account header and login cookie intact. Database failures during membership or final role reads produce `UNAVAILABLE`; `getCurrentUser()` returns `null` while the richer helper retains the reason for the HOME/SEASON provider. A successfully verified identity whose current database role is `GUEST` remains `AUTHENTICATED` and can be shown the appropriate pending-approval state.

## Browser login continuity

JWT and session cookies have the same seven-day lifetime. `SessionKeeper` makes a same-origin, uncached `GET /api/auth/session` on mount, every 15 minutes, and when the tab becomes visible/focused (with a shared 30-second throttle). This endpoint renews the HTTP-only cookie without a Discord membership call. Server-component session reads alone cannot renew browser cookies. The client never treats returned roles as permission, stores login information in browser storage, or signs out after a network failure. Explicit logout first synchronously cancels pending renewals, timers and listeners; a same-origin BroadcastChannel sends only `STOP_RENEWAL` to other active tabs. This prevents a late renewal from restoring a cookie that sign-out just cleared. The logout flow also works without BroadcastChannel support. Invalid credentials, confirmed Guild departure, and current database permissions retain their server-side authorization rules.

Automatic navigation prefetch is disabled on the main menus and protected season/admin links to avoid speculative Guild checks. Discord `Retry-After` and exhausted bucket reset headers establish process-local transport cooldowns keyed by token hash/route. Requests with a still-valid session membership snapshot can continue using fresh internal database permissions without another Discord call. Without a valid snapshot, a long cooldown returns only the safe retry delay and denies protected actions, preserving recoverable OAuth credentials, account identity, and roles. The UI offers an explicit retry after this delay instead of sending the user through login again.

Admin guards also use this richer state. `UNAVAILABLE` raises a controlled, token-free authorization error and offers a retry in the current admin flow instead of redirecting a signed-in operator to login. Anonymous, re-consent and confirmed-leave states still redirect with their appropriate existing login messages. Admin error recovery uses Next.js `retry()` to re-fetch authorization, rather than clearing the boundary without fetching new data.

| Result            | Meaning                                                                                                                                                    | Behavior                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `MEMBER`          | Discord confirms the configured guild membership and the returned user ID matches the linked account.                                                      | Read the user's current database role and continue its usual permission checks.           |
| `LEFT`            | Discord responds with HTTP 404 / Unknown Member (`10007`) and the checked token generation is still current.                                               | Atomically demote to `GUEST`, clear OAuth credentials and write a token-free audit event. |
| `REAUTH_REQUIRED` | Missing credentials/scopes, unreadable envelope, expired token without a refresh grant, or unauthorized/revoked OAuth authorization.                       | Deny access and require Discord sign-in again. Do not claim that the user left the guild. |
| `UNAVAILABLE`     | Timeout, rate limit, 403, server failure, Unknown Guild/configuration failure, malformed data, ID mismatch, database failure, or a superseded leave check. | Deny access. Preserve the role and history because membership absence was not confirmed.  |

Internal database role changes are observed on the next authorized request. Discord Guild departure is observed when a fresh check occurs, at most five minutes after the prior successful session check for an actively used account. A forced live target check can invalidate membership sooner. There is no Discord bot, gateway listener, scheduled poll, or promise of background revocation while a user is idle. A process restart clears the snapshot and requires a new successful check.

## Expiry, refresh and races

Tokens within 30 seconds of expiry, and tokens with unknown expiry, require a refresh before authorization. An account row lock surrounds the refresh read/exchange/write transaction, serializing refresh-token rotation across application processes. Both rotated tokens are encrypted before committing; the old expired access token is never used as an authorization fallback after a failed refresh. Discord outage during refresh denies access without discarding recoverable credentials. Rejected/revoked refresh grants and reduced consent scopes clear credentials and require new consent.

The membership API call runs without holding a user-role or global membership lock. A confirmed leave subsequently takes advisory transaction lock `912743110`, locks the user and account, and compares the checked encrypted token to the current row. A newer sign-in or refresh invalidates an old leave response instead of letting it overwrite a newer identity state. This lock is shared by member approvals and the first-admin bootstrap.

After a confirmed leave, another successful guild sign-in changes `GUEST` to `APPLICANT`. Previous privileged roles are not restored, and membership approval is required again. Existing profile, season, operation and build records are retained.

Approval actions should require `getLiveGuildEligibility(targetUserId) === "MEMBER"` before starting their role-change transaction, then re-read actor and target roles under their own locks. Do not call the helper while holding the shared advisory lock: a confirmed leave needs its own lock-owning transaction.

## Verification scope

Tests exercise authenticated-encryption tampering and account/column binding, real transport response classification through mocked HTTP responses, refresh rotation under a serialized transaction fixture, per-request grant and role checks, five-minute snapshot boundaries, forced-live approval checks, outage denial after expiry, confirmed-leave clearing, reduced consent, and rejection of superseded or invalidated verification responses. Transport and lifecycle tests use synthetic credentials; they do not log in as a real Discord user or remove anyone from the real guild. Actual account consent remains a user-driven browser step.

Official protocol references: [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2), [Get Current User Guild Member](https://docs.discord.com/developers/resources/user#get-current-user-guild-member), [Discord status and error codes](https://docs.discord.com/developers/topics/opcodes-and-status-codes).
