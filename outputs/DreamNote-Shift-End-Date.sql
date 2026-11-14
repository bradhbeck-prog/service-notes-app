-- Apply before deploying the overnight shift update. Existing records are unchanged:
-- a NULL end date on a legacy note continues to mean the start date.
begin;
alter table public.service_notes add column if not exists shift_end_date date;
comment on column public.service_notes.shift_end_date is
  'Local calendar date when the shift ended. NULL on legacy records means shift_date.';
notify pgrst, 'reload schema';
commit;
