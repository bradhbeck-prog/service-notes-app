-- Remove the obsolete generic Respite option while retaining its row for history.

update public.participant_services
set active = false
where lower(trim(service_name)) = 'respite';
