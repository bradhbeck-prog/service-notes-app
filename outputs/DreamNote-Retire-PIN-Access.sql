-- Run once in Supabase SQL Editor before adding the next worker.
-- Old PIN data remains temporarily for history, but PIN login is disabled.

alter table public.workers alter column pin drop not null;
alter table public.workers alter column pin_login_enabled set default false;

update public.workers
set pin_login_enabled = false
where pin_login_enabled is distinct from false;

comment on column public.workers.pin is
  'Legacy field retained temporarily. DreamNote PIN login was retired.';
