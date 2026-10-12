-- Personal message cooldown; keep existing room-wide throttling and permissions.
begin;

create or replace function public.send_message(p_id uuid, p_message text, p_kind text default 'chat') returns public.chat_messages
language plpgsql security definer set search_path = '' as $$
declare profile public.user_profiles; result public.chat_messages; v_last timestamptz; v_interval integer; v_now timestamptz;
begin
  if auth.uid() is null then raise exception '인증이 필요합니다' using errcode='42501'; end if;
  -- Client UUID makes a retry after an ambiguous network failure idempotent.
  select * into result from public.chat_messages where id=p_id;
  if found then
    if result.user_id <> auth.uid() then raise exception '메시지 ID 충돌' using errcode='42501'; end if;
    return result;
  end if;
  if p_kind is null or p_kind not in ('chat','announcement') then raise exception '잘못된 메시지 유형'; end if;
  if p_kind='announcement' and not public.is_admin() then raise exception '관리자 권한이 필요합니다' using errcode='42501'; end if;
  if p_message is null or char_length(btrim(p_message)) not between 1 and 500 then raise exception '메시지는 1~500자입니다'; end if;
  select * into profile from public.user_profiles where user_id=auth.uid() for update;
  if not found then raise exception '먼저 닉네임으로 입장해 주세요'; end if;
  select * into result from public.chat_messages where id=p_id;
  if found then return result; end if;
  if exists(select 1 from public.chat_mutes where user_id=auth.uid() and muted_until > clock_timestamp()) then raise exception '채팅이 제한된 사용자입니다'; end if;
  -- Lock order is profile -> clock for every send. Deletion only locks the clock.
  select last_message_at,min_message_interval_ms into v_last,v_interval from public.room_clock where id=1 for update;
  v_now := clock_timestamp();
  if profile.last_message_at > v_now - interval '3 seconds' then raise exception '3초 후 다시 전송해 주세요'; end if;
  if v_last > v_now - (v_interval * interval '1 millisecond') then raise exception '채팅이 혼잡합니다. 잠시 후 다시 전송해 주세요'; end if;
  update public.user_profiles set last_message_at=v_now where user_id=auth.uid();
  update public.room_clock set last_message_at=v_now where id=1;
  insert into public.chat_messages(id,user_id,nickname,message,kind,created_at)
    values(p_id,auth.uid(),profile.nickname,btrim(p_message),p_kind,v_now) returning * into result;
  return result;
end; $$;


commit;
