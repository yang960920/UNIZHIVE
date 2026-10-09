# Discord 로그인 연결 정보

현재 로그인과 UNIZ 서버 가입 확인에는 아래 3개 값만 Discord에서 가져오면 됩니다.

| 환경 변수               | 가져오는 위치                                                          |
| ----------------------- | ---------------------------------------------------------------------- |
| `DISCORD_CLIENT_ID`     | Developer Portal → 애플리케이션 → General Information → Application ID |
| `DISCORD_CLIENT_SECRET` | 같은 애플리케이션 → OAuth2 → Client Secret                             |
| `DISCORD_GUILD_ID`      | Discord 개발자 모드 활성화 → UNIZ 서버 아이콘 우클릭 → Copy Server ID  |

Application ID와 Client ID는 같은 값입니다. 서버 ID는 초대 링크가 아니라 숫자 ID입니다. [공식 ID 안내](https://support-dev.discord.com/hc/en-us/articles/360028717192-Where-can-I-find-my-Application-Team-Server-ID), [Server ID 복사](https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID)

Client Secret이 ‘보안을 위해 숨김’으로 보이면 OAuth2의 ‘비밀 키 초기화’에서 새 비밀키를 발급받아 로컬 파일에 입력합니다. 초기화는 기존 키를 교체합니다. ‘공개 클라이언트’는 꺼둡니다. 현재 로컬 설정은 입력 및 실제 로그인을 완료했으며 `pnpm auth:verify`로 비밀값을 출력하지 않고 애플리케이션 인증과 로그인 Provider를 확인할 수 있습니다.

OAuth2 → Redirects에는 아래 주소를 정확히 등록합니다. 이 로컬 환경에서는 `localhost` 대신 `127.0.0.1`을 일관되게 사용합니다.

```text
http://127.0.0.1:3000/api/auth/callback/discord
```

현재 코드는 `identify guilds.members.read` scope를 요청합니다. OAuth 토큰으로 로그인한 사용자의 UNIZ 서버 가입 여부를 확인합니다. **Bot Token, 봇 초대, Channel ID, Discord Role ID는 이 로그인에 필요하지 않습니다.** [OAuth2 공식 문서](https://docs.discord.com/developers/topics/oauth2), [Current User Guild Member API](https://docs.discord.com/developers/resources/user#get-current-user-guild-member)

2026-10-07 Chrome 재로그인의 `OAuthCallback` 오류를 수정했다. Discord가 callback query에 `iss`를 반환할 때 NextAuth4의 기본 Discord Provider에 issuer가 없어 설치된 openid-client가 인증 코드 교환 전에 거절했다. [공식 발급자 메타데이터](https://discord.com/.well-known/openid-configuration)에 명시된 `https://discord.com`을 Provider에 설정했다. 기존 scope·state cookie 검사·프로필 API·Guild 확인·승인 역할은 유지한다. 잘못된 issuer나 state를 우회하는 처리는 없다. Client ID/Secret 변경이나 서버 재시작은 필요하지 않았다.

기존 승인 계정도 `Discord로 계속하기`로 다시 로그인한다. Discord의 승인은 사이트 로그인에 필요한 접근 동의이며, 같은 Discord ID의 기존 하이브 승인·프로필·관리자 역할을 다시 생성하지 않는다. 현행 로그인은 프로필 화면으로 이동하므로 등록된 값이 보이면 HOME으로 이동해 사용할 수 있다. Chrome에서 실제 기존 계정의 Discord 동의→callback→프로필→HOME→관리 콘솔 접근을 확인했고, native NextAuth/OpenID client 회귀8개는 잘못된 발급자·state·누락된 signed state cookie를 교환 전에 거절하는 것도 검증한다. 화면에 남은 계정 이름만으로 보호 기능의 인증 성공을 판단하지 않는다.

Client ID와 Guild ID는 전달해도 됩니다. **Client Secret은 채팅에 보내지 않고 `apps/web/.env.local`에 직접 입력합니다.** 해당 파일은 Git에서 제외되고 `NEXT_PUBLIC_` 변수를 사용하지 않습니다. 다른 기존 설정과 개발 인증 키는 보존합니다.

```dotenv
DISCORD_CLIENT_ID=<Application ID>
DISCORD_CLIENT_SECRET=<OAuth Client Secret>
DISCORD_GUILD_ID=<UNIZ Server ID>
```

DB 연결은 `127.0.0.1:5433`의 UNIZ 전용 PostgreSQL에 설정했습니다. NEXTAUTH_URL은 `http://127.0.0.1:3000`이고 세션용 NEXTAUTH_SECRET도 로컬에 준비되어 있습니다. 위 값을 입력한 뒤 개발 서버를 재시작하면 Discord 로그인 버튼이 활성화됩니다.

실제 로그인 검증은 UNIZ 서버에 가입한 본인 Discord 계정으로 진행합니다. 첫 실제 계정은 APPLICANT로 생성되며 Onboarding에서 닉네임·비공개 UID를 입력합니다. 프로필 주소는 `hyunjun` → `/members/hyunjun`처럼 개인 페이지에 사용하는 공개 이름입니다. 운영진은 `/admin/members`에서 신청을 승인합니다. Discord Role을 ADMIN으로 자동 변환하지 않습니다.

최초 관리자 등록은 사용자가 명시적으로 지정한 Discord 사용자 ID를 대상으로 로컬에서 한 번만 실행합니다. 이미 로그인하고 프로필을 등록한 계정의 서버 가입을 다시 확인하며, 기존 관리자 또는 bootstrap 기록이 있으면 거부합니다. 현재 설치는 최초 관리자 등록을 완료했습니다. 다른 새 설치에서 먼저 확인한 뒤 적용하는 명령은 다음과 같습니다.

```powershell
pnpm admin:bootstrap --discord-id <본인이 지정한 Discord 사용자 ID>
pnpm admin:bootstrap --discord-id <본인이 지정한 Discord 사용자 ID> --apply
```

가입 승인·보류·승인 취소·권한 변경과 비공개 프로필 처리에 관한 상세 정책은 [member-approval.md](member-approval.md), 서버 탈퇴와 토큰 갱신 정책은 [discord-session-policy.md](discord-session-policy.md)에 기록했습니다.

배포할 때는 HTTPS 서비스 주소와 `<서비스 주소>/api/auth/callback/discord`를 별도로 등록하고 Production secret을 설정합니다. 개발 Mock Auth는 Production에서 거부됩니다. Bot Token은 향후 Bot/서버 전체 연동을 진행할 때만 필요합니다.
