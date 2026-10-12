begin;
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 20 and nickname = btrim(nickname) and nickname !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  last_message_at timestamptz
);
create unique index unique_nickname on public.user_profiles (lower(nickname));
create table public.broadcast_state (
  id integer primary key default 1 check (id = 1), youtube_video_id text check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text not null default '잠시 후 라이브가 시작됩니다' check (char_length(title) between 1 and 120),
  status text not null default 'waiting' check (status in ('waiting','live','ended')),
  started_at timestamptz, updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null, revision bigint not null default 0,
  check (status <> 'live' or youtube_video_id is not null)
);
insert into public.broadcast_state(id) values (1);
create table public.chat_messages (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null, message text not null check (char_length(btrim(message)) between 1 and 500),
  kind text not null default 'chat' check (kind in ('chat','announcement')),
  created_at timestamptz not null default clock_timestamp()
);
create index chat_recent on public.chat_messages(created_at desc, id desc);
create table public.chat_mutes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  muted_until timestamptz not null, updated_by uuid references auth.users(id) on delete set null
);
-- A transactional event counter detects lost/deleted events; also serializes global rate limiting.
create table public.room_clock (
  id integer primary key check (id=1), revision bigint not null default 0,
  last_message_at timestamptz not null default '-infinity',
  min_message_interval_ms integer not null default 500 check (min_message_interval_ms between 100 and 60000)
);
insert into public.room_clock(id) values(1);
alter table public.admin_users enable row level security;
alter table public.user_profiles enable row level security;
alter table public.broadcast_state enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_mutes enable row level security;
alter table public.room_clock enable row level security;

create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((auth.jwt()->>'is_anonymous')::boolean, true) = false
    and exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
create policy broadcast_read on public.broadcast_state for select to authenticated using (true);
create policy profile_read on public.user_profiles for select to authenticated using (user_id = (select auth.uid()));
create policy admin_read on public.admin_users for select to authenticated using (user_id = (select auth.uid()));
create policy mute_read on public.chat_mutes for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
-- No direct table writes. No direct chat reads: the bounded snapshot RPC is the read API.
revoke all on public.admin_users, public.user_profiles, public.broadcast_state, public.chat_messages, public.chat_mutes, public.room_clock from anon, authenticated;
grant select on public.broadcast_state, public.user_profiles, public.admin_users, public.chat_mutes to authenticated;

create function public.join_room(p_nickname text) returns public.user_profiles
language plpgsql security definer set search_path = '' as $$
declare result public.user_profiles;
begin
  if auth.uid() is null then raise exception '인증이 필요합니다' using errcode='42501'; end if;
  select * into result from public.user_profiles where user_id = auth.uid();
  if found then return result; end if; -- Nicknames are immutable for this identity.
  if char_length(btrim(p_nickname)) not between 2 and 20 or p_nickname ~ '[[:cntrl:]]' then raise exception '닉네임은 2~20자입니다'; end if;
  if lower(btrim(p_nickname)) in ('관리자','admin','운영자','system','시스템') then raise exception '예약된 닉네임입니다'; end if;
  insert into public.user_profiles(user_id,nickname) values(auth.uid(),btrim(p_nickname)) returning * into result;
  return result;
exception when unique_violation then
  select * into result from public.user_profiles where user_id = auth.uid();
  if found then return result; end if;
  raise exception '이미 사용 중인 닉네임입니다';
end; $$;

create function public.get_chat_snapshot() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('revision', c.revision, 'messages', coalesce((
    select jsonb_agg(to_jsonb(m) order by m.created_at, m.id) from (
      select * from public.chat_messages order by created_at desc, id desc limit 100
    ) m
  ), '[]'::jsonb)) from public.room_clock c where id=1 and auth.uid() is not null;
$$;

create function public.chat_changed() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_revision bigint; payload jsonb;
begin
  if current_setting('app.chat_cleanup',true) = 'on' then return null; end if;
  update public.room_clock set revision=revision+1 where id=1 returning revision into v_revision;
  if TG_OP = 'INSERT' then
    payload := jsonb_build_object('revision',v_revision,'kind','insert','message',to_jsonb(NEW));
  else
    payload := jsonb_build_object('revision',v_revision,'kind','delete','id',OLD.id);
  end if;
  perform realtime.send(payload,'change','room:chat',true);
  return null;
end; $$;
create trigger chat_broadcast after insert or delete on public.chat_messages for each row execute function public.chat_changed();

create function public.send_message(p_id uuid, p_message text, p_kind text default 'chat') returns public.chat_messages
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
  if profile.last_message_at > v_now - interval '2 seconds' then raise exception '2초 후 다시 전송해 주세요'; end if;
  if v_last > v_now - (v_interval * interval '1 millisecond') then raise exception '채팅이 혼잡합니다. 잠시 후 다시 전송해 주세요'; end if;
  update public.user_profiles set last_message_at=v_now where user_id=auth.uid();
  update public.room_clock set last_message_at=v_now where id=1;
  insert into public.chat_messages(id,user_id,nickname,message,kind,created_at)
    values(p_id,auth.uid(),profile.nickname,btrim(p_message),p_kind,v_now) returning * into result;
  return result;
end; $$;

create function public.set_broadcast(p_video_id text, p_title text, p_status text, p_expected_revision bigint) returns public.broadcast_state
language plpgsql security definer set search_path = '' as $$
declare result public.broadcast_state;
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다' using errcode='42501'; end if;
  if p_status is null or p_status not in ('waiting','live','ended') then raise exception '잘못된 방송 상태'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 120 then raise exception '제목은 1~120자입니다'; end if;
  update public.broadcast_state set youtube_video_id=p_video_id, title=btrim(p_title), status=p_status,
    started_at=case when p_status='live' and (status<>'live' or youtube_video_id is distinct from p_video_id) then clock_timestamp() else started_at end,
    updated_at=clock_timestamp(), updated_by=auth.uid(), revision=revision+1
    where id=1 and revision=p_expected_revision returning * into result;
  if not found then raise exception '방송 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요'; end if;
  perform realtime.send(jsonb_build_object('revision',result.revision),'change','room:state',true);
  return result;
end; $$;
create function public.delete_message(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다' using errcode='42501'; end if;
  perform 1 from public.room_clock where id=1 for update;
  delete from public.chat_messages where id=p_id;
end; $$;
create function public.mute_user(p_user_id uuid, p_minutes integer) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다' using errcode='42501'; end if;
  if p_minutes is null or p_minutes not between 0 and 1440 then raise exception '제한 시간은 0~1440분입니다'; end if;
  -- Same profile lock as send_message: a mute takes effect after an in-flight send commits.
  perform 1 from public.user_profiles where user_id=p_user_id for update;
  insert into public.chat_mutes(user_id,muted_until,updated_by)
    values(p_user_id,clock_timestamp() + p_minutes * interval '1 minute',auth.uid())
    on conflict(user_id) do update set muted_until=excluded.muted_until,updated_by=excluded.updated_by;
end; $$;
-- Intended for a postgres-owned scheduled job, never callable from the client.
create function public.cleanup_chat() returns bigint language plpgsql security definer set search_path = '' as $$
declare n bigint;
begin
  -- Bulk retention emits ONE reset event, avoiding thousands of Broadcast deliveries.
  perform 1 from public.room_clock where id=1 for update;
  perform set_config('app.chat_cleanup','on',true);
  delete from public.chat_messages where created_at < now() - interval '7 days';
  get diagnostics n = row_count;
  perform set_config('app.chat_cleanup','off',true);
  if n > 0 then
    update public.room_clock set revision=revision+1 where id=1;
    perform realtime.send(jsonb_build_object('reset',true),'reset','room:chat',true);
  end if;
  return n;
end; $$;

-- Receive server events, publish Presence only. Browsers cannot spoof trusted Broadcasts.
create policy room_receive on realtime.messages for select to authenticated using (
  ((select realtime.topic()) in ('room:chat','room:state') and extension='broadcast') or
  ((select realtime.topic())='room:presence' and extension='presence')
);
create policy room_presence on realtime.messages for insert to authenticated with check (
  (select realtime.topic())='room:presence' and extension='presence'
);
revoke execute on function public.is_admin(), public.join_room(text), public.get_chat_snapshot(), public.chat_changed(), public.send_message(uuid,text,text), public.set_broadcast(text,text,text,bigint), public.delete_message(uuid), public.mute_user(uuid,integer), public.cleanup_chat() from public, anon, authenticated;
grant execute on function public.is_admin(), public.join_room(text), public.get_chat_snapshot(), public.send_message(uuid,text,text), public.set_broadcast(text,text,text,bigint), public.delete_message(uuid), public.mute_user(uuid,integer) to authenticated;
commit;
