begin;

drop function public.get_room_profiles(uuid[]);
create function public.get_room_profiles(p_user_ids uuid[])
returns table(user_id uuid,nickname text,nickname_color text,is_admin boolean,muted_until timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '인증이 필요합니다' using errcode='42501'; end if;
  if coalesce(cardinality(p_user_ids),0)>500 then raise exception '한 번에 최대 500명을 조회할 수 있습니다'; end if;
  return query select p.user_id,p.nickname,p.nickname_color,
    exists(select 1 from public.admin_users a where a.user_id=p.user_id),
    case when m.muted_until > now() then m.muted_until else null end
    from public.user_profiles p left join public.chat_mutes m on m.user_id=p.user_id
    where p.user_id=any(p_user_ids);
end; $$;
revoke execute on function public.get_room_profiles(uuid[]) from public,anon,authenticated;
grant execute on function public.get_room_profiles(uuid[]) to authenticated;

create function public.chat_mute_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('user_id',NEW.user_id),'moderation_changed','room:state',true);
  return null;
end; $$;
revoke execute on function public.chat_mute_changed() from public,anon,authenticated;
create trigger chat_mute_broadcast after insert or update on public.chat_mutes
  for each row execute function public.chat_mute_changed();
commit;
