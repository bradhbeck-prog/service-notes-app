-- DreamNote CLE multi-delivery preferences
-- Run before deploying the matching application code.

alter table public.participants
  add column if not exists note_delivery_preferences text[] not null default array['immediate', 'monthly'];

update public.participants
set note_delivery_preferences = case
  when note_delivery_preference = 'weekly' then array['weekly', 'monthly']
  when note_delivery_preference = 'monthly' then array['monthly']
  else array['immediate', 'monthly']
end
where note_delivery_preferences is null
   or array_length(note_delivery_preferences, 1) is null;

alter table public.participants
  drop constraint if exists participants_note_delivery_preferences_allowed_check;

alter table public.participants
  add constraint participants_note_delivery_preferences_allowed_check
  check (
    array_length(note_delivery_preferences, 1) >= 1
    and note_delivery_preferences <@ array['immediate', 'weekly', 'monthly']
  );

comment on column public.participants.note_delivery_preferences is
  'CLE delivery options selected together. Allowed values: immediate, weekly, monthly.';
