-- DreamNote security preflight (read-only)
-- Run this in Supabase before DreamNote-Secure-Core-Records-RLS.sql.
-- It does not change any records or settings.

select
  schemaname,
  tablename,
  rowsecurity as row_level_security_enabled
from pg_tables
where schemaname = 'public'
  and tablename in (
    'workspaces', 'workspace_memberships', 'workers', 'worker_participants',
    'participants', 'participant_outcomes', 'participant_services',
    'participant_goals', 'service_notes', 'service_note_goals'
  )
order by tablename;

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  permissive,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'workspaces', 'workspace_memberships', 'workers', 'worker_participants',
    'participants', 'participant_outcomes', 'participant_services',
    'participant_goals', 'service_notes', 'service_note_goals'
  )
order by tablename, policyname;

select
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
  and table_name in (
    'workspaces', 'workspace_memberships', 'workers', 'worker_participants',
    'participants', 'participant_outcomes', 'participant_services',
    'participant_goals', 'service_notes', 'service_note_goals'
  )
order by table_name, privilege_type;

