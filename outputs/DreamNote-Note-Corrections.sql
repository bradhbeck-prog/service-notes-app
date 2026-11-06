-- Apply before deploying the correction workflow. Existing notes are never updated.
begin;
create table public.note_corrections (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.service_notes(id),
  participant_id uuid not null references public.participants(id),
  worker_id uuid not null references public.workers(id),
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  request_reason text not null check (length(request_reason) between 1 and 4000),
  status text not null default 'pending' check (status in ('pending','submitted','revoked')),
  original_note jsonb not null,
  correction_text text,
  correction_reason text,
  signed_name text,
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz,
  check (status <> 'submitted' or (
    length(correction_text) between 1 and 12000 and length(correction_reason) between 1 and 4000
    and length(signed_name) between 1 and 200 and submitted_by is not null and submitted_at is not null
  ))
);
create unique index note_corrections_one_pending on public.note_corrections(note_id) where status = 'pending';
create index note_corrections_worker_pending on public.note_corrections(worker_id, status);
create index note_corrections_note_history on public.note_corrections(note_id, requested_at);
alter table public.note_corrections enable row level security;
-- All access uses authenticated, participant-scoped server routes. No browser writes.
revoke all on public.note_corrections from anon, authenticated;
grant select, insert, update on public.note_corrections to service_role;
create function public.dreamnote_lock_finished_correction() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status <> 'pending' then
    raise exception 'Finished correction requests are immutable';
  end if;
  if new.note_id <> old.note_id or new.worker_id <> old.worker_id
    or new.participant_id <> old.participant_id or new.requested_by <> old.requested_by
    or new.requested_at <> old.requested_at or new.request_reason <> old.request_reason
    or new.original_note <> old.original_note then
    raise exception 'Original correction request cannot be changed';
  end if;
  return new;
end;
$$;
create trigger lock_finished_correction before update on public.note_corrections
for each row execute function public.dreamnote_lock_finished_correction();
commit;
