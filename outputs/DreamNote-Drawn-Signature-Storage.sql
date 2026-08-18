alter table public.service_notes
add column if not exists worker_drawn_signature text;

comment on column public.service_notes.worker_drawn_signature is
'Stores drawn worker signature as a browser canvas data URL so regenerated CLE/admin/monthly PDFs can include the original drawn signature.';
