# Product Blueprint analysis

Source: the complete 1,004-line `UNIZ HIVE Blueprint.dc.html`, authored in Claude Design and dated 2026-10-06. The generated `support.js` is a renderer for that source, not an application architecture or an implementation dependency. The user's separate request defines this session's scope and takes priority over illustrative examples in the Blueprint.

## Full document structure

| Section | Product intent | Foundation implementation |
| --- | --- | --- |
| Header and pillars | A persistent Korean Hive across official-server seasons; migration, operations, lab, community, map, Discord | Product identity and package boundaries |
| A: Design direction | Organic brand 10%, restrained product UI 90%; long-lived identity; source badges; intentional glow | Dark tokens, thin borders, limited illustration, explicit demo sources |
| B: Sitemap | Eight top-level areas, system routes and separate admin | Requested App Router routes and coming states |
| C: HOME | Decide what to do today within ten seconds; action, state and content rows | Prominent next operation/RSVP, migration, voting, announcements, members, news/Steam, summary cards |
| D: Page structures | Operations, roles, members, data sources, search and auth flow | Page shells, global navigation/search and auth foundation; full subfeatures deferred |
| E: Components | Shared shell/primitives, domain cards and independent adapters | Shared UI package, domain types and integration package |
| F: Tokens | Specified charcoal/teal palette, Pretendard, JetBrains Mono, 4px spacing and 2/4/6px radii | CSS token system and responsive styling |
| G: Navigation | Desktop 1440, tablet 1024, mobile 390–430; five-item bottom nav and MORE drawer | Responsive common shell |
| H: Map | Official TH.GL iframe with route/scenario controls outside the frame; attribution | Adapter/page foundation; no scraping or unverified embed URL |
| I: Build Lab | Planner, test, compare, stat evidence and benchmark settings | Independent engine skeleton and immutable versions only; no game data or damage formula |
| J: Community | Persistent guides, tips, builds, Q&A and gallery, with version-pinned posts | Summary fixtures and coming pages only |
| K: Profiles | Stable identity, seasonal participation, showcase and reserved AI area | Domain/member persistence foundation; no screenshot AI |
| L: Season Hub | Current season, transition lifecycle, migration board, next scenario vote and preserved history | Full reactive Season Hub |
| M: Admin | Distinct amber admin mode, approval/roles and integration visibility | Server-authorized page shells and central permissions |
| N: Open decisions | Phase ownership, public visibility, damage evidence and UI priority | User instructions resolve this session; future research remains documented |

## UI decisions adopted

The action/status/content hierarchy is preserved. NEXT OPERATION receives the strongest dashboard emphasis. Season Hub includes one detailed brand emblem in its current-season hero, followed by a compact variable-length phase strip, a seven-step operational lifecycle, migration and voting panels, and three representative history cards. Candidate selection, RSVP and self-migration status have actual local demo effects shared between pages.

Desktop reads as a modern operations dashboard. On narrower screens cards stack, lifecycle steps scroll within their own region, phase labels compress, and member status buckets wrap without increasing document width. Semantics, visible focus, named controls, live feedback, pressed states and text alongside colors support keyboard and assistive technology users.

## Corrections and scope precedence

1. The Blueprint illustrates phase 1–6 and asks whether UNIZ should define them. The user explicitly prohibits a fixed six-phase structure. The implementation derives the count and order from `SeasonPhase[]`; the fixture intentionally contains five records.
2. The Blueprint's migration sample categories total 31 but yield 15 ready/migrated members, while its headline says 23/31. The implementation preserves the requested headline with consistent record-derived categories: 2 undecided, 2 joining, 4 pre-registered, 18 ready and 5 migrated. READY + MIGRATED = 23.
3. The Blueprint shows settlement as already passed in the lifecycle while the hero gives a future settlement date. The fixture marks the current season as current, settlement as upcoming, and explains that voting is an early choice. Game phases and operational lifecycle are separate concepts.
4. Blueprint mock DPS, formula version and estimated gear stats are visual examples, not evidence. The user's ban on invented damage formulas/game data takes precedence. No DPS values are copied into HOME, Season Hub or the build engine.
5. Blueprint integration indicators such as live OAuth, healthy iframe and official patch news are illustration values. They are not proof of working integration. The implementation labels demo data as MOCK, displays missing Steam observations as a dash and identifies unconnected news accurately.
6. Blueprint UID masking still contains private account information. Public fixture profiles contain no UID property, and the database/auth design treats UID as private server data.
7. Blueprint includes broader community, planner, roster editing, notification and bot examples. The user's Foundation/HOME/Season scope controls actual implementation. Remaining routes use polished coming states rather than fabricated live features.

## Asset interpretation

The five supplied PNGs are copied byte-for-byte and assigned meaningful names: horizontal logo for desktop navigation; stacked logo for vertical branding; detailed emblem for large brand moments; compact emblem for small application identity; mono emblem for restrained footer emphasis. Source PNGs are preserved.

No Blueprint renderer, `x-dc`, `sc-for`, DCLogic class or `text/x-dc` runtime enters the production application. Product structure was analyzed and reimplemented with normal typed modules, ordinary React and design-token CSS.
