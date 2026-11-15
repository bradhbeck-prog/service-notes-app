-- Apply before deploying category ordering. Existing ordering remains unchanged.
begin;
alter table public.participants add column if not exists goal_category_order text[] not null default '{}';
comment on column public.participants.goal_category_order is 'Display order of normalized goal category names for this participant.';
notify pgrst, 'reload schema';
commit;
