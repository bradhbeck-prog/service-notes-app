-- Require workers to use DreamNote's authenticated server submission route.
-- Drafts remain editable by their worker. Submitted notes remain immutable to workers.
-- Run once in the Supabase SQL Editor after deploying the matching application update.

begin;

drop policy if exists "notes_worker_insert" on public.service_notes;
drop policy if exists "notes_worker_insert_draft" on public.service_notes;
drop policy if exists "notes_worker_finalize_draft" on public.service_notes;
drop policy if exists "notes_worker_update_draft" on public.service_notes;

create policy "notes_worker_insert_draft"
on public.service_notes for insert to authenticated
with check (
  worker_id = public.dreamnote_current_worker_id()
  and public.dreamnote_can_access_participant(participant_id)
  and status = 'draft'
  and date_completed is null
  and signed_at is null
  and signed_by_user_id is null
  and signature_attested = false
);

create policy "notes_worker_update_draft"
on public.service_notes for update to authenticated
using (
  worker_id = public.dreamnote_current_worker_id()
  and status = 'draft'
)
with check (
  worker_id = public.dreamnote_current_worker_id()
  and public.dreamnote_can_access_participant(participant_id)
  and status = 'draft'
  and date_completed is null
  and signed_at is null
  and signed_by_user_id is null
  and signature_attested = false
);

commit;
