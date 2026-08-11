-- DreamNote service note compliance fields
-- Run this before deploying the matching application code.

alter table public.service_notes
  add column if not exists date_completed date,
  add column if not exists signed_at timestamptz,
  add column if not exists signed_by_user_id uuid references auth.users(id),
  add column if not exists signature_attested boolean not null default false;

comment on column public.service_notes.date_completed is
  'Date the worker finalized/signed the service note. Separate from date of service.';

comment on column public.service_notes.signed_at is
  'Exact timestamp when the worker finalized/signed the service note.';

comment on column public.service_notes.signed_by_user_id is
  'Supabase Auth user ID that finalized/signed the note when available.';

comment on column public.service_notes.signature_attested is
  'Whether the worker certified the service note accurately reflects services provided.';
