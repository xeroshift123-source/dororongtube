-- Explicit row condition required by hosted safe-update protection.
begin;
create or replace function public.clear_chat() returns bigint
language plpgsql security definer set search_path = '' as $$
declare n bigint;
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다' using errcode='42501'; end if;
  perform 1 from public.room_clock where id=1 for update;
  perform set_config('app.chat_cleanup','on',true);
  delete from public.chat_messages where id is not null;
  get diagnostics n = row_count;
  perform set_config('app.chat_cleanup','off',true);
  if n > 0 then
    update public.room_clock set revision=revision+1 where id=1;
    perform realtime.send(jsonb_build_object('reset',true),'reset','room:chat',true);
  end if;
  return n;
end; $$;
revoke execute on function public.clear_chat() from public, anon, authenticated;
grant execute on function public.clear_chat() to authenticated;
commit;
