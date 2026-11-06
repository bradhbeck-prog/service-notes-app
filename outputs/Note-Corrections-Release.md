# Note corrections

Apply `DreamNote-Note-Corrections.sql` in the production Supabase SQL editor before deploying these application changes. Do not deploy the PDF changes first: PDF generation deliberately refuses to omit correction history when the correction table cannot be read.

Workers see pending requests on the participant chooser or the selected participant's page. A CLE can request/cancel a correction from a submitted note's Corrections button. Only the original worker, while active and still assigned to the participant, can submit it. No email notifications are sent in this version.

Corrections are signed addenda, not edits to the original service note. A worker identifies the field/statement and corrected value in text, supplies a reason, types their name, and certifies the correction. Original timestamps, text, goal responses and signature remain unchanged. Each signed addendum is appended to generated PDFs, including monthly downloads. Previously downloaded/emailed PDFs cannot change retrospectively.

Admin preview shows read-only correction history and explains the CLE action; it cannot send requests on a CLE's behalf. Revoked/finished requests cannot be edited. A later correction requires a new CLE request.

Verification performed: `node --test tests/note-corrections.test.mjs`, `npm run build`.

Before rollout, use a fake participant and test accounts to check:
1. CLE requests correction, worker sees only that requested note, original text/goal responses render read-only.
2. Worker cannot submit without correction, reason, signature, and certification.
3. CLE cancels an opened request; worker submission is refused.
4. Worker submits once; request disappears, original note remains unchanged, CLE history shows signed correction and Eastern timestamp.
5. Individual PDF and monthly archive include original pages plus signed addendum.
6. Unrelated CLE/worker cannot fetch the note/request; removing assignment immediately prevents correction access.
7. Admin preview is read-only. No participant chooser is required for single-participant workers to find their request.
