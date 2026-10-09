# UNIZ HIVE architecture

This repository implements Phase 0, Hive Core Foundation, Build Lab Data Specification v0.1 and the subsequent operating-data phase. HOME and Season Hub support demonstrations and live DB-backed accounts. Member administration and public member profiles are implemented; other requested routes present an application shell. The data specification adds evidence contracts and sourced historical samples. Discord bot execution, community editing, game-data persistence tables, build planning and damage simulation remain outside the implemented scope.

The subsequent operating-data phase connects real Discord sessions and PostgreSQL. HOME/SEASON select demo data only for guests/development identities; approved live users receive DB-backed read models and server mutations, and applicants receive an approval notice. Member directory/profile, member administration, season/operation registration management and the approved-member operation directory now have real implementations. No operating fixtures are seeded into live data.

The build-engine package now provides pure TypeScript/Zod evidence and revision contracts. Model validation accepts an explicit review date and performs no file, network, database or framework access. File access is confined to its separate verification CLI. Historical samples are not current gameplay baselines.

## Workspace and dependency direction

`apps/web` is a Next.js App Router application. `apps/bot` is a future Discord bot entry point, with no bot token or event loop implemented in this phase. pnpm owns dependency resolution across the workspace.

| Package              | Responsibility                                                                                                                                 | Dependency boundaries                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `@uniz/domain`       | Framework independent TypeScript identities, memberships, seasons, variable phases, votes, operations, permissions and pure read-model helpers | No Next.js, React, database, browser or HTTP dependency                          |
| `@uniz/db`           | PostgreSQL persistence, Drizzle schema, constraints and migrations                                                                             | No UI dependency; private member data stays on the server                        |
| `@uniz/integrations` | Discord, Steam, official news and TH.GL adapter contracts and explicit mock/live boundaries                                                    | No React or UI dependency; live secrets are server only                          |
| `@uniz/build-engine` | Evidence and revision contracts for a future stat/damage/event engine                                                                          | No web, UI or DB dependency; historical evidence, no current baseline or formula |
| `@uniz/ui`           | Accessible reusable presentation primitives                                                                                                    | React only, independent of database/integration secrets                          |

The web application may depend on all five packages. The future bot may use domain, integrations, db and build-engine. Lower-level packages never import either application. Game-data and combat-engine research can therefore progress independently of the website.

## Server and client boundaries

Server components read the Auth.js session, resolve the current principal and render route entry points. Protected member/admin routes authorize on the server through centralized domain policies. Role values from URL parameters, form fields, cookies other than the verified Auth.js session, or local storage do not authorize live writes. Development identity selection has its own server-side whitelist and a production prohibition.

Interactive dashboard and season components receive only the public principal ID and role. No Discord token, Steam key, database URL or Once Human UID is passed to these components. Public member data uses `PublicMemberProfile`, which excludes the private UID field altogether.

`apps/web/src/lib/mocks/` owns the single demo dataset. Components do not embed their own member/vote/operation seed arrays. `getDashboardData()` and `useDashboardData()` retain the browser-only demo boundary. `getOperationalPageData()` selects a live, pending, error or demo result on the server; live components receive a UID-free ISO-date DTO. `mutateOperationalData()` validates the request and derives the actor from fresh server authentication; its repository rechecks roles under a row lock and persists RSVP, migration and vote records. Live errors never substitute demo records.

## Demonstration behavior

All HOME and Season Hub data is labeled `MOCK`. The fixed demonstration clock is **2026-10-06 18:00 Asia/Seoul**. It allows “today 21:00”, countdowns, vote deadlines and phase state to remain internally consistent during review; these values are not live game/server observations. The source scenario names are retained as product examples without claiming current gameplay availability.

RSVP, migration status and scenario vote changes persist to a versioned browser-only demo store. The schema is Zod validated on reads and writes accept only recognized fixture members and valid domain statuses/candidate IDs. This store never contains authentication authority, private UID, integration credentials or live records. `useSyncExternalStore` provides a stable server snapshot and hydration-safe browser snapshot, and storage events keep multiple tabs synchronized. If browser storage is unavailable, changes remain in memory and Season Hub explains the limitation.

Tallies are derived from actual participant/member/vote fixture records. Changing a vote replaces that member's previous choice; the old count decreases and the new count increases. Ready counts include both `READY` and `MIGRATED`. Existing season records and immutable build-version references are preserved.

## Operating registration

`season-administration.ts` and `operation-administration.ts` are server-only data access modules. Their strict mutation schemas derive the actor from current Discord authentication, recheck the persisted OFFICER/ADMIN role and linked account under transaction locks, and save audit rows atomically. Admin client forms receive only explicitly selected public DTOs; no game UID, token or database diagnostics are serialized.

All live operating, membership and administrative writers acquire the shared authorization advisory lock before user locks; season-bound RSVP and operation administration lock the season before the operation. This also serializes enrollment against role revocation and capacity changes against new RSVPs. Edit forms include a server-issued update version, which is checked against the locked row. Successful mutations refresh list, detail and member read models. Season child changes advance the parent version.

Seasons progress PLANNED → ACTIVE → SETTLEMENT → ARCHIVED; only one current season may be registered through the CMS. Activation requires a current dated phase. Phase schedules are variable length, ordered and non-overlapping inside the season. Participant/vote/operation history prevents identity changes; terminal seasons and operations remain read-only. Cancel or complete pending operations before settling a season. KST input is converted on the server and unchanged imported timestamps retain their seconds and milliseconds. There is no physical-delete feature, live seed or automatic game-data catalog.

## Seasons and history

Users are stable identities, and member profiles live across seasons. `SeasonMembership` records the relationship between one user and one season. Its migration status represents that participant's preparation for the next transition. It does not collapse season history into a `currentServer` field on a user.

`SeasonPhase` records carry season ID, order and optional date boundaries. The fixture currently has five records to demonstrate variable length; UI loops and pure helpers derive the total from those records. There is no phase-count enum or hardcoded six-phase model. The seven-step Hive migration lifecycle is a separate operational workflow, not the phase count of the game.

Season History is an append/archive model. No history deletion action is provided. Representative screenshot areas remain clearly labeled placeholders until authentic screenshots are uploaded.

## Source documents and assets

`docs/product-blueprint/UNIZ HIVE Blueprint.dc.html` and `support.js` are retained as product reference documents. Neither is imported into the production web runtime or used as a dependency. The Blueprint's information hierarchy and tokens were reimplemented in ordinary React and CSS; the generated runtime was not copied. Existing PNG logos are copied unchanged to `assets/brand` and the web public brand directory. No new logo has been generated.

See `docs/product-blueprint/analysis.md` for source interpretation and explicit corrections, `database.md` for constraints, `integrations.md` for adapter status, and `build-lab.md` for the versioning and research plan.
