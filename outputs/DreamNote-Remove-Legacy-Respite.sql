-- Expand the participant service catalog and replace the obsolete generic
-- Respite label. This script is safe to run again if it was run previously.

begin;

alter table public.participant_services
  drop constraint if exists participant_services_service_name_check;

-- Keep the existing row ID so goals and historical references remain intact.
update public.participant_services
set service_name = 'Day Respite'
where lower(trim(service_name)) = 'respite';

alter table public.participant_services
  add constraint participant_services_service_name_check
  check (service_name in (
    'In-Home and Community Supports',
    'In-Home and Community Supports Enhanced',
    'Companion',
    'Day Respite',
    '15-Minute Respite'
  ));

commit;
