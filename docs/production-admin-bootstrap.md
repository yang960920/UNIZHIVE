# 운영 환경의 첫 관리자 등록

현재 DB를 운영 환경으로 이관하면 기존 사용자·Discord 연결·ADMIN 역할을 그대로 유지합니다. 해당 경우 아래 초기 등록 명령을 실행하지 않습니다. 이미 관리자가 있거나 `admin.bootstrap` 기록이 있으면 명령도 변경을 거부합니다.

새 DB로 배포하는 경우에도 첫 가입자가 자동으로 관리자가 되지 않습니다. 선택한 운영자 본인이 배포된 사이트에서 같은 Discord 계정으로 로그인하고 프로필을 완료한 다음, 운영자가 정확한 Discord 사용자 ID를 지정해 최초 한 번 등록합니다. HTTP 가입 경로는 계속 `APPLICANT`로 시작합니다.

## 실행 준비

- 운영 사이트와 같은 `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `DISCORD_GUILD_ID`를 명령을 실행할 프로세스 환경에 직접 제공합니다. 비밀값은 저장소·명령 인수·문서에 넣지 않습니다.
- `DATABASE_URL`은 공개 DNS 호스트의 PostgreSQL 접속 주소여야 합니다. 이 도구는 `sslmode=verify-full` 한 가지 URL 옵션만 허용하고 인증서와 호스트 이름을 검증합니다. TLS 검증을 끄는 설정이나 로컬·사설 주소는 거부합니다.
- `NEXTAUTH_URL`은 실제 운영 사이트의 HTTPS 주소여야 합니다. `NEXTAUTH_SECRET`은 운영 사이트가 Discord 토큰 암호화에 사용하는 동일한 값이어야 합니다.
- 프로필을 완료한 뒤 다시 Discord 로그인하고 15분 이내에 확인합니다. `identify`와 `guilds.members.read` 동의 및 만료되지 않은 토큰이 필요합니다.
- Node.js에서 `--conditions=react-server`를 지정합니다. 기존 로컬 도구 `bootstrap-admin.mjs`의 운영 환경 거부 규칙은 그대로 유지합니다.

이 도구는 `.env`, `.env.local`을 자동으로 읽거나 기존 프로세스 설정을 덮어쓰지 않습니다. 실제 Discord 사용자 ID는 실행할 때 제공하며 소스에 고정하지 않습니다.

## 변경 없이 먼저 확인

저장소 루트에서 실행합니다. `<Discord-user-ID>`는 표시 이름·사용자 이름이 아닌 본인의 정확한 숫자 ID로 교체합니다.

```powershell
node --conditions=react-server apps/web/scripts/bootstrap-production-admin.mjs --production --discord-id <Discord-user-ID>
```

기본 동작은 dry-run입니다. 운영 DB·계정·프로필·최근 로그인·서버 가입을 확인하고 안전한 사용자 식별 정보와 `READY`를 출력합니다. 역할과 감사 기록은 변경하지 않습니다. 출력 계정이 지정한 운영자인지 확인한 후, 실제 변경을 승인한 운영자가 같은 명령에 `--apply`를 추가합니다.

```powershell
node --conditions=react-server apps/web/scripts/bootstrap-production-admin.mjs --production --discord-id <Discord-user-ID> --apply
```

성공하면 `APPLIED`를 출력합니다. DB 공유 잠금 `912743110` 안에서 기존 관리자·초기 등록 기록을 다시 확인하고, 지정 계정의 역할 변경과 `admin.bootstrap` 감사 기록을 함께 저장합니다. 닉네임이나 가입 순서로 계정을 선택하지 않습니다.

## 결과와 제한

| 결과                                  | 다음 단계                                                          |
| ------------------------------------- | ------------------------------------------------------------------ |
| `READY`                               | 선택한 계정이 맞는지 확인한 후 승인된 실제 변경에만 `--apply` 사용 |
| `APPLIED`                             | 운영 사이트에서 다시 로그인해 관리자 화면 확인                     |
| `ALREADY_INITIALIZED`                 | 기존 관리자와 역할을 유지하고 초기 등록 중단                       |
| `LOGIN_AND_PROFILE_REQUIRED`          | 지정 Discord 계정으로 운영 사이트 로그인·프로필 완료               |
| `COMPLETE_PROFILE_AND_LOGIN_REQUIRED` | 프로필 완료 및 보류된 가입 상태 확인 후 다시 로그인                |
| `FRESH_DISCORD_LOGIN_REQUIRED`        | 운영 사이트에서 Discord 재로그인 및 동의 범위 확인                 |
| `DISCORD_MEMBERSHIP_NOT_CONFIRMED`    | 설정된 Discord 서버의 가입·규칙 동의와 연결 확인                   |

관리자가 사라졌더라도 이전 초기 등록 기록이 있으면 이 도구로 재승격하지 않습니다. 별도 관리자 복구 절차로 처리합니다. 접속 실패·설정 오류의 원본 진단에는 비밀값이 포함될 수 있으므로 도구는 연결 문자열·OAuth 토큰·게임 UID·비밀값을 출력하지 않습니다.

이 문서는 운영 배포 준비 절차입니다. 현재 로컬 관리자 계정을 변경하거나 운영 DB에서 명령을 실행한 기록이 아닙니다.
