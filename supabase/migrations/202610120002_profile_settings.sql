-- Existing projects: apply this migration after 202610120001_room.sql.
begin;
alter table public.user_profiles add column nickname_color text
  check (nickname_color in ('#9ecbff','#a9dc76','#e5b567','#cb9df0','#f28da8','#75d5ce','#b8c76b','#eda47b'));
alter table public.user_profiles add column last_profile_change_at timestamptz;
alter table public.chat_messages add column nickname_color text
  check (nickname_color in ('#9ecbff','#a9dc76','#e5b567','#cb9df0','#f28da8','#75d5ce','#b8c76b','#eda47b'));

create function public.update_my_profile(p_nickname text, p_color text)
returns public.user_profiles language plpgsql security definer set search_path = '' as $$
declare profile public.user_profiles;
begin
  if auth.uid() is null then raise exception '인증이 필요합니다' using errcode='42501'; end if;
  if p_nickname is null or char_length(btrim(p_nickname)) not between 2 and 20 or p_nickname ~ '[[:cntrl:]]' then
    raise exception '닉네임은 공백을 제외한 2~20자로 입력해 주세요';
  end if;
  if lower(btrim(p_nickname)) in ('관리자','admin','운영자','system','시스템') then raise exception '예약된 닉네임입니다'; end if;
  if p_color is null or p_color not in ('#9ecbff','#a9dc76','#e5b567','#cb9df0','#f28da8','#75d5ce','#b8c76b','#eda47b') then
    raise exception '제공된 색상 중 하나를 선택해 주세요';
  end if;
  -- Lock the same profile as send_message so subsequent messages see the committed settings.
  select * into profile from public.user_profiles where user_id=auth.uid() for update;
  if not found then raise exception '먼저 닉네임으로 입장해 주세요'; end if;
  if profile.nickname=btrim(p_nickname) and profile.nickname_color=p_color then return profile; end if;
  if profile.last_profile_change_at > clock_timestamp() - interval '5 seconds' then raise exception '설정은 5초 후 다시 변경할 수 있습니다'; end if;
  update public.user_profiles set nickname=btrim(p_nickname),nickname_color=p_color,
    updated_at=clock_timestamp(),last_profile_change_at=clock_timestamp()
    where user_id=auth.uid() returning * into profile;
  return profile;
exception when unique_violation then raise exception '이미 사용 중인 닉네임입니다';
end; $$;

-- Snapshot the authenticated author's chosen color at send time. Never trust client message colors.
create function public.chat_author_style() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select nickname_color into NEW.nickname_color from public.user_profiles where user_id=NEW.user_id;
  return NEW;
end; $$;
create trigger chat_author_style before insert on public.chat_messages
  for each row execute function public.chat_author_style();
revoke execute on function public.update_my_profile(text,text), public.chat_author_style() from public, anon, authenticated;
grant execute on function public.update_my_profile(text,text) to authenticated;
commit;
