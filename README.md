# UNIZ HIVE

Once Human 한국 하이브의 시즌 운영 웹 플랫폼입니다. Discord 로그인·회원 승인, 시즌과 파티 모집, 커뮤니티·자랑하기, 빌드 구성·도핑 선택, DPS 실측 자료 등록·관리자 검토, 지도 파밍 안내와 한국어 Steam 소식을 제공합니다. PostgreSQL에 운영 기록과 버전 이력을 저장하며, 하이브 공유·공개 빌드는 관리자 승인 후 표시합니다. DPS 계산 공식과 Discord Bot 실행은 후속 범위입니다.

## 1차 Vercel 배포

GitHub 저장소는 [yang960920/UNIZHIVE](https://github.com/yang960920/UNIZHIVE)입니다. [Vercel 배포 안내](docs/vercel-deployment.md)에 DB 준비, 기존 관리자 유지, 최초 관리자 설정, 환경변수와 Discord 콜백 등록 순서를 정리했습니다. Vercel의 Root Directory는 `apps/web`이며 서울 `icn1` 서버 설정을 포함합니다. 환경 파일·DB 백업·검수 캡처·로컬 연구 원본은 업로드 대상에서 제외합니다.

Discord 실제 로그인과 최초 관리자 등록을 완료했습니다. 승인 멤버의 HOME/SEASON은 PostgreSQL을 사용하며, 가입 승인·보류·승인 취소·역할 변경과 프로필 수정, 참가 응답·이동 상태·투표 변경을 서버에 저장합니다. 시즌·작전 관리 화면에서 실제 정보를 등록할 수 있으며, 등록 전에는 빈 상태를 표시합니다.

## 바로 실행하기

Node.js 24.x(24.14.0 검증), pnpm 11.25.0을 사용합니다.

```powershell
cd UNIZHIVE
pnpm install
pnpm dev
```

[HOME](http://127.0.0.1:3000), [SEASON](http://127.0.0.1:3000/season), [BUILD LAB](http://127.0.0.1:3000/lab), [로그인](http://127.0.0.1:3000/login)을 열어 확인합니다. 인증 Cookie가 유지되도록 `127.0.0.1`을 일관되게 사용합니다.

현재 로컬 설치에는 Git에 제외된 루트 `.env`와 `apps/web/.env.local`이 준비되어 있습니다. UNIZ 전용 PostgreSQL은 `127.0.0.1:5433`에 연결되어 있고 개발 세션용 무작위 키와 Discord OAuth 설정도 로컬에 준비되어 있습니다. 다른 환경에서는 다음처럼 예제를 복사합니다.

```powershell
Copy-Item .env.example apps/web/.env.local
```

`NODE_ENV=development`에서 Member(Kiri), Officer(Moss), Admin(Yun) 개발 계정으로 로그인할 수 있습니다. `MOCK_AUTH=false`로 개발 로그인을 끌 수 있습니다. 실제 role은 서버의 identity whitelist 또는 DB에서만 결정합니다. 고정 secret을 설정하지 않으면 개발 서버를 재시작할 때 로그인이 초기화됩니다.

**Production은 Mock 로그인을 제공하지 않으며 `MOCK_AUTH=true` 설정을 거부합니다.** Credential 없이도 Production 공개 데모는 실행됩니다. 실제 Discord 로그인에는 DB migration과 별도 credential이 필요합니다.

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm db:verify
pnpm auth:verify
pnpm ops:verify
pnpm data:verify
pnpm build
pnpm start
```

`pnpm dev`와 `pnpm start`의 기본 포트는 3000입니다. 같은 포트를 사용하는 개발 서버를 종료한 뒤 Production 서버를 시작합니다.

## 화면과 상호작용

- **HOME**: 현재 Scenario/Server/가변 Phase/정산 카운트다운, 핵심 NEXT OPERATION RSVP, 이동 준비율, 다음 시즌 투표, 실제 공지와 최근 하이브 글, Steam 공식 뉴스·동접·조회 시각. 전체 멤버 카드는 관리자에게만 표시합니다.
- **SEASON**: 승인된 시즌 목록과 직접 참여, 선택한 시즌 상세의 고정 단계·관리자 이전/다음·마지막 단계 이동 신청, 일반 멤버의 시즌 등록 신청·본인 신청 수정.
- **AppShell**: Desktop Navbar, 모바일 HOME/SEASON/OPS/LAB/MORE, 계정 메뉴, 알림, Ctrl+K 검색, 키보드 포커스와 dialog focus trap.
- **MEMBERS / Admin Members**: 관리자 전용 전체 멤버 목록·프로필, 가입 승인·보류·재검토·승인 취소·역할 변경. 본인 프로필은 별도 등록·수정 경로를 사용합니다. UID는 공개 목록·세션·승인 기록에 포함하지 않습니다. [멤버 정보 정책](docs/member-privacy.md)을 참고합니다.
- **Admin Seasons**: 시나리오와 네 자리 시즌 번호로 서버·시즌 통합 생성, 하이브 이름·선택 정산일·정보 수정, 일반 멤버 신청 승인·반려, 참가자 추가·수정·명단 삭제, 단계·투표·진행 관리. 참가 명단에서 삭제해도 기존 기록은 유지합니다.
- **파티 모집 / Admin Operations**: 시즌별 달력·날짜 선택·시간순 모집, 승인 멤버의 생성·작성자 수정·취소, 시즌 등록자의 참가 응답, 운영진의 명단 관리. 기존 작전 관리와 기록은 유지합니다. 역할·팀 배정 편집은 후속 범위이며 자세한 정책은 [파티 모집](docs/party-recruitment.md)에 있습니다.
- **COMMUNITY / Admin Community**: 승인 회원의 본문 이미지·유튜브 첨부, 댓글·대댓글·좋아요, 본인 수정·보관, 승인된 공유 빌드 버전 연결과 운영진의 숨김·표시·고정·공지 관리. [커뮤니티 정책](docs/community.md)을 참고합니다.
- **BUILD LAB**: 신규 V2는 게임 장비창 형태의 슬롯·확인한 원본 아이콘으로 무기·방어구·전투 감염물·크래들을 선택하고 부속품·탄약·신규 모듈·접미사·개체 등급을 기록합니다. 모듈·핵심 방어구는 세력 보존/우위 유지, 케이지 헬멧/감옥 헬멧처럼 확인한 한국어 혼용명과 영문명으로도 검색합니다. 별칭 추가는 개별 장비 ID·슬롯·효과·기존 저장본을 변경하지 않습니다. 3D 화면은 없으며 기존 V1 입력과 저장본을 보존합니다. 실제 장비와 연결 근거를 확인한 항목만 선별하고 미확인 수치·아이콘을 임의로 채우지 않습니다. 크래들의 시나리오·캐릭터 해금 조건은 미확인이며 선택은 구성 기록입니다. 추천도·콘텐츠·태그, 목록별 9개 검색 페이지, 새 버전·고정 버전 링크·구성표 복사·보관·복원을 지원합니다. 상세는 한 저장본과 버전 정보 20개를 읽습니다. 기본은 나만 보기이며 하이브/전체 공개를 선택할 수 있습니다. 기존 테이블을 사용하고, 현재 전체 게임 카탈로그·정적 스탯·DPS 계산은 후속 범위입니다. 자세한 범위는 [Build Planner](docs/build-planner.md)에 있습니다.

로그인하지 않은 방문자와 개발 계정은 **2026.10.06 18:00 KST** 기준의 MOCK/DEMO 운영 기록을 봅니다. 31개 데모 참가 기록 중 READY 18 + MIGRATED 5 = 23명 준비 완료입니다. 실제 Discord 승인 계정은 DB 운영 기록을 보며, 신청자는 프로필·승인 안내를 봅니다. Phase 개수에 제한을 두지 않습니다. HOME의 Steam 공식 뉴스·접속자 수는 LIVE/DEMO 모두 실제 공개 API에서 조회합니다. DPS 계산은 후속 범위입니다.

2026-10-08 지도·Steam 연동을 완료했습니다. `/map`은 네 시나리오의 한국어 TH.GL 지도, 감염물·동물·자원 파밍 필터, 공유 코드, 링크 복사와 전체 화면을 지원합니다. 빌드의 감염물과 동물 융합 재료에서 ‘지도에서 찾기’를 누르면 현재 시나리오와 대상이 새 탭에 적용됩니다. 전투 감염물 23종은 한국 자료 우선 재조사를 반영해 히든·일반·의뢰·변종 보상을 구분하고 출처를 표시합니다. 사일로는 한 필터로 통합하고, 지도 옆의 이름 목록을 클릭하면 개별 위치로 이동하며 드랍 안내를 엽니다. 확인된 던전·보스 파밍 대상도 대표 장소를 중심으로 표시합니다. 무한의 꿈 테디는 서쪽탑 마스터 히든 확률 보상으로 안내하며 영구 서버의 실제 개방 상태를 우선합니다. 지도 마커 클릭과 자체 안내의 직접 연동은 제공사 API 미지원으로 개별 목록을 이용합니다. 미확인 보상·이용자 사례·공략 참고를 구분하고 다른 시나리오의 보상표를 복제하지 않습니다. HOME은 Steam 한국어 공식 소식 RSS의 최신 3건과 전 세계 Steam 동접·조회 시각을 표시합니다. 자세한 범위는 [Integration 문서](docs/integrations.md)를 참고합니다.

데모 RSVP·투표·이동 상태는 계정별 브라우저 저장소를 사용합니다. 실제 계정의 변경은 서버 권한·시즌 참가·마감·정원을 확인하고 PostgreSQL에 저장합니다. 데모 계정은 실제 DB를 변경할 수 없습니다. 로그인 상태·권한·UID·secret은 브라우저 저장소에 넣지 않습니다. 자세한 경계는 [운영 Provider](docs/live-provider.md), [가입 승인](docs/member-approval.md), [Discord 세션 정책](docs/discord-session-policy.md)에 기록했습니다.

2026-10-08 통합 검색과 계정 설정을 연결했습니다. 헤더 검색은 실제 빌드·커뮤니티·공지·파티·시즌과 파밍·드랍·장비·최근 공식 소식을 권한에 맞춰 검색합니다. `/settings`에서 프로필, 사이트 알림, 화면·지도 설정, 새 빌드의 기본 공개 범위를 저장할 수 있습니다. 개인 알림은 본인의 참가 파티·글·시즌과 하이브 공지를 기준으로 표시합니다. 자세한 동작은 [계정 설정과 검색](docs/account-settings-and-search.md)에 정리했습니다.

## Repository Tree

```text
UNIZ-HIVE/
├─ apps/
│  ├─ web/
│  │  ├─ public/brand/          원본 그대로 복사한 로고 5종
│  │  ├─ src/app/              App Router 화면 및 Auth API
│  │  ├─ src/components/       Shell, Dashboard, Season, MapEmbed
│  │  ├─ src/lib/
│  │  │  ├─ mocks/             중앙 Mock fixture
│  │  │  ├─ data/              교체 가능한 데이터 경계
│  │  │  └─ server/            인증 저장소·서버 권한
│  │  └─ tests/                Production Mock 방어 테스트
│  └─ bot/src/                 실행하지 않는 확장 골격
├─ packages/
│  ├─ domain/src/, tests/      순수 타입·시즌 규칙·권한
│  ├─ db/src/, migrations/     29개 테이블·추가 SQL 및 snapshot
│  ├─ integrations/src/        Discord·Steam·TH.GL·뉴스 adapter
│  ├─ build-engine/src/        model/stats/effects/simulator/validation
│  └─ ui/src/                  공통 접근성 UI
├─ assets/brand/               보존한 브랜드 PNG
├─ docs/
│  ├─ product-blueprint/       참고 원본·전체 구조 분석
│  ├─ architecture.md
│  ├─ database.md
│  ├─ integrations.md
│  ├─ build-lab.md
│  ├─ build-data-spec-v0.1.md
│  ├─ build-data-research-equipment.md
│  ├─ build-data-research-effects.md
│  ├─ discord-setup.md
│  └─ verification.md
├─ compose.yaml                선택적 로컬 PostgreSQL
├─ .env.example
├─ pnpm-workspace.yaml
└─ pnpm-lock.yaml
```

## 구현된 경로

| 구분                     | URL                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 실제 Dashboard / Season  | `/`, `/season`                                                                                                  |
| Member directory/profile | `/members`, `/members/[handle]`                                                                                 |
| 파티 모집                | `/ops`, `/ops/new`, `/ops/[id]`, `/ops/[id]/edit`                                                               |
| Build Planner            | `/lab`, `/lab/new`, `/lab/b/[id]`, `/lab/b/[id]/edit`                                                           |
| 지도 / Compare 안내      | `/map`, `/lab/compare`                                                                                          |
| 하이브 커뮤니티          | `/community`, `/community/new`, `/community/[id]`, `/community/[id]/edit`                                       |
| 공지 읽기·관리           | `/announcements/[id]`, `/admin/community`, `/admin/community/notices/new`, `/admin/community/notices/[id]/edit` |
| DB shell                 | `/db`, `/db/[category]/[slug]`                                                                                  |
| System                   | `/login`, `/onboarding`, `/settings`, `/about`                                                                  |
| Member administration    | `/admin/members`, `/admin/members/[id]`                                                                         |
| Admin shell              | `/admin`, `/admin/seasons`, `/admin/operations`, `/admin/community`, `/admin/database`, `/admin/integrations`   |
| Auth handler             | `/api/auth/[...nextauth]`                                                                                       |

## PostgreSQL — 선택적 로컬 개발

Mock 화면은 PostgreSQL이나 Docker 없이 실행됩니다. DB 기능을 확인하려면 먼저 Docker Desktop을 실행하고 다음 명령을 사용합니다.

```powershell
docker compose up -d postgres
```

루트 `.env`에 아래 개발 연결 문자열을 설정하고 migration을 적용합니다. 동일한 `DATABASE_URL`을 `apps/web/.env.local`에도 설정하면 인증/Onboarding에서 사용합니다. Compose의 비밀번호는 로컬 개발 전용입니다.

```dotenv
DATABASE_URL=postgresql://uniz:local-development-only@127.0.0.1:5433/uniz_hive
```

```powershell
pnpm db:generate
pnpm db:migrate
pnpm db:verify
```

초기 `0000_hive_foundation.sql`과 Drizzle snapshot을 실제 PostgreSQL 17.11에 적용했습니다. 재실행 시 migration 중복 없음과 TCP 연결 검증 21개 통과를 확인했습니다. `5432`의 다른 프로젝트와 충돌하지 않도록 `5433`을 사용합니다. 검증 fixture는 트랜잭션에서 rollback하여 영구 데이터를 남기지 않습니다.

## Auth / Permission

Discord identity → UNIZ guild membership 확인 → APPLICANT → Once Human 닉네임/UID 등록 → 운영진 승인 → MEMBER 흐름을 구현했습니다. 실제 로그인·프로필 등록과 사용자가 지정한 최초 관리자 설정까지 확인했습니다. OAuth 토큰은 계정별로 암호화해 서버에 저장합니다. 로그인 표시와 작업 권한을 구분하고, 서버 가입의 긍정 확인은 동일 토큰 세대에서 최대 5분만 사용하며 DB 역할은 매 요청과 저장 트랜잭션에서 다시 확인합니다. 가입 승인 대상은 즉시 Discord를 확인합니다. 확인된 탈퇴는 권한 해제·토큰 삭제·감사 기록으로 처리하고 재가입 시 재승인합니다. 연결 장애·재로그인 필요 상태는 데모로 대체하지 않습니다.

`GUEST`, `APPLICANT`, `MEMBER`, `OFFICER`, `ADMIN` 권한을 `packages/domain/src/permissions.ts`에서 중앙 관리합니다. Member는 본인 파티·게시글 관리, Officer는 시즌·파티·커뮤니티 관리, Admin은 전체 멤버·가입 승인·역할·Integration 관리를 포함합니다. 서버는 페이지와 write 경계에서 정책을 재검사합니다. UID는 비공개 DB 필드이며 public session/profile에서 제외합니다.

Live 설정과 Discord callback URI는 [Integration 문서](docs/integrations.md)를 참조합니다. Production 환경에는 강한 별도 `NEXTAUTH_SECRET`, HTTPS `NEXTAUTH_URL`, Discord credential 및 migration을 적용한 `DATABASE_URL`이 필요합니다. 실 secret은 저장소에 커밋하지 않습니다.

## 버전과 품질

Next.js 16.3.8, React 19.3.0, TypeScript 6.0.3 strict, Tailwind 4.3.3, Auth.js 안정 `next-auth` 4.24.15, Drizzle ORM 0.45.3, Vitest 5.0.3을 고정했습니다. 린트 parser의 지원 범위를 고려해 TypeScript 7 대신 6을 사용합니다. ESLint 10.12.0의 제거된 legacy rule API는 공식 `@eslint/compat` 2.1.1로 호환 처리합니다. 일부 Next 하위 플러그인의 peer 범위가 ESLint 10을 아직 명시하지 않아 install 시 advisory가 발생할 수 있으나 rule을 비활성화하지 않고 린트 검사를 통과합니다.

디자인 토큰은 Blueprint의 어두운 표면, 민트 primary, 2/4/6px radius를 따릅니다. Pretendard와 JetBrains Mono는 로컬 package에서 제공하므로 Google Fonts 접속이 필요하지 않습니다. 세부 로고는 Hero/Login에, compact는 작은 UI에 사용합니다. `support.js`와 `.dc.html`은 문서 디렉터리 안의 참고 원본이며 앱에서 import하거나 production dependency로 사용하지 않습니다.

초기 Foundation 검증은 [verification.md](docs/verification.md), 이번 실제 연동·운영 데이터 검증은 [verification-live-operations.md](docs/verification-live-operations.md)에 기록합니다. 구조, 관계, 확장 정책은 [architecture.md](docs/architecture.md), [database.md](docs/database.md), [build-lab.md](docs/build-lab.md)를 참조합니다.

## 다음 단계

[BUILD LAB DATA SPECIFICATION v0.1](docs/build-data-spec-v0.1.md)과 [Build Planner v1](docs/build-planner.md)을 구현했습니다. 21개 공식 근거 표본 중 개별 장비 12개만 참고 선택지로 사용하며 현재 적용은 모두 미확인입니다. 나머지는 직접 기록할 수 있습니다. [Planner 검증 기록](docs/verification-build-planner.md)을 남겼습니다. 다음 구현은 현재 패치 데이터 검증과 Static Stats → Damage Pipeline → Event-driven Simulator → Community Validation 순서입니다. 현재 임의 피해 공식이나 Simulator 이벤트는 없습니다. Discord 연결 값과 입력 방법은 [Discord 설정 안내](docs/discord-setup.md)를 확인합니다.

하이브 운영 등록 관리 화면을 구현했습니다. 실제 운영진은 [시즌 관리](http://127.0.0.1:3000/admin/seasons)에서 시나리오와 네 자리 번호로 시즌을 생성합니다. 해당 시나리오의 단계는 자동으로 구성되며 [SEASON](http://127.0.0.1:3000/season)에서 선택한 시즌 상세에 들어가 관리자가 이전·다음으로 진행합니다. 마지막 단계에서는 참가자가 HIVE 이동 신청·준비 상태를 등록합니다. [작전 관리](http://127.0.0.1:3000/admin/operations)에서 일정을 등록하며 모든 일정 입력은 한국 시간(KST), 저장은 UTC timestamptz입니다. 자세한 규칙은 [시즌 관리](docs/season-administration.md), [작전 관리](docs/operation-administration.md)를 참고합니다.
