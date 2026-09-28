-- DreamNote Support Coordinator access
-- Run in the Supabase SQL Editor before inviting the first SC.

begin;

create table if not exists public.support_coordinators (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  email text not null,
  auth_user_id uuid references auth.users(id) on delete set null,
  invited_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists support_coordinators_workspace_email_key
  on public.support_coordinators (workspace_id, lower(email));
create unique index if not exists support_coordinators_auth_user_id_key
  on public.support_coordinators (auth_user_id)
  where auth_user_id is not null;

create table if not exists public.support_coordinator_participants (
  support_coordinator_id uuid not null references public.support_coordinators(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (support_coordinator_id, participant_id)
);

create index if not exists support_coordinator_participants_participant_idx
  on public.support_coordinator_participants (participant_id);

alter table public.support_coordinators enable row level security;
alter table public.support_coordinator_participants enable row level security;
revoke all on table public.support_coordinators from anon;
revoke all on table public.support_coordinator_participants from anon;

drop policy if exists "support_coordinators_select_self_or_admin" on public.support_coordinators;
drop policy if exists "support_coordinators_admin_all" on public.support_coordinators;
drop policy if exists "sc_assignments_select_self_or_admin" on public.support_coordinator_participants;
drop policy if exists "sc_assignments_admin_all" on public.support_coordinator_participants;

create policy "support_coordinators_select_self_or_admin"
on public.support_coordinators for select to authenticated
using (
  auth_user_id = auth.uid()
  or public.dreamnote_is_workspace_admin(workspace_id)
);

create policy "support_coordinators_admin_all"
on public.support_coordinators for all to authenticated
using (public.dreamnote_is_workspace_admin(workspace_id))
with check (public.dreamnote_is_workspace_admin(workspace_id));

create policy "sc_assignments_select_self_or_admin"
on public.support_coordinator_participants for select to authenticated
using (
  exists (
    select 1
    from public.support_coordinators coordinator
    where coordinator.id = support_coordinator_id
      and (
        coordinator.auth_user_id = auth.uid()
        or public.dreamnote_is_workspace_admin(coordinator.workspace_id)
      )
  )
);

create policy "sc_assignments_admin_all"
on public.support_coordinator_participants for all to authenticated
using (
  exists (
    select 1
    from public.support_coordinators coordinator
    where coordinator.id = support_coordinator_id
      and public.dreamnote_is_workspace_admin(coordinator.workspace_id)
  )
)
with check (
  exists (
    select 1
    from public.support_coordinators coordinator
    where coordinator.id = support_coordinator_id
      and public.dreamnote_is_workspace_admin(coordinator.workspace_id)
  )
);

commit;

