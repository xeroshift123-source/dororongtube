# 도로롱튜브

단일 방에서 YouTube 라이브를 함께 보고 대화하는 React + TypeScript MVP입니다. 프런트엔드는 Vite·Tailwind CSS, 인증/DB/Realtime은 Supabase, 배포 대상은 Vercel입니다.

## 실행

Node.js 22.12 이상을 사용합니다.

```powershell
npm ci
Copy-Item .env.example .env.local
# .env.local에 본인 Supabase 프로젝트 URL과 Publishable Key(또는 legacy anon key) 입력
npm run dev
```

환경 변수가 없으면 연결 준비 안내 화면이 나옵니다. 가짜 계정이나 가짜 방송을 실제 서비스처럼 표시하지 않습니다. Service Role / Secret Key는 프런트엔드에 넣지 마세요.

## Supabase 초기 설정 (수동)

1. Supabase 프로젝트를 생성합니다. SQL Editor에서 `supabase/migrations/202610120001_room.sql`, `supabase/migrations/202610120002_profile_settings.sql`, `supabase/migrations/202610120003_chat_cooldown.sql`, `supabase/migrations/202610120004_disable_room_throttle.sql`, `supabase/migrations/202610120005_clear_chat.sql`, `supabase/migrations/202610120006_clear_chat_where.sql`을 순서대로 각각 한 번 실행합니다. 기존 DB를 변경할 경우 먼저 스테이징에서 검증합니다.
2. Authentication 설정에서 **Anonymous Sign-Ins**를 활성화합니다. 이메일/비밀번호 로그인은 운영자용으로 사용합니다. 일반 사용자 이메일 가입은 운영상 필요하지 않으면 비활성화합니다.
3. Realtime Settings에서 **Allow public access를 끕니다.** 모든 채널이 private이며, 브라우저의 Broadcast 전송 권한은 없습니다. SQL 정책을 적용한 뒤 실제 두 브라우저에서 채팅과 Presence를 확인합니다.
4. Authentication의 Users에서 운영자 이메일 계정을 생성·확인하고, 그 **실제 UUID**를 SQL Editor에서 다음 문장에 넣습니다. 임의 UUID로 대체하지 않습니다.

   ```sql
   insert into public.admin_users(user_id) values ('운영자-실제-UUID');
   ```

5. Project Settings의 API URL과 Publishable Key를 `.env.local`의 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`에 설정합니다. 변수 이름은 legacy anon key와 publishable key 모두를 지원합니다.
6. 프로덕션에서는 Supabase Auth에 CAPTCHA를 켜고 Cloudflare Turnstile의 Secret Key를 **Supabase Dashboard**에 등록합니다. 프런트엔드에는 공개 Site Key만 `VITE_TURNSTILE_SITE_KEY`로 넣습니다. Turnstile 허용 호스트에 로컬/실서비스 호스트를 등록합니다. CAPTCHA를 켜고 Site Key를 누락하면 신규 입장이 실패합니다.
7. `/admin`에서 운영자 로그인 → 홈에서 닉네임 입장 → `/admin`에서 라이브 URL/제목 등록 및 시작. 관리자는 채팅 메시지를 우클릭해 삭제·10분 제한·제한 해제를 수행할 수 있습니다. 키보드는 메시지에 포커스 후 Shift+F10으로 메뉴를 엽니다. 방송을 바꾸지 않으면 기존 URL과 제목을 유지합니다.
8. 채팅 정리는 아래 운영 문서대로 예약합니다. Broadcast용 `realtime.messages` 테이블에 임의의 ALTER TABLE / publication 설정을 추가할 필요는 없습니다.

운영자 인증과 일반 사용자 인증은 같은 브라우저 세션을 공유합니다. 운영자 로그인 시 그 브라우저의 익명 세션이 운영자 세션으로 전환됩니다. 기존 익명 계정으로 복원할 수 없으므로 운영자용 브라우저 프로필을 분리하는 편이 좋습니다.

이미 첫 번째 SQL을 적용한 프로젝트는 이후 마이그레이션을 파일명 순서대로 SQL Editor에서 실행합니다. 우측 상단의 닉네임·톱니바퀴 버튼에서 이름과 8가지 색상을 선택합니다. 일반적인 변경은 이후 보내는 채팅부터 적용됩니다. 닉네임 중복·예약어 검사는 유지되고 닉네임 변경 간격은 5분입니다. 색상만 바꾸는 경우에는 이 제한을 적용하지 않습니다.

채팅 전송 성공 후 3초 동안 전송 버튼에 남은 시간이 표시됩니다. 기존 프로젝트는 `202610120003_chat_cooldown.sql`을 추가 실행하여 서버의 개인별 제한도 3초로 맞춥니다. 방 전체 제한은 `202610120004_disable_room_throttle.sql`을 실행해 해제합니다. 개인별 3초 제한은 유지합니다.

## 핵심 설계

`202610130003_viewer_mute_status.sql` 적용 후 채팅 정지된 사용자는 시청자 목록에서 반투명하게 표시되고 ‘채팅 정지’ 표시가 붙습니다. 정지·해제는 실시간으로 갱신하고, 시간이 만료되면 자동으로 원래 표시로 돌아옵니다.

일반 채팅은 최대 50자입니다. 기존 프로젝트에는 `202610130002_chat_length.sql`을 추가 적용합니다. 기존 채팅 기록은 유지하고, 관리자 공지는 기존 500자 제한을 유지합니다.

- **60분 자동 종료 경로 없음:** `getDuration()` / `getCurrentTime()`을 읽지 않습니다. 큐, 타이머 종료, 다음 영상 전환이 없습니다. `ENDED`, `UNSTARTED`, 장시간 `BUFFERING`은 해당 시청자 플레이어만 복구합니다. 서버의 방송 상태는 관리자의 명시적 RPC로만 변경합니다.
- **현재 라이브 복귀:** 시간값을 추정해 seek하지 않습니다. 처음 입장하거나 복구할 때 시작 시간 없는 새 IFrame을 생성합니다. YouTube가 최신 구간을 선택하도록 맡깁니다. 자동 복구는 20초 대기 후 5/15/45/120초 백오프, 방송 revision당 총 4회입니다. 정상 재생해도 예산을 계속 초기화하지 않습니다. 사용자는 직접 복구 버튼으로 다시 시도할 수 있습니다. 자동재생은 음소거로 시작하며 차단 시 별도 재생 버튼을 제공합니다.
- **신뢰할 수 있는 상태:** 방송은 DB의 단일 행, 단조 증가 revision, 관리자 업데이트의 예상 revision 검사로 관리합니다. Broadcast는 다시 조회하라는 알림입니다. 오래된 응답은 무시합니다.
- **원자적 채팅:** 클라이언트는 인증된 RPC만 호출합니다. DB가 UID·프로필·제한을 검증하고 저장한 트랜잭션 안에서 `realtime.send`를 호출합니다. Broadcast 트리거가 에러를 던지면 저장도 롤백됩니다. 전달 단계 유실은 재접속/주기적 DB 스냅샷으로 복구합니다. 전송 UUID 재사용은 애매한 네트워크 실패 후 중복 저장를 막습니다.
- **중복/누락/삭제:** 채팅 전용 revision으로 순서 역전·누락을 감지합니다. 정상 메시지는 DB 추가 조회 없이 화면에 반영하며 gap이 있으면 최근 100개 스냅샷으로 복구합니다. 자신의 전송 완료 후에도 한 번 조회합니다. 조용히 유실된 삭제는 60~75초마다 조회하여 바로잡습니다. 기록은 최대 100개만 렌더링합니다.
- **익명 인증:** 로그인 화면 없이 Supabase Anonymous Auth로 JWT를 받습니다. 토큰은 SDK의 브라우저 저장소에서 유지되며, 닉네임과 선택한 색상은 서버 프로필에 저장합니다. 같은 브라우저의 탭들은 동일 UID로 집계합니다. 닉네임은 대소문자를 무시한 고유값이며 예약된 운영자 이름을 사용할 수 없습니다. 관리자 여부는 닉네임/사용자 metadata가 아닌 서버 테이블과 비익명 JWT로 판정합니다.
- **안전한 표시:** 메시지는 React 텍스트 노드로만 렌더링합니다. HTML 렌더링을 허용하지 않습니다. 일반 사용자는 검증된 RPC로 자신의 닉네임·색상만 변경할 수 있습니다. 프로필 직접 쓰기, 관리자 테이블 쓰기, 메시지 직접 삽입/삭제, 신뢰된 Broadcast 송신을 할 수 없습니다.

## 구성

```text
src/App.tsx                     앱 진입 / 시청방 / 설정 안내
src/components/player/         YouTube 플레이어 화면
src/components/chat/           채팅 / 스크롤 / 전송 / 관리
src/components/common/         닉네임 입장 / CAPTCHA
src/hooks/useYouTubePlayer.ts   라이브 로컬 복구
src/hooks/useRoom.ts            방송 / 채팅 / Presence 구독 및 복구
src/hooks/useSession.ts         인증 및 프로필
src/services/                  Supabase / YouTube SDK 경계
src/utils/room.ts               URL 검증 / revision 처리
src/pages/AdminPage.tsx         운영자 로그인 및 관리
supabase/migrations/           테이블 / RLS / RPC / Broadcast
tests/                         모킹 경계 / UI / 상태 테스트
scripts/test-db.mjs             로컬 PostgreSQL 보안·트랜잭션 검사
scripts/load-test.mjs           명시적으로 실행하는 스테이징 부하 검사
docs/OPERATIONS.md              용량 계획 / 예약 정리 / 검증 절차
```

## 검증 명령

```powershell
npm run lint
npm test
npm run test:db
npm run build
```

플레이어 테스트는 가상 시간과 IFrame 모킹을 사용합니다. DB 테스트는 PGlite의 실제 PostgreSQL 엔진에서 SQL·권한·RLS를 실행하지만 Supabase Auth/Realtime의 인터페이스는 stub입니다. 이를 실제 3시간 재생/200명 실접속 검증으로 해석하면 안 됩니다. 현재 검증 결과와 남은 항목은 `docs/VALIDATION.md`에 기록합니다.

## Vercel 배포

1. 코드를 GitHub에 커밋·푸시한 후 Vercel에서 해당 저장소를 Import합니다. 배포 전 `.env.local`이 Git에서 제외되는지 확인합니다.
2. Framework Preset `Vite`, Build Command `npm run build`, Output Directory `dist`, Node.js `22.x`를 선택합니다.
3. Production/Preview에 Supabase URL·Publishable Key를 환경 변수로 등록합니다. Turnstile을 쓰면 공개 Site Key도 등록합니다. Preview는 별도 스테이징 Supabase 프로젝트를 권장합니다.
4. Deploy 후 Supabase Auth Site URL 및 Redirect URLs, Turnstile 허용 호스트를 실제 도메인에 맞춥니다. 환경 변수 변경은 재배포해야 반영됩니다.
5. `/`, `/admin`, 모바일 화면, 두 계정 채팅, 운영자 방송 변경, 일반 사용자 RPC 거부, 재연결을 확인합니다. YouTube에 Referer가 전달되어야 하므로 전역 `no-referrer` 설정을 추가하지 않습니다.

배포 환경에는 로컬 환경 변수 파일이 자동 전달되지 않습니다. Vercel 프로젝트에 공개 Supabase URL과 키를 별도로 등록합니다.

관리자는 채팅창 상단의 전체 삭제 버튼으로 확인 후 모든 채팅 기록을 삭제할 수 있습니다. 기존 DB에는 `202610120005_clear_chat.sql`을 추가 실행합니다. 서버에서 관리자 권한을 검사하고 reset 이벤트 하나로 접속자 기록을 갱신합니다. 삭제는 복구할 수 없습니다.

전체 삭제에서 `DELETE requires a WHERE clause` 오류가 발생하면 `202610120006_clear_chat_where.sql`을 실행합니다. 함수의 삭제문에 `where id is not null` 조건을 추가합니다. 이 SQL은 함수를 교체하며 실행 자체로 채팅 기록을 삭제하지 않습니다.

관리자 배지·닉네임 관리에는 `202610130001_nickname_moderation.sql`을 추가 적용합니다. 관리자는 채팅 메시지 또는 시청자 목록의 사용자를 우클릭하여 채팅 제한과 닉네임 강제 변경을 할 수 있습니다. 키보드에서는 항목에 초점을 맞춘 뒤 Shift+F10으로 같은 메뉴를 엽니다. 강제 변경은 서버에서 중복되지 않는 `슈엔의노예XXXX`(숫자 4자리)를 생성하며, 해당 사용자의 기존 메시지에도 적용합니다. 본인은 강제 변경 후 5분간 닉네임을 다시 바꿀 수 없습니다. 관리자의 추가 강제 변경은 이 제한을 받지 않습니다. 관리자 배지는 서버의 권한 정보로 표시하고, 온라인 목록의 닉네임·색상도 서버 프로필을 조회해 반영합니다.
