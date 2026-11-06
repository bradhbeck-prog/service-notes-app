import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const clean = (value) => typeof value === "string" ? value.trim() : "";
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || "");

async function context(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!token) return { error: json({ error: "Please sign in again." }, 401) };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: json({ error: "Corrections are not configured." }, 503) };
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await db.auth.getUser(token);
  return error || !user ? { error: json({ error: "Please sign in again." }, 401) } : { db, user };
}

async function cleOwns(db, user, participantId) {
  const { data, error } = await db.from("participants").select("id").eq("id", participantId).eq("cle_auth_user_id", user.id).eq("active", true).maybeSingle();
  return !error && Boolean(data);
}

async function assignedWorker(db, user, workerId, participantId) {
  const { data: worker } = await db.from("workers").select("id").eq("id", workerId).eq("auth_user_id", user.id).eq("active", true).maybeSingle();
  if (!worker) return false;
  const { data: assignment } = await db.from("worker_participants").select("worker_id").eq("worker_id", workerId).eq("participant_id", participantId).maybeSingle();
  const { data: participant } = await db.from("participants").select("id").eq("id", participantId).eq("active", true).maybeSingle();
  return Boolean(assignment && participant);
}

export async function GET(request) {
  const ctx = await context(request);
  if (ctx.error) return ctx.error;
  const { db, user } = ctx;
  const noteId = new URL(request.url).searchParams.get("noteId");
  if (noteId) {
    if (!uuid(noteId)) return json({ error: "Invalid note." }, 400);
    const { data: note } = await db.from("service_notes").select("participant_id,participants(workspace_id)").eq("id", noteId).eq("status", "submitted").maybeSingle();
    if (!note) return json({ error: "You cannot access this note." }, 403);
    const { data: membership } = await db.from("workspace_memberships").select("workspace_id").eq("workspace_id", note.participants?.workspace_id).eq("user_id", user.id).eq("active", true).in("role", ["owner", "admin"]).maybeSingle();
    if (!membership && !await cleOwns(db, user, note.participant_id)) return json({ error: "You cannot access this note." }, 403);
    const { data, error } = await db.from("note_corrections").select("id,status,request_reason,requested_at,correction_text,correction_reason,signed_name,submitted_at").eq("note_id", noteId).order("requested_at");
    return error ? json({ error: "Correction history is unavailable. The database update may still be needed." }, 503) : json({ corrections: data });
  }
  const { data: worker } = await db.from("workers").select("id").eq("auth_user_id", user.id).eq("active", true).maybeSingle();
  if (!worker) return json({ error: "No active worker account." }, 403);
  const { data, error } = await db.from("note_corrections").select("id,note_id,participant_id,worker_id,request_reason,requested_at,original_note,participants(name)").eq("worker_id", worker.id).eq("status", "pending").order("requested_at");
  if (error) return json({ error: "Correction requests could not be loaded." }, 503);
  const allowed = [];
  for (const row of data || []) if (await assignedWorker(db, user, worker.id, row.participant_id)) allowed.push(row);
  return json({ corrections: allowed });
}

export async function POST(request) {
  const ctx = await context(request);
  if (ctx.error) return ctx.error;
  const { db, user } = ctx;
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  if (body.action === "request") {
    if (!uuid(body.noteId)) return json({ error: "Invalid note." }, 400);
    const reason = clean(body.reason);
    if (!reason || reason.length > 4000) return json({ error: "Explain the requested correction (up to 4,000 characters)." }, 400);
    const { data: note, error } = await db.from("service_notes").select("*, workers(name), service_note_goals(prompt_level,participant_goals(goal_label,category_name))").eq("id", body.noteId).eq("status", "submitted").maybeSingle();
    if (error || !note || !await cleOwns(db, user, note.participant_id)) return json({ error: "You cannot request a correction for this note." }, 403);
    const { data: worker } = await db.from("workers").select("id").eq("id", note.worker_id).eq("active", true).maybeSingle();
    const { data: assignment } = await db.from("worker_participants").select("worker_id").eq("worker_id", note.worker_id).eq("participant_id", note.participant_id).maybeSingle();
    if (!worker || !assignment) return json({ error: "The original worker must still have active access to this participant." }, 400);
    const ids = Array.isArray(note.goals) ? note.goals : [];
    if (ids.length) {
      const { data: goals, error: goalsError } = await db.from("participant_goals").select("id,goal_label,category_name").eq("participant_id", note.participant_id).in("id", ids);
      if (goalsError) return json({ error: "The original goal responses could not be preserved." }, 500);
      note.goal_response_snapshot = (goals || []).map(goal => ({ ...goal, detail_value: note.goal_details?.[goal.id] || "", prompt_level: note.prompt_levels?.[goal.id] || "" }));
    }
    const result = await db.from("note_corrections").insert({ note_id: note.id, participant_id: note.participant_id, worker_id: note.worker_id, requested_by: user.id, request_reason: reason, original_note: note });
    if (result.error) return json({ error: result.error.code === "23505" ? "This note already has a pending correction." : "The request could not be saved. Check that the database update is installed." }, 409);
    return json({ message: "Correction requested. The worker will see it the next time they open DreamNote." });
  }
  if (!uuid(body.id)) return json({ error: "Invalid correction request." }, 400);
  const { data: correction } = await db.from("note_corrections").select("*").eq("id", body.id).eq("status", "pending").maybeSingle();
  if (!correction) return json({ error: "This request is no longer open." }, 409);
  if (body.action === "revoke") {
    if (!await cleOwns(db, user, correction.participant_id)) return json({ error: "Access denied." }, 403);
    const { data, error } = await db.from("note_corrections").update({ status: "revoked" }).eq("id", correction.id).eq("status", "pending").select("id").maybeSingle();
    return error || !data ? json({ error: "This request has already changed. Refresh and try again." }, 409) : json({ message: "Correction request canceled." });
  }
  if (body.action !== "submit") return json({ error: "Unknown action." }, 400);
  if (!await assignedWorker(db, user, correction.worker_id, correction.participant_id)) return json({ error: "You no longer have access to this correction." }, 403);
  const correctionText = clean(body.correctionText), reason = clean(body.reason), name = clean(body.signedName);
  if (!correctionText || correctionText.length > 12000 || !reason || reason.length > 4000 || !name || name.length > 200 || body.attested !== true) return json({ error: "Complete the correction, reason, signature, and certification." }, 400);
  const { data, error } = await db.from("note_corrections").update({ status: "submitted", correction_text: correctionText, correction_reason: reason, signed_name: name, submitted_by: user.id, submitted_at: new Date().toISOString() }).eq("id", correction.id).eq("status", "pending").select("id").maybeSingle();
  return error || !data ? json({ error: "This request has already changed. Refresh before trying again." }, 409) : json({ message: "Correction signed and submitted. The original note has been preserved." });
}
