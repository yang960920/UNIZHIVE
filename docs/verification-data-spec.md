# PostgreSQL + Data Specification v0.1 검증

검증일: 2026-10-06. Foundation 완료 후 사용자가 Docker 연결 및 다음 Data Specification Phase를 요청하여 진행한 후속 결과입니다.

## 실제 PostgreSQL 연결

- Docker Desktop 정상 실행을 확인했습니다.
- 기존 다른 프로젝트의 5432 서비스를 유지하고 UNIZ 전용 PostgreSQL을 loopback 5433에 생성했습니다.
- DB `uniz_hive`, PostgreSQL 17.11, 컨테이너 healthy 상태입니다.
- 루트 `.env`와 웹 `.env.local`의 DB 설정을 일치시켰습니다. 기존 세션 키와 다른 설정은 보존했고 두 파일 모두 Git 제외를 확인했습니다.
- 초기 migration 적용 성공, 재실행 성공, public schema의 application table 18개 및 단일 Drizzle journal 기록을 확인했습니다.
- `pnpm db:verify`: **21개 PASS**. 복합 FK, 유일성, 가변 Phase9개, 투표 변경, BuildVersion immutable trigger를 실제 TCP 연결로 검사했습니다.
- 임시 fixture는 transaction rollback했으며 영구 seed나 다른 프로젝트 데이터 변경은 없습니다.

DB 상세 검증 범위는 [database.md](database.md)에 있습니다. 실제 Discord OAuth는 아직 credential이 없어 검증하지 않았습니다.

## Data Specification v0.1

| 항목                           | 결과                                                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 요청 영역                      | Weapon, Armor, Mods, Calibration, Cradle Override, Deviation, Ammo, Food, Drink, Effect, Target Profile, Benchmark Profile의 12개 계약 |
| 공식 출처                      | 24개 URL                                                                                                                               |
| 역사적 표본                    | 21개: 장비11, 효과7, 대상3                                                                                                             |
| 필드                           | 117개: OFFICIAL76, UNVERIFIED41                                                                                                        |
| COMMUNITY VERIFIED / ESTIMATED | 실제 승인 자료 없음, 임의 수치 생성 없음                                                                                               |
| 현재 적용 상태                 | 모든 표본 UNVERIFIED                                                                                                                   |
| Benchmark                      | 재현성 프로토콜만 정의, 실제 측정 표본 없음                                                                                            |

`pnpm data:verify`는 세 catalog를 모두 통과했습니다. 확인되지 않은 값은 null로 유지하며, 공개 표시값의 단위가 없는 경우 UNSPECIFIED를 보존합니다. 공식 자료의 과거 숫자를 현재 계산 기본값으로 사용하지 않습니다.

## 최종 품질 검사

| 명령/검사                   | 결과                                 |
| --------------------------- | ------------------------------------ |
| `pnpm install`              | PASS                                 |
| `pnpm typecheck`            | PASS, 전체 workspace                 |
| 최종 build-engine typecheck | PASS, 마지막 validator 수정 포함     |
| `pnpm lint`                 | PASS                                 |
| `pnpm test`                 | PASS, 5개 파일 / 42개 테스트         |
| `pnpm build`                | PASS, 전체 route 요청 시 서버 렌더링 |
| `pnpm format:check`         | PASS                                 |
| `pnpm db:verify`            | PASS, 21개                           |
| `pnpm data:verify`          | PASS, 21개 표본                      |
| 개발 HOME / SEASON          | HTTP200, 각 화면 본문 표시           |

Data Specification 테스트 13개는 기존 29개에 추가됩니다. unknown을 공식 값으로 올리는 오류, 누락/중복 source, 수치와 단위 불일치, 뒤집힌 범위, 문자열/boolean을 numeric stat으로 사용하는 오류, 분수 COUNT/LEVEL, 미래 확인일, Steam UGC/다른 게임 공지의 OFFICIAL 처리, 이름 근거와 중복 필드를 검사합니다. 실제 근거 파일도 같은 검증기를 통과합니다.

읽기 전용 독립 검토에서 공식 출처의 표본 수치와 적용 맥락을 확인했습니다. 검토에서 발견한 단위 타입, Steam 출처 경로, 미래 기준일, 정수 count 문제를 보완했습니다. 구조 검증이 원문 사실성이나 현재 패치 적용을 자동으로 인증한다고 주장하지 않습니다.

## 범위와 남은 작업

게임 데이터 DB 테이블, Planner, Stat Aggregation, Damage Formula, Simulator, Community CRUD, Discord Bot을 추가하지 않았습니다. 기존18개 DB 테이블 및 BuildVersion 저장 정책은 유지했습니다. Dashboard 운영 데이터도 기존 MOCK 경계를 유지합니다.

실제 Discord 설정은 [discord-setup.md](discord-setup.md)에 정리했습니다. OAuth Client ID, Client Secret, UNIZ Guild ID를 설정하고 redirect URI를 등록해야 합니다. Client Secret은 로컬 Git 제외 파일에 입력합니다. 현재 승인 CRUD와 Guild 탈퇴 후 자동 권한 갱신은 후속 작업입니다.

다음 계산 단계 전에 현재 패치의 전체 기초 스탯과 modifier/effect/target 규칙, stacking/rounding/시간 경계 및 재현 가능한 측정을 추가 확인해야 합니다. 이번 요청에서는 [Data Specification v0.1](build-data-spec-v0.1.md)까지 완료했습니다.
