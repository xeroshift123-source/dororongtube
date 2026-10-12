-- Disable the shared room cooldown; keep the personal three-second cooldown.
begin;
alter table public.room_clock drop constraint room_clock_min_message_interval_ms_check;
alter table public.room_clock add constraint room_clock_min_message_interval_ms_check
  check (min_message_interval_ms between 0 and 60000);
update public.room_clock set min_message_interval_ms = 0 where id = 1;
commit;
