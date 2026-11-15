-- Apply before deploying the late-submission prompt. Existing notes are left unchanged.
begin;

alter table public.service_notes
  add column if not exists late_submission_reason text;

alter table public.service_notes
  add constraint service_notes_late_submission_reason_check
  check (late_submission_reason is null or (
    status = 'submitted' and char_length(btrim(late_submission_reason)) between 1 and 500
  ));

notify pgrst, 'reload schema';
commit;
