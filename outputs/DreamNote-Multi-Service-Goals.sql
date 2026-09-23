-- Run once in Supabase SQL Editor before deploying the multi-service goal update.
-- NULL means the goal applies to every active service for the participant.

alter table public.participant_goals
  add column if not exists applicable_service_ids uuid[];

update public.participant_goals
set applicable_service_ids = array[participant_service_id]
where participant_service_id is not null
  and (applicable_service_ids is null or cardinality(applicable_service_ids) = 0);

comment on column public.participant_goals.applicable_service_ids is
  'Participant service IDs where this goal appears. NULL or an empty array means all active services.';
