# 운영 및 실제 검증

## 200명 용량 계획

공식 문서 확인일: 2026-10-12. 아래 수치는 [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits)의 프로젝트 기본 한도이며, 실제 Dashboard와 계약/요금제 설정을 우선합니다.

| 요금제 | 동시 연결 | 메시지/초 | 채널 join/초 | Presence 메시지/초 |
| --- | ---: | ---: | ---: | ---: |
| Free | 200 | 100 | 100 | 20 |
| Pro | 500 | 500 | 500 | 50 |
| Pro (spend cap 없음) | 10,000 | 2,500 | 2,500 | 1,000 |
| Team | 10,000 | 2,500 | 2,500 | 1,000 |

한 브라우저 탭은 소켓 하나에 채팅/방송/Presence 세 채널을 공유합니다. UID가 같아 인원은 한 명으로 보여도 탭별 소켓은 연결 한도를 소비합니다. Free는 목표 200명에 운영자/재연결/추가 탭의 여유가 없고, 200개 수신자에게 채팅 하나를 전달하는 순간에도 메시지 처리량이 부담됩니다. 200명은 Pro 이상을 출발점으로 삼고, 활발한 채팅은 더 높은 한도가 필요합니다. 요금제를 올렸다고 부하 검증이 대체되지는 않습니다.

Broadcast fan-out 예산은 대략 `초당 메시지 × 접속 소켓 수`이며 다른 이벤트도 여유에 포함합니다. 기본 서버 제한은 사용자당 3초에 1개, **방 전체 500ms에 1개**입니다. 200명이 동시에 작성하면 일부는 혼잡 오류를 받습니다. 이 제한은 처리량 초과로 모두가 끊기는 상황을 줄이기 위한 MVP 정책입니다. DB의 `room_clock.min_message_interval_ms`는 SQL Editor에서만 조정합니다. 500명 접속에 2개/초를 그대로 쓰면 500msg/sec 한도를 초과할 수 있습니다.

한 사람이 3시간 내내 2개/초로 보내는 상한은 약 21,600개 저장, 200명 fan-out은 약 432만 전달입니다. 실제 월간 Realtime 메시지, peak connections, DB 크기, egress 및 과금도 Dashboard에서 확인합니다. 채팅은 제한하지 않고 200명 모두 초당 여러 개를 보내는 수준은 이 기본 구성의 지원 범위가 아닙니다.

Presence는 입장·재구독 때 한 번 track하고 정기 heartbeat를 앱에서 별도로 보내지 않습니다. 퇴장 정리는 Realtime의 소켓/heartbeat 감지에 의존하므로 순간적인 정확성은 보장되지 않습니다. 연결 상태가 나쁘면 숫자 대신 `—`를 표시합니다. 키는 SDK가 인증 UID로 지정하지만 Presence payload/key는 클라이언트가 조작할 수 있습니다. **인원은 협조적인 클라이언트 기준의 안내 지표**이며 과금·권한·접속 차단의 기준으로 쓰면 안 됩니다. 공격자까지 포함한 정확한 인원은 별도 서버 lease 또는 인증된 집계가 필요합니다.

## 정리 작업

기본 보관 기간은 7일입니다. Supabase Dashboard에서 pg_cron을 활성화한 뒤 postgres 소유 SQL 작업을 등록합니다.

```sql
select cron.schedule('dororong-chat-cleanup','17 4 * * *',
  $$select public.cleanup_chat();$$);
```

Supabase cron은 프로젝트 설정 시간대(일반적으로 UTC)를 확인합니다. 이 예시는 UTC 기준 매일 04:17입니다. 함수는 브라우저에서 실행할 수 없으며, 대량 삭제 시 메시지마다 Broadcast를 보내지 않고 reset 이벤트 하나를 보냅니다. 예약 없이 자동 정리되지는 않습니다. 실행 로그/실패 여부를 모니터링합니다.

익명 계정 자동 정리는 별도입니다. [Anonymous Sign-Ins 문서](https://supabase.com/docs/guides/auth/auth-anonymous)대로 운영 정책을 세워 오래된 익명 계정을 정리할 수 있지만, 활발한 이용자 세션까지 지우지 않도록 마지막 사용 시각을 관리하는 개선이 필요합니다. 현재 구현은 계정을 임의로 삭제하지 않습니다. CAPTCHA와 Auth rate limit을 설정하고, 단일 IP/NAT에서 대규모 입장 시 익명 가입 IP 한도로 막히는지도 확인합니다.

## 실시간 부하 검사 (자동 실행하지 않음)

`npm run test:load`는 실제 Realtime과 DB에 요청하며 테스트 메시지를 남깁니다. 본인 소유의 **격리된 스테이징**에서 요금/서비스 허용량을 확인한 뒤 실행합니다. 외부 서비스의 과부하 테스트 승인이 필요한 경우 먼저 받습니다.

1. 일반 시청자 테스트 계정 2~200개의 유효한 JWT를 확보합니다. 이 스크립트는 계정을 대량 생성하지 않습니다. 최소 10분 이상의 토큰 유효 시간이 필요합니다.
2. Git에 무시되는 `artifacts/sessions.json`에 `[{"user_id":"실제 UID","access_token":"실제 JWT"}, ...]` 형식으로 저장합니다. 파일은 자격증명이며 공유/커밋하지 않습니다.
3. PowerShell 세션에 URL, publishable key, 세션 파일 경로와 명시적 실행 플래그를 등록합니다. 값은 본인 프로젝트의 값을 사용합니다.

   ```powershell
   $env:LOAD_CONFIRM='OWN_STAGING_PROJECT'
   $env:LOAD_SESSIONS_FILE='C:\dororongtube\artifacts\sessions.json'
   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY도 프로세스 환경에 등록
   npm run test:load
   ```

4. 점진적으로 세 채널을 구독하고 Presence 수를 검사한 뒤, 총 30개 채팅을 초당 1개씩 보냅니다. 각 클라이언트의 수신 수와 p95 지연을 출력하고 수신 누락/전송 오류면 실패합니다. 먼저 2 → 20 → 200 순서로 증가시킵니다. 민감 토큰은 로그에 출력하지 않습니다.
5. 목표 예: 200 소켓 전부 구독 성공, Presence 수렴 후 200, 메시지 30개 모두 수신, p95 지연 2초 이내, Realtime 한도 초과 로그 없음. 이 스크립트는 네트워크 장애/모바일/브라우저 렌더링까지 검증하지 않습니다.

## 출시 전 수동 체크리스트

- 공개 임베드 허용 라이브를 최소 3시간 재생하며 60/120/180분에 영상 ID와 방송 revision이 유지되는지 확인합니다. 실제 원본 방송과 시청 시점을 나란히 비교합니다.
- 새 시청자가 중간에 입장하고 최신 구간을 보는지, 1분 이상 백그라운드 후 복귀 시 보수적 재로드가 유효한지 확인합니다. IFrame API에는 신뢰할 수 있는 라이브 edge 조회 API가 없으므로 프레임 동기화는 보장하지 않습니다.
- Chrome/Edge/Safari, Android Chrome, iOS Safari에서 자동재생 차단·음소거 해제·인라인 재생·화면 회전·키보드 표시를 확인합니다. 컨트롤 숨김은 가능한 범위만 사용하며 IFrame을 덮는 클릭 차단 오버레이가 없습니다. YouTube 자체 단축 동작을 모두 금지할 수는 없습니다.
- DevTools 오프라인 → 복귀, 소켓 단절, 토큰 갱신, 절전 복귀 후 최신 방송/최근 채팅/삭제 복구를 확인합니다. Supabase SDK가 지수 백오프로 재구독하며, 앱은 subscribe/online/visible에서 최신 데이터를 재조회합니다.
- 두 탭의 동일 UID는 한 명, 다른 브라우저는 다른 사람으로 집계되는지 확인하고, 마지막 탭 종료 후 heartbeat timeout 안에 제거되는지 확인합니다.
- 일반 JWT로 set_broadcast/delete_message/mute_user/공지 RPC 및 직접 테이블 쓰기를 호출해 거부되는지 확인합니다. private Broadcast 직접 송신도 거부되어야 합니다.
- 동일 UUID 재전송, 메시지 폭주, 500자 초과, 공백, HTML 문자열, 중복 이벤트/순서 역전, 관리자의 동시 방송 수정, mute/해제를 확인합니다.
- DB cron, 익명 가입 rate limit, CAPTCHA, Realtime private-only, API 권한, 운영자 테이블, 환경 변수의 secret 노출 여부를 확인합니다.

## 남은 개선

네트워크 실패 이후 페이지를 닫으면 메모리의 재전송 UUID는 유지되지 않습니다. 더 강한 전달 보장에는 IndexedDB outbox와 삭제 tombstone 보관이 필요합니다. 닉네임은 고유하지만 Unicode 유사 문자까지 차단하지 않습니다. 감사 로그, 운영자 MFA, 차단/신고, 공격자에 강한 Presence 집계, 인증된 IP 기반 제한, 관측 지표는 후속 운영 기능입니다. 서버 전역 채팅 제한은 단일 행 잠금으로 직렬화하므로 고처리량으로 확장하려면 큐/집계 방식 재설계가 필요합니다.

## 참고한 공식 문서

- [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)
- [YouTube Player Parameters](https://developers.google.com/youtube/player_parameters)
- [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
- [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
- [Realtime Limits](https://supabase.com/docs/guides/realtime/limits)
- [Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous)
