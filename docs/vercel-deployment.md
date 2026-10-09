# Vercel 1차 배포

2026-10-10 기준. 저장소: https://github.com/yang960920/UNIZHIVE

## 1. Vercel에 GitHub 저장소 연결

1. Vercel에서 **Add New → Project**를 선택한다.
2. `yang960920/UNIZHIVE`를 Import한다.
3. Application Preset이 `Services`로 표시되면 `apps/web` 아래 `web`의 **Import single project**를 선택한다.
4. 아래 설정을 적용한다.

| 설정                                               | 값                       |
| -------------------------------------------------- | ------------------------ |
| Framework Preset                                   | Next.js                  |
| Root Directory                                     | `apps/web`               |
| Include source files outside of the Root Directory | 켜기                     |
| Node.js Version                                    | `24.x`                   |
| Build Command                                      | `pnpm build`             |
| Install Command                                    | 자동 감지, Override 끄기 |
| Output Directory                                   | 자동 감지, Override 끄기 |
| Production Branch                                  | `main`                   |

이 저장소는 `apps/web`이 공통 `packages/*`를 사용하는 pnpm workspace이다. 루트 밖 소스 포함 설정이 필요하다. Corepack으로 `package.json`의 `pnpm@11.25.0` 고정 버전을 사용한다. 첫 배포 로그에서 설치 버전과 Next.js 빌드 완료를 확인한다.

## 2. 환경 변수 등록과 프로젝트 생성

프로젝트 생성 화면에서 가져오기용 `.env`의 7개 항목을 등록하고 프로젝트를 먼저 생성한다. DB 연결 문자열은 생성 후 DB를 연동하여 추가하고, `NEXTAUTH_URL`은 배포 주소가 정해지면 입력한다. 인증 비밀이나 DB 연결 문자열은 소스에 입력하지 않는다. 운영 설정의 적용 대상은 Production으로 선택한다.

| 이름                               | 값과 용도                                                         |
| ---------------------------------- | ----------------------------------------------------------------- |
| `ENABLE_EXPERIMENTAL_COREPACK`     | `1`, 고정한 pnpm 버전 사용                                        |
| `DATABASE_URL` 또는 `POSTGRES_URL` | 프로젝트 생성 후 DB 연동으로 추가되는 운영 PostgreSQL 연결 문자열 |
| `NEXTAUTH_URL`                     | 실제 운영 사이트의 HTTPS 주소                                     |
| `NEXTAUTH_SECRET`                  | 최소 32자 이상의 운영 전용 무작위 Secret                          |
| `DISCORD_CLIENT_ID`                | 현재 사용하는 Discord OAuth 애플리케이션 ID                       |
| `DISCORD_CLIENT_SECRET`            | 해당 애플리케이션의 Secret                                        |
| `DISCORD_GUILD_ID`                 | UNIZ Discord 서버 ID                                              |
| `MOCK_AUTH`                        | `false`                                                           |
| `GAME_INFO_EXAMPLES`               | `single`, 게임 정보 작성 예시 하나 표시. `off`로 숨길 수 있음     |

현재 웹 로그인·가입 확인은 Discord OAuth의 `identify`, `guilds.members.read`를 사용한다. 웹 실행에 Discord Bot Token은 필요하지 않다. Steam 공식 뉴스와 접속자 조회도 API Key 없이 동작한다.

운영 Secret은 DB의 Discord 토큰 암호화에도 사용한다. 기존 DB를 새 Secret으로 이관하면 기존 계정은 재로그인하여 토큰을 갱신해야 하며, 저장된 관리자 역할·프로필·게시글은 유지된다. 동일 Secret을 유지하는 경우에도 운영 환경 변수로만 등록한다.

Preview에는 운영 DB와 인증 비밀을 자동으로 복사하지 않는다. 실제 로그인 테스트가 필요한 Preview는 별도 DB·주소·Discord 콜백을 구성한다.

현재 소스는 DB 연결 전에도 빌드할 수 있도록 DB 클라이언트 생성을 요청 시점까지 미룬다. DB 연결 전에는 Discord 로그인과 DB를 사용하는 기능을 최종 검증할 수 없다.

## 3. 운영 DB 연결과 기존 데이터 이관

생성된 프로젝트의 Storage 또는 Marketplace에서 PostgreSQL을 연결한다. Vercel DB 연동은 연결 정보를 환경 변수로 자동 등록할 수 있다. 웹 앱은 `DATABASE_URL`을 우선 사용하고, 없거나 비어 있으면 Supabase 연동의 `POSTGRES_URL`을 자동으로 사용한다. 로그인 준비 상태·실제 DB 연결·멤버 확인·검색에서 동일한 선택 기준을 적용한다. 임의 접두사가 붙은 다른 이름은 지원하지 않는다.

DB 연결 후에는 최신 Production 배포를 다시 실행해야 추가된 환경 변수가 실제 웹에 반영된다. `/api/auth/providers`에서 Discord 제공자가 나타나면 로그인 설정을 읽은 것이며, 이 응답만으로 DB 연결·테이블·Discord 인증 완료까지 검증된 것은 아니다.

현재 개발 DB는 사용자 PC의 PostgreSQL이다. Vercel에서 이 로컬 주소에 연결할 수 없으므로 외부 PostgreSQL이 필요하다. 운영 웹에는 풀링 연결 문자열을 사용하고, DB와 Vercel Function을 가까운 지역에 둔다. 웹 Function은 `apps/web/vercel.json`에서 서울 `icn1`로 설정했다.

DB 연동으로 연결 주소가 등록되어도 앱의 테이블이나 현재 계정·게시글이 자동 이관되지는 않는다. 현재 데이터를 이관하면 계정·관리자 권한·프로필 이미지·시즌·실제 게시글·빌드 버전도 함께 보존한다. DB 백업 파일은 GitHub에 포함하지 않는다. 이관은 운영 DB가 정해진 뒤 별도 백업과 복원 검증을 수행한다.

빈 DB로 시작하면 먼저 현재 `packages/db/migrations`를 적용하고 Discord 로그인·프로필 등록을 마친 지정 계정에 최초 관리자 권한을 부여한다. 운영 DB의 migration은 배포 빌드마다 자동 실행하지 않는다. `pnpm db:migrate`와 관리자 초기 설정 등 운영 도구에는 작업 대상을 명확히 지정하도록 `DATABASE_URL`을 따로 설정한다. Supabase에서는 해당 작업에 맞는 직접 연결 또는 세션 풀러 주소를 사용한다. 로컬 환경을 그대로 둔 상태에서 명령을 실행하면 로컬 DB가 대상이므로 대상 확인이 필요하다.

DB 연결과 데이터 준비를 마친 뒤 새 배포를 실행한다.

Supabase의 Data API는 이 앱의 NextAuth 세션과 별도로 동작한다. 앱 테이블과 migration journal에는 RLS를 켜고, `PUBLIC`·`anon`·`authenticated`·`service_role`의 테이블 및 앱 함수 접근 권한을 제거한다. 직접 PostgreSQL 연결의 테이블 소유 역할은 기존 서버 권한 검사를 사용한다. 이후 migration으로 객체를 추가하면 새 객체에도 같은 보호를 적용한다.

SQL 관리 화면에서 백업을 복원할 경우 dump의 psql 전용 지시문과 기존 `public` 스키마 생성문을 처리하고, 임시 설정은 `SET LOCAL`과 `set_config(..., true)`로 트랜잭션 안에 한정한다. 공유 풀러에서 세션의 `search_path`를 빈 값으로 남기면 테이블이 있어도 웹의 쿼리가 실패할 수 있다. 복원 후 전체 행 수·이미지·migration hash·관리자 역할을 확인하고, 실제 Discord 로그인과 관리자 화면 접근까지 검증한다.

## 4. 배포 주소와 Discord 콜백

배포 주소가 확정되면 Discord Developer Portal → 해당 Application → OAuth2 → Redirects에 다음 주소를 등록한다.

```text
https://실제-배포-주소/api/auth/callback/discord
```

`NEXTAUTH_URL`도 같은 사이트의 HTTPS 주소로 설정하고 Redeploy한다. 로컬 콜백은 계속 개발에 사용할 경우 유지할 수 있다. 커스텀 도메인을 추가할 때는 새 주소의 콜백과 `NEXTAUTH_URL`을 함께 갱신한다.

## 5. 최초 관리자

가입 순서는 관리자 선정 기준이 아니다. 운영자가 지정한 정확한 Discord 고유 ID를 기준으로 한다.

- 기존 DB 이관: 현재 관리자 역할을 그대로 유지하고 같은 Discord 계정으로 로그인한다.
- 빈 DB: 지정 계정의 로그인과 프로필 등록 후 [운영 최초 관리자 설정](production-admin-bootstrap.md)을 따른다. 설정 도구는 기본 확인 모드이며, 명시적인 적용 옵션과 현재 서버 가입 확인을 요구한다.

사용자 이름·표시 이름은 변경할 수 있어 권한 기준으로 사용하지 않는다. 실제 고유 ID·인증 비밀은 저장소에 하드코딩하지 않는다. 이미 관리자 또는 최초 관리자 설정 기록이 존재하면 초기 설정을 다시 실행할 수 없다.

## 6. 배포 확인

홈·한국어 Steam 소식·지도를 먼저 확인하고, 지정 Discord 계정 로그인, 관리자 메뉴, 프로필 저장, 이미지 업로드, 빌드 저장·재조회, 파티·커뮤니티 권한을 확인한다. 사이트 주소·시각·업로드 실패 로그를 함께 확인한다.

Vercel Function의 요청·응답 크기는 4.5MB 제한이다. 이 프로젝트의 프로필·본문 원본 파일 업로드는 4MiB로 제한하고, 정규화된 작은 이미지와 투명도를 유지한다. 이미지 바이트는 PostgreSQL에 저장하므로 배포 인스턴스의 임시 파일 시스템에 의존하지 않는다.

로컬 테스트·타입 검사·빌드 통과는 원격 환경에서의 DB·Discord 연결 성공을 보증하지 않는다. 운영 DB와 실제 배포 주소가 준비된 뒤 연결 기능을 최종 확인한다.

## 공식 설정 자료

- [Vercel 모노레포 설정](https://vercel.com/docs/monorepos/monorepo-faq)
- [Vercel PostgreSQL 연동](https://vercel.com/docs/postgres)
- [Supabase Data API 보호](https://supabase.com/docs/guides/api/securing-your-api)
- [패키지 관리자와 Corepack](https://vercel.com/docs/package-managers)
- [빌드 환경 설정](https://vercel.com/docs/builds/configure-a-build)
- [Node.js 버전](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Function 지역 설정](https://vercel.com/docs/functions/configuring-functions/region)
- [Function 크기 제한](https://vercel.com/docs/functions/limitations)
