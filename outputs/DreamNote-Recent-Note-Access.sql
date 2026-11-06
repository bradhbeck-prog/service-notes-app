-- CLE-controlled worker access. Off by default for every participant.
begin;
create table public.worker_note_view_settings (
 participant_id uuid primary key references public.participants(id),
 note_limit integer not null default 0 check (note_limit in (0,5,10)),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now()
);
alter table public.worker_note_view_settings enable row level security;
revoke all on public.worker_note_view_settings from anon, authenticated;
grant select, insert, update on public.worker_note_view_settings to service_role;
commit;
