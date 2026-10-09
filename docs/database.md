# Database Foundation

PostgreSQL과 Drizzle ORM을 사용한다. 인증·Hive 운영·빌드·커뮤니티·개인 설정을 위한 29개 테이블을 사용한다. 실제 승인 계정의 홈·시즌·운영 화면과 Build Planner는 DB를 읽고 서버 권한을 확인한 변경을 저장한다. 방문자·개발 계정의 운영 데모는 별도 Mock Provider를 사용하고 실제 DB를 변경하지 않는다.

## 주요 Entity와 관계

| 테이블                     | 역할과 주요 관계                                                     |
| -------------------------- | -------------------------------------------------------------------- |
| `users`                    | 로그인 주체, 서버가 승인한 Hive 역할; 현재 시즌·서버를 저장하지 않음 |
| `accounts`                 | OAuth identity; `users`와 연결; provider + provider account ID 유일  |
| `member_profiles`          | 닉네임·handle·소개·비공개 UID; 사용자당 하나의 프로필                |
| `member_profile_images`    | 사용자당 하나의 512px WebP 프로필 이미지, SHA-256 버전; 비공개 bytea |
| `user_preferences`         | 사용자당 하나의 화면·알림·지도·새 빌드 기본 공개 범위 설정           |
| `scenarios`                | Scenario 식별과 설명; slug 유일                                      |
| `servers`                  | Scenario에 속한 서버; Scenario + 서버명 유일                         |
| `seasons`                  | Hive 시즌 이력, Scenario와 서버, 시작·정산·투표 마감                 |
| `season_phases`            | 시즌별 가변 길이 Phase; 시즌 + 순서 유일                             |
| `season_memberships`       | 사용자와 시즌의 참가 이력 및 Migration 상태                          |
| `season_vote_candidates`   | 시즌의 다음 Scenario 후보                                            |
| `season_votes`             | 시즌 참가자의 단일 투표 선택                                         |
| `operations`               | 시즌별 또는 Hive 공통 일정                                           |
| `operation_roles`          | 일정 내 역할과 필요 인원                                             |
| `operation_participants`   | 사용자별 RSVP와 역할 배정                                            |
| `announcements`            | 작성자와 공개 시각이 있는 공지                                       |
| `integration_accounts`     | 선택적 Steam 등 외부 identity 연결; 장착 장비 API로 취급하지 않음    |
| `audit_logs`               | 역할 승인·운영 변경의 행위자와 대상 기록                             |
| `builds`                   | 빌드의 소유권·제목·가시성·보관 여부                                  |
| `build_versions`           | 빌드별 증가하는 버전과 불변 Loadout snapshot                         |
| `community_posts`          | 작성자·분류·본문과 숨김·보관 상태를 갖는 커뮤니티 글                 |
| `community_comments`       | 글에 연결된 댓글과 숨김·보관 상태                                    |
| `build_share_requests`     | 특정 버전의 제목·설명을 고정한 공유 신청, 관리자 승인·추천도         |
| `build_publications`       | 현재 공유 중인 승인 요청. 빌드마다 하나의 승인본                     |
| `content_images`           | 원본 비율·투명도를 유지한 1920px 이내 WebP, 최대 512KiB bytea        |
| `content_image_references` | 글 또는 불변 빌드 버전에 연결한 이미지. 본문에는 식별자만 저장       |
| `community_post_likes`     | 계정과 게시글별 하나의 좋아요                                        |
| `community_comment_likes`  | 계정과 댓글·대댓글별 하나의 좋아요                                   |
| `build_likes`              | 계정과 빌드별 하나의 좋아요                                          |

`0008_content_sharing_and_reactions.sql`은 본문 문서·유튜브 링크, 한 단계 답글, 이미지 참조와 공유 검토·추천도·좋아요를 추가한다. 댓글의 부모는 같은 글에 속해야 하며 SQL 트리거가 두 단계 답글과 순환 관계를 거절한다. 제출된 빌드 요청의 버전·제목·설명·공개 범위는 변경할 수 없고, 관리자는 검토 상태와 평가만 변경한다. 기존 공유 빌드는 최신 버전을 검토 대기로 옮기며 원본과 이전 버전은 보존한다.

외부 조회는 `build_publications`의 승인본을 기준으로 제목·설명·구성과 본문을 읽는다. 새 개인 초안을 저장해도 공유된 승인본은 유지된다. 명시적으로 공유를 중단하면 직접 주소·검색·홈·커뮤니티 연결·이미지 접근에도 반영된다. 과거에 승인한 버전의 고정 링크는 현재 공유 범위와 그 버전의 승인 범위를 모두 만족할 때만 유지된다.

`weapons`, `armor`, `mods`, `calibrations`, `cradles`, `deviants`, `consumables`, `effects`는 DB 스키마에 없다. 장비 자료는 빌드 엔진의 검증된 정적 카탈로그에서 읽는다.

## 시즌과 참가 모델

`User → SeasonMembership → Season`으로 참가 기록을 유지한다. 한 사용자는 여러 시즌 이력을 가진다. 시즌 하나당 같은 사용자의 참가 기록은 하나이며, 기존 시즌을 삭제하는 운영 기능은 제공하지 않는다. 핵심 이력의 foreign key는 `RESTRICT`를 사용한다. 개인정보 삭제가 필요하면 별도 정책과 익명화 migration을 먼저 설계해야 한다.

Phase는 행 단위 데이터이며 `phase_order > 0`과 시즌별 순서 유일성을 강제한다. 네 시나리오는 각각 3·5·4·6개 지정 단계를 자동 구성한다. `seasons.current_phase_order`는 관리자가 선택한 현재 순서이며 양수 제약과 기본값 1을 가진다. `Season.currentPhaseId`는 선택한 시즌과 저장된 순서로 읽기 모델에서 결정하여 다른 시즌 Phase를 참조하지 않는다. 신규 단계 날짜는 null이며 날짜가 지나도 진행 단계가 바뀌지 않는다. 시나리오 변경 후 남은 초과 단계 행과 과거 날짜는 보존하고 현재 단계 판단에서 제외한다.

Migration 상태는 `UNDECIDED`, `JOINING`, `PRE_REGISTERED`, `READY`, `MIGRATED`다. 준비율은 `READY + MIGRATED`를 현재 시즌 참가 인원으로 나누며, 인원이 0명이면 0%다. 상태 변경은 자기 참가 기록 또는 승인된 운영자의 서버 작업으로 제한해야 한다.

투표는 `(season_id, user_id)`가 유일하다. 선택 변경은 새 투표를 더하지 않고 기존 선택을 갱신한다. 복합 foreign key는 선택한 후보가 동일 시즌의 후보임을 강제하고, 참가 기록이 없는 사용자의 투표를 거부한다. 마감 시각 검증은 domain helper와 향후 서버 트랜잭션 경계에서 수행한다. 서버 도입 시 읽은 deadline과 DB 변경의 원자성을 보장해야 한다.

서버와 Scenario의 복합 foreign key는 서로 다른 Scenario의 서버를 시즌에 연결하지 못하게 한다. 일정 참가 역할도 복합 foreign key로 같은 Operation의 역할만 연결한다. RSVP 수용 인원 및 역할 합계 제한은 향후 서버 트랜잭션에서 처리한다.

## 식별자, 시간, 보안

모든 테이블은 PostgreSQL `gen_random_uuid()::text` 기본값의 문자열 PK와 `created_at`, `updated_at`을 사용한다. 시간은 `timestamptz`이며 애플리케이션에서 `Date`로 취급한다. Drizzle write의 `updatedAt`은 `$onUpdate`로 갱신된다. 직접 SQL로 수정할 경우 수정 시각을 함께 설정해야 한다. 유일성·복합 FK·조회 index를 schema와 migration에 정의한다.

OAuth Account는 Auth.js v4 필드 형태를 유지한다. 현재 인증은 JWT 세션을 사용하므로 별도 세션·verification token 테이블이 없다. Discord access/refresh token은 계정 바인딩을 포함한 AES-256-GCM 암호문으로 서버에 저장한다. 서버 가입의 긍정 확인은 동일 토큰 세대에서 최대 5분만 사용하며 역할은 매 요청과 저장 트랜잭션에서 DB로 재확인한다. 가입 승인 대상은 즉시 Discord를 확인한다. 토큰 갱신은 계정 잠금으로 직렬화한다. Audit metadata나 Integration metadata에 token 및 UID를 넣지 않는다.

Once Human UID는 `member_profiles.once_human_uid`에만 있으며 기본 공개 응답에서 제거한다. UI에는 `PublicMemberProfile`과 `toPublicMemberProfile()`을 사용한다. Role은 클라이언트 입력을 신뢰하지 않고 서버가 DB에서 읽는다.

`@uniz/db`는 `server-only`로 보호한다. `getDb()`는 호출할 때만 `DATABASE_URL`을 읽고 연결을 준비하므로 Mock 개발과 웹 빌드에 DB가 필요하지 않다. Client Component는 domain 타입과 안전한 서버 결과만 사용한다.

## Migration 운영

```powershell
pnpm db:generate
pnpm db:migrate
pnpm db:verify
```

프로젝트 루트의 `.env`에 로컬 PostgreSQL `DATABASE_URL`을 설정한다. `generate`는 DB 연결 없이 스키마에서 SQL과 snapshot을 만든다. `migrate`는 실제 PostgreSQL 접속과 write 권한이 필요하다. `.env`는 Git에 포함하지 않는다.

초기 migration은 `packages/db/migrations`에 체크인한다. 생성된 SQL은 적용 전에 검토한다. 기존 migration을 바꾸어 배포된 이력을 덮어쓰지 않고 새 migration을 추가한다. 초기 migration에는 `build_versions` 수정·삭제를 거부하는 PostgreSQL trigger를 추가하여 snapshot을 보존한다. 빌드는 `archived_at`으로 보관하며 새로운 버전은 새 행을 추가한다.

이 설계는 [Drizzle의 constraints/index 문서](https://orm.drizzle.team/docs/indexes-constraints)와 [Drizzle Kit migration 안내](https://orm.drizzle.team/docs/kit-overview)를 따른다.

## Build Planner 저장

2026-10-07의 Planner는 기존 `builds`·`build_versions`와 immutable trigger를 사용한다. 새 migration은 없다. 저장 시 사용자·Build 잠금과 현재 DB 역할·계정·프로필·소유권을 확인하고, 메타데이터 변경과 `max(version)+1` snapshot 삽입을 원자적으로 처리한다. `expectedUpdatedAt`과 단조 증가 시각으로 선행 변경을 감지한다. 공개 범위·보관·복원은 Build 메타데이터만 변경한다. 읽기는 repeatable-read에서 현재 역할과 공개 범위를 확인한다. [Planner 계약](build-planner.md), [검증 기록](verification-build-planner.md)을 참조한다.

## 로컬 PostgreSQL 검증 결과

2026-10-06에 별도의 UNIZ PostgreSQL 17 Docker 인스턴스에 초기 migration을 적용했다. 로컬 연결은 loopback의 `5433` 포트를 사용하여 기존 `5432` 서비스와 충돌하지 않는다. 실제 연결 정보는 Git에서 제외된 `.env`와 웹 개발용 `.env.local`에만 보관한다.

`pnpm db:migrate` 재실행이 성공하여 초기 migration의 중복 적용이 발생하지 않음을 확인했다. `pnpm db:verify`는 TCP 연결을 통해 21개 검증을 통과했다. 검증 범위는 다음과 같다.

- 18개 foundation 테이블과 필수 식별자·audit timestamp 컬럼
- 체크인된 migration SQL hash와 실제 Drizzle journal의 일치, migration당 단일 기록
- Scenario가 다른 서버 연결, 중복 Phase 순서, 중복 시즌 참가 거부
- Phase 9개 생성 허용: 6개 고정 제한 없음
- 다른 시즌 후보·참가 기록 없는 사용자·동일 사용자의 두 번째 투표 거부
- 기존 선택 변경 후 투표 한 건 유지
- 다른 Operation 역할 연결과 중복 RSVP 거부
- 대소문자만 다른 중복 member handle 거부
- 빌드 버전 추가 허용, 버전 번호 중복과 JSON object가 아닌 snapshot 거부
- BuildVersion UPDATE/DELETE의 immutable trigger 거부, Build 메타데이터 수정 후 snapshot 보존

검증 스크립트는 `packages/db/scripts/verify.mjs`다. 모든 임시 fixture를 하나의 트랜잭션 안에서 만들고, savepoint로 의도된 오류를 검사한 뒤 전체 트랜잭션을 rollback한다. 이후 fixture가 남지 않았음을 확인하며 영구 seed나 삭제·정리 작업을 수행하지 않는다. 연결 URL과 credential을 출력하지 않는다. 향후 migration을 추가하면 검증 스크립트의 foundation table 목록도 해당 단계에 맞춰 갱신한다.

실제 Discord OAuth·최초 관리자 등록·운영 데이터 변경은 검증을 완료했습니다. `0001_season_participation.sql`은 선택 정산일, 승인 상태·작성자·검토자와 참가자 제거 정보를 추가했습니다. `0002_manual_season_phases.sql`은 현재 단계 순서를 추가하고 기존 네 시나리오 시즌의 단계를 자동 보충합니다. 바뀐 명칭은 감사 기록으로 남기며 기존 단계 ID·날짜·참가 자료를 보존합니다. 시즌 번호는 시나리오별로 중복을 검사합니다. `pnpm db:verify`는 수동 단계 기본값·양수 제약과 삭제 후 투표 보존을 포함한 29개 검증을 통과했습니다. 실제 DB 검사는 자체 테스트 자료만 되돌리고 기존 계정과 이력을 보존합니다.
