# Foundation Verification

검증일: 2026-10-06, Windows / PowerShell. 구현 범위는 PHASE 0 FOUNDATION, HIVE CORE FOUNDATION, HOME Dashboard, SEASON Hub입니다.

## 실행 환경과 자동 검사

Node.js 24.14.0, pnpm 11.19.0에서 실제 설치와 실행을 확인했습니다. 최종 소스 기준 결과입니다.

| 검사                      | 결과      | 확인한 내용                                                            |
| ------------------------- | --------- | ---------------------------------------------------------------------- |
| `pnpm install`            | PASS      | Workspace 및 고정된 lockfile 설치                                      |
| `pnpm typecheck`          | PASS      | web, bot, domain, db, integrations, build-engine, ui strict TypeScript |
| `pnpm lint`               | PASS      | Next/React/TypeScript 규칙 유지, ESLint 공식 compatibility 처리        |
| `pnpm format:check`       | PASS      | 원본 Blueprint/runtime/이미지는 formatting 대상에서 제외               |
| `pnpm test`               | PASS      | 4개 파일, 29개 테스트                                                  |
| `pnpm build`              | PASS      | Next.js Production 빌드, 모든 App Router 화면 요청 시 서버 렌더링      |
| `pnpm db:generate`        | PASS      | 18개 테이블, 기존 migration snapshot과 변경 없음                       |
| PostgreSQL migration 적용 | 후속 PASS | 후속 Docker 연결 완료: loopback5433 적용, db:verify21개 PASS           |

테스트는 가변 Phase 선택, 이동 준비율과 0명 처리, 투표 변경/중복/마감, 중앙 권한 정책, TH.GL URL 검증, 개발 인증 whitelist와 Production Mock 차단을 다룹니다. UI와 같은 값을 다시 계산하는 테스트 대신 주요 도메인 규칙과 접근 경계를 검사합니다.

## 개발 서버와 인증

`pnpm dev`로 `http://127.0.0.1:3000`을 실행했습니다. Member(Kiri), Officer(Moss), Admin(Yun) 개발 identity의 로그인/로그아웃과 서버 권한을 HTTP 세션 및 화면에서 확인했습니다.

- Member가 client role을 ADMIN으로 바꾸어 제출해도 MEMBER로 유지됩니다.
- 알려지지 않은 개발 identity는 인증되지 않습니다.
- Member는 멤버 목록을 열 수 있지만 Admin 화면에는 접근할 수 없습니다.
- Officer는 허용된 Admin 영역을 열 수 있으며 Integration 관리는 거부됩니다.
- Admin은 Integration 관리 shell을 열 수 있습니다.
- 로그아웃 및 비로그인 요청은 보호 화면에서 로그인으로 이동합니다. 보호된 Admin 본문을 반환하지 않습니다.
- Next.js의 streaming redirect는 응답이 200일 수 있으므로 상태 코드뿐 아니라 redirect marker와 보호 본문 부재를 검사했습니다.

개발 세션용 무작위 키는 Git에 제외된 `.env.local`에만 생성했습니다. 실제 Discord/Steam/DB credential은 없습니다. UID는 공개 profile/session과 Mock 저장소에서 제외합니다.

## Production 실행 확인

최종 빌드를 별도 `127.0.0.1:3001`에서 잠시 실행하고 검증 후 해당 Production 프로세스만 종료했습니다. 개발 서버 3000은 유지했습니다.

- HOME / SEASON: 200, 해당 화면 본문 정상 표시.
- Login: 개발 identity 버튼과 ID가 없음.
- 비로그인 Admin / Admin Integrations: 로그인 redirect, 보호 본문 없음.
- Credential 없는 Auth API: 설정되지 않은 서비스로 503 응답.
- `development` callback에 `demo-admin`을 제출해도 503이며 세션 cookie를 생성하지 않음.
- `MOCK_AUTH=true`의 Production 거부와 개발 세션 marker 재사용 차단은 별도 단위 테스트로 확인.

## 브라우저와 상호작용

Codex In-app Browser에서 실제 페이지와 responsive viewport를 확인했습니다.

| 화면        | 1440px | 1024px | 390px |
| ----------- | ------ | ------ | ----- |
| HOME        | 정상   | 정상   | 정상  |
| SEASON      | 정상   | 정상   | 정상  |
| 가로 넘침   | 없음   | 없음   | 없음  |
| 깨진 이미지 | 없음   | 없음   | 없음  |

Pretendard 본문과 JetBrains Mono 수치 폰트의 실제 적용을 확인했습니다. Dark theme, 상태 텍스트/아이콘, 키보드 포커스, reduced-motion 처리 및 모바일 버튼 크기를 확인했습니다. 이 기록은 전체 WCAG 인증을 의미하지 않습니다.

- RSVP Going → Maybe: 참가 인원 14 → 13, 선택 상태 반영.
- 이동 상태 PRE_REGISTERED → READY: 준비 인원 23 → 24, HOME과 SEASON 모두 77% 반영.
- Isles 투표 후 Winter로 변경: 기존 후보 표가 감소하고 새 후보 표가 증가하며 1인 1표 유지.
- 새로고침과 HOME ↔ SEASON 이동 후 선택과 집계 유지.
- MORE drawer: 추가 메뉴 정상 표시, Member에게 Admin 메뉴 없음.
- Ctrl+K 검색: dialog 열림, `시즌` 검색 시 시즌 허브만 표시.
- 공지: 상세 dialog 표시, Escape로 닫힘.
- Dialog/Drawer: Escape 및 닫기 버튼 동작, focus trap 적용.

최종 화면은 로컬 `artifacts/screenshots/`에 저장했습니다. 아래 화면에는 검증 과정에서 변경한 Kiri의 데모 선택이 반영됩니다. 스크린샷은 Git 제외 대상입니다.

- [HOME Desktop](../artifacts/screenshots/home-desktop.jpg)
- [SEASON Desktop](../artifacts/screenshots/season-desktop.jpg)
- [HOME Mobile](../artifacts/screenshots/home-mobile.jpg)
- [SEASON Mobile](../artifacts/screenshots/season-mobile.jpg)

## 원본 보존과 범위 확인

다운로드 원본 로고 5종과 `assets/brand`, `apps/web/public/brand` 복사본의 SHA-256이 일치합니다. Blueprint 및 support.js 문서 복사본도 원본과 일치합니다. 원본 사용자 파일은 변경하지 않았습니다.

앱과 package에서 support.js 또는 dc runtime을 참조하지 않습니다. domain/build-engine은 Next.js/React/UI에 의존하지 않습니다. Integration server entry point는 server-only 경계로 보호됩니다. Client build에서 secret/비공개 UID 필드 참조를 확인하지 못했습니다.

게임 장비 테이블, 임의 Damage Formula, Simulator 이벤트, Community CRUD, Bot 실행은 구현하지 않았습니다. Steam 동접 adapter의 공식 endpoint는 확인했지만 Dashboard는 미연결 `—`를 표시합니다. TH.GL은 공식 embed URL이 설정되기 전까지 안전한 shell을 표시합니다.

## 남은 확인

후속 요청으로 실제 PostgreSQL migration과 DB 제약 검증을 완료하고 Build Lab Data Specification v0.1을 작성했습니다. 상세 결과는 [후속 검증](verification-data-spec.md)에 있습니다. Discord OAuth/guild membership과 Onboarding은 credential이 준비된 staging에서 검증해야 합니다. 운영 데이터 provider, 승인 CRUD, guild 탈퇴 후 권한 갱신은 후속 구현 범위입니다.
