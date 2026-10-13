begin;

alter table public.user_profiles add column last_nickname_change_at timestamptz;
update public.user_profiles set last_nickname_change_at=last_profile_change_at where user_id is not null;
alter table public.chat_messages add column is_admin boolean not null default false;
update public.chat_messages m set is_admin=exists(select 1 from public.admin_users a where a.user_id=m.user_id) where m.id is not null;

create or replace function public.chat_author_style() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select nickname_color into NEW.nickname_color from public.user_profiles where user_id=NEW.user_id;
  NEW.is_admin := public.is_admin();
  return NEW;
end; $$;

create or replace function public.update_my_profile(p_nickname text, p_color text)
returns public.user_profiles language plpgsql security definer set search_path = '' as $$
declare profile public.user_profiles; v_now timestamptz;
begin
  if auth.uid() is null then raise exception '인증이 필요합니다' using errcode='42501'; end if;
  if p_nickname is null or char_length(btrim(p_nickname)) not between 2 and 20 or p_nickname ~ '[[:cntrl:]]' then
    raise exception '닉네임은 공백을 제외한 2~20자로 입력해 주세요';
  end if;
  if lower(btrim(p_nickname)) in ('관리자','admin','운영자','system','시스템') then raise exception '예약된 닉네임입니다'; end if;
  if p_color is null or p_color not in ('#9ecbff','#a9dc76','#e5b567','#cb9df0','#f28da8','#75d5ce','#b8c76b','#eda47b') then
    raise exception '제공된 색상 중 하나를 선택해 주세요';
  end if;
  select * into profile from public.user_profiles where user_id=auth.uid() for update;
  if not found then raise exception '먼저 닉네임으로 입장해 주세요'; end if;
  if profile.nickname=btrim(p_nickname) and profile.nickname_color=p_color then return profile; end if;
  v_now := clock_timestamp();
  if profile.nickname<>btrim(p_nickname) and profile.last_nickname_change_at > v_now - interval '5 minutes' then
    raise exception '닉네임은 5분에 한 번 변경할 수 있습니다. %초 후 다시 시도해 주세요',
      ceil(extract(epoch from (profile.last_nickname_change_at + interval '5 minutes' - v_now)));
  end if;
  update public.user_profiles set nickname=btrim(p_nickname),nickname_color=p_color,
    last_nickname_change_at=case when nickname<>btrim(p_nickname) then v_now else last_nickname_change_at end,
    updated_at=v_now,last_profile_change_at=v_now
    where user_id=auth.uid() returning * into profile;
  perform realtime.send(jsonb_build_object('user_id',auth.uid()),'profile_changed','room:state',true);
  return profile;
exception when unique_violation then raise exception '이미 사용 중인 닉네임입니다';
end; $$;

-- Presence identifies online users; their displayed profiles and roles come from the server.
create function public.get_room_profiles(p_user_ids uuid[])
returns table(user_id uuid,nickname text,nickname_color text,is_admin boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '인증이 필요합니다' using errcode='42501'; end if;
  if coalesce(cardinality(p_user_ids),0)>500 then raise exception '한 번에 최대 500명을 조회할 수 있습니다'; end if;
  return query select p.user_id,p.nickname,p.nickname_color,exists(select 1 from public.admin_users a where a.user_id=p.user_id)
    from public.user_profiles p where p.user_id=any(p_user_ids);
end; $$;

create function public.force_rename_user(p_user_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_nickname text; v_old text;
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다' using errcode='42501'; end if;
  select nickname into v_old from public.user_profiles where user_id=p_user_id for update;
  if not found then raise exception '사용자를 찾을 수 없습니다'; end if;
  for attempt in 1..100 loop
    v_nickname := '슈엔의노예' || lpad(floor(random()*10000)::integer::text,4,'0');
    if v_nickname=v_old then continue; end if;
    begin
      update public.user_profiles set nickname=v_nickname,updated_at=clock_timestamp(),
        last_nickname_change_at=clock_timestamp(),last_profile_change_at=clock_timestamp() where user_id=p_user_id;
      -- Remove inappropriate names from the existing chat history as well.
      update public.room_clock set revision=revision+1 where id=1;
      update public.chat_messages set nickname=v_nickname where user_id=p_user_id;
      perform realtime.send(jsonb_build_object('reset',true),'reset','room:chat',true);
      perform realtime.send(jsonb_build_object('user_id',p_user_id),'profile_changed','room:state',true);
      return v_nickname;
    exception when unique_violation then null;
    end;
  end loop;
  raise exception '사용 가능한 닉네임을 생성하지 못했습니다. 다시 시도해 주세요';
end; $$;

revoke execute on function public.get_room_profiles(uuid[]),public.force_rename_user(uuid) from public,anon,authenticated;
grant execute on function public.get_room_profiles(uuid[]),public.force_rename_user(uuid) to authenticated;
commit;
