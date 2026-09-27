-- DreamNote Phase 1 privacy hardening
-- Run this entire file in the Supabase SQL Editor.
-- It removes anonymous access to core records and rebuilds authenticated policies
-- around workspace administrators and each worker's own participant assignments.

begin;

create or replace function public.dreamnote_is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = auth.uid()
      and membership.active = true
      and membership.role in ('owner', 'admin')
  );
$$;

create or replace function public.dreamnote_current_worker_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select worker.id
  from public.workers worker
  where worker.auth_user_id = auth.uid()
    and worker.active = true
  limit 1;
$$;

-- Workers predate workspaces and do not currently carry a workspace_id. Until
-- that column is introduced, only a signed-in DreamNote owner/admin may manage
-- worker-directory rows. Ordinary workers can read only their own row.
create or replace function public.dreamnote_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    where membership.user_id = auth.uid()
      and membership.active = true
      and membership.role in ('owner', 'admin')
  );
$$;

create or replace function public.dreamnote_can_access_participant(target_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.participants participant
    where participant.id = target_participant_id
      and participant.active = true
      and (
        public.dreamnote_is_workspace_admin(participant.workspace_id)
        or participant.cle_auth_user_id = auth.uid()
        or exists (
          select 1
          from public.worker_participants assignment
          where assignment.participant_id = participant.id
            and assignment.worker_id = public.dreamnote_current_worker_id()
        )
      )
  );
$$;

create or replace function public.dreamnote_can_admin_participant(target_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.participants participant
    where participant.id = target_participant_id
      and public.dreamnote_is_workspace_admin(participant.workspace_id)
  );
$$;

revoke all on function public.dreamnote_is_workspace_admin(uuid) from public, anon;
revoke all on function public.dreamnote_current_worker_id() from public, anon;
revoke all on function public.dreamnote_is_admin() from public, anon;
revoke all on function public.dreamnote_can_access_participant(uuid) from public, anon;
revoke all on function public.dreamnote_can_admin_participant(uuid) from public, anon;
grant execute on function public.dreamnote_is_workspace_admin(uuid) to authenticated, service_role;
grant execute on function public.dreamnote_current_worker_id() to authenticated, service_role;
grant execute on function public.dreamnote_is_admin() to authenticated, service_role;
grant execute on function public.dreamnote_can_access_participant(uuid) to authenticated, service_role;
grant execute on function public.dreamnote_can_admin_participant(uuid) to authenticated, service_role;

alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.workers enable row level security;
alter table public.worker_participants enable row level security;
alter table public.participants enable row level security;
alter table public.participant_outcomes enable row level security;
alter table public.participant_services enable row level security;
alter table public.participant_goals enable row level security;
alter table public.service_notes enable row level security;
alter table public.service_note_goals enable row level security;

-- Anonymous visitors should never receive these records, even if a future policy is
-- accidentally written too broadly.
revoke all on table public.workspaces from anon;
revoke all on table public.workspace_memberships from anon;
revoke all on table public.workers from anon;
revoke all on table public.worker_participants from anon;
revoke all on table public.participants from anon;
revoke all on table public.participant_outcomes from anon;
revoke all on table public.participant_services from anon;
revoke all on table public.participant_goals from anon;
revoke all on table public.service_notes from anon;
revoke all on table public.service_note_goals from anon;

-- Replace existing policies so older permissive policies cannot continue granting
-- anonymous or cross-participant access.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'workspaces', 'workspace_memberships', 'workers', 'worker_participants', 'participants',
        'participant_outcomes', 'participant_services', 'participant_goals',
        'service_notes', 'service_note_goals'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end
$$;

create policy "workspaces_select_own"
on public.workspaces for select to authenticated
using (public.dreamnote_is_workspace_admin(id));

create policy "memberships_select_own"
on public.workspace_memberships for select to authenticated
using (user_id = auth.uid());

create policy "workers_select_own_or_admin"
on public.workers for select to authenticated
using (
  auth_user_id = auth.uid()
  or public.dreamnote_is_admin()
);

create policy "workers_admin_insert"
on public.workers for insert to authenticated
with check (public.dreamnote_is_admin());

create policy "workers_admin_update"
on public.workers for update to authenticated
using (public.dreamnote_is_admin())
with check (public.dreamnote_is_admin());

create policy "workers_admin_delete"
on public.workers for delete to authenticated
using (public.dreamnote_is_admin());

create policy "assignments_select_own_or_admin"
on public.worker_participants for select to authenticated
using (
  worker_id = public.dreamnote_current_worker_id()
  or public.dreamnote_can_admin_participant(worker_participants.participant_id)
);

create policy "assignments_admin_insert"
on public.worker_participants for insert to authenticated
with check (
  public.dreamnote_can_admin_participant(worker_participants.participant_id)
);

create policy "assignments_admin_update"
on public.worker_participants for update to authenticated
using (
  public.dreamnote_can_admin_participant(worker_participants.participant_id)
)
with check (
  public.dreamnote_can_admin_participant(worker_participants.participant_id)
);

create policy "assignments_admin_delete"
on public.worker_participants for delete to authenticated
using (
  public.dreamnote_can_admin_participant(worker_participants.participant_id)
);

create policy "participants_select_authorized"
on public.participants for select to authenticated
using (public.dreamnote_can_access_participant(id));

create policy "participants_admin_insert"
on public.participants for insert to authenticated
with check (public.dreamnote_is_workspace_admin(workspace_id));

create policy "participants_admin_update"
on public.participants for update to authenticated
using (public.dreamnote_is_workspace_admin(workspace_id))
with check (public.dreamnote_is_workspace_admin(workspace_id));

create policy "participants_admin_delete"
on public.participants for delete to authenticated
using (public.dreamnote_is_workspace_admin(workspace_id));

create policy "outcomes_select_authorized"
on public.participant_outcomes for select to authenticated
using (public.dreamnote_can_access_participant(participant_id));

create policy "outcomes_admin_all"
on public.participant_outcomes for all to authenticated
using (
  public.dreamnote_can_admin_participant(participant_outcomes.participant_id)
)
with check (
  public.dreamnote_can_admin_participant(participant_outcomes.participant_id)
);

create policy "services_select_authorized"
on public.participant_services for select to authenticated
using (public.dreamnote_can_access_participant(participant_id));

create policy "services_admin_all"
on public.participant_services for all to authenticated
using (
  public.dreamnote_can_admin_participant(participant_services.participant_id)
)
with check (
  public.dreamnote_can_admin_participant(participant_services.participant_id)
);

create policy "goals_select_authorized"
on public.participant_goals for select to authenticated
using (public.dreamnote_can_access_participant(participant_id));

create policy "goals_admin_all"
on public.participant_goals for all to authenticated
using (
  public.dreamnote_can_admin_participant(participant_goals.participant_id)
)
with check (
  public.dreamnote_can_admin_participant(participant_goals.participant_id)
);

create policy "notes_select_own_or_admin"
on public.service_notes for select to authenticated
using (
  worker_id = public.dreamnote_current_worker_id()
  or public.dreamnote_can_admin_participant(service_notes.participant_id)
);

create policy "notes_worker_insert"
on public.service_notes for insert to authenticated
with check (
  worker_id = public.dreamnote_current_worker_id()
  and public.dreamnote_can_access_participant(participant_id)
  and status in ('draft', 'submitted')
);

create policy "notes_worker_finalize_draft"
on public.service_notes for update to authenticated
using (
  worker_id = public.dreamnote_current_worker_id()
  and status = 'draft'
)
with check (
  worker_id = public.dreamnote_current_worker_id()
  and public.dreamnote_can_access_participant(participant_id)
  and status in ('draft', 'submitted')
);

create policy "notes_worker_delete_draft"
on public.service_notes for delete to authenticated
using (
  worker_id = public.dreamnote_current_worker_id()
  and status = 'draft'
);

create policy "notes_admin_all"
on public.service_notes for all to authenticated
using (
  public.dreamnote_can_admin_participant(service_notes.participant_id)
)
with check (
  public.dreamnote_can_admin_participant(service_notes.participant_id)
);

create policy "note_goals_select_own_or_admin"
on public.service_note_goals for select to authenticated
using (
  exists (
    select 1
    from public.service_notes note
    join public.participants participant on participant.id = note.participant_id
    where note.id = service_note_id
      and (
        note.worker_id = public.dreamnote_current_worker_id()
        or public.dreamnote_is_workspace_admin(participant.workspace_id)
      )
  )
);

create policy "note_goals_worker_insert"
on public.service_note_goals for insert to authenticated
with check (
  exists (
    select 1 from public.service_notes note
    where note.id = service_note_id
      and note.worker_id = public.dreamnote_current_worker_id()
      and public.dreamnote_can_access_participant(note.participant_id)
  )
);

create policy "note_goals_admin_all"
on public.service_note_goals for all to authenticated
using (
  exists (
    select 1
    from public.service_notes note
    join public.participants participant on participant.id = note.participant_id
    where note.id = service_note_id
      and public.dreamnote_is_workspace_admin(participant.workspace_id)
  )
)
with check (
  exists (
    select 1
    from public.service_notes note
    join public.participants participant on participant.id = note.participant_id
    where note.id = service_note_id
      and public.dreamnote_is_workspace_admin(participant.workspace_id)
  )
);

commit;

-- After running this migration:
-- 1. Verify an anonymous REST request cannot select workers, participants,
--    worker_participants, or service_notes.
-- 2. Sign in as one worker and verify only assigned participants appear.
-- 3. Save, resume, delete, and submit a draft.
-- 4. Verify the Admin dashboard and CLE portal still load.
