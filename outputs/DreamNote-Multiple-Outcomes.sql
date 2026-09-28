-- Allow more than one reference outcome for each participant.
-- This preserves every existing outcome row and only removes the old one-per-participant restriction.

begin;

alter table public.participant_outcomes
  drop constraint if exists participant_outcomes_participant_id_key;

drop index if exists public.participant_outcomes_participant_id_key;

commit;
