-- DreamNote CLE portal foundation
-- Run before deploying the matching application code.

alter table public.participants
  add column if not exists cle_auth_user_id uuid references auth.users(id),
  add column if not exists cle_invited_at timestamptz,
  add column if not exists note_delivery_preference text not null default 'immediate';

alter table public.participants
  drop constraint if exists participants_note_delivery_preference_check;

alter table public.participants
  add constraint participants_note_delivery_preference_check
  check (note_delivery_preference in ('immediate', 'weekly', 'monthly'));

comment on column public.participants.cle_auth_user_id is
  'Supabase Auth user ID for the Common Law Employer portal account when invited/linked.';

comment on column public.participants.cle_invited_at is
  'Timestamp when the CLE setup invitation was sent.';

comment on column public.participants.note_delivery_preference is
  'CLE note delivery preference: immediate, weekly, or monthly.';
