import { createClient } from "@supabase/supabase-js";
export const runtime = "nodejs";
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const validId = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || "");
async function context(request, participantId) {
  if (!validId(participantId)) return { response: json({ error: "Choose a participant." }, 400) };
  const token = (request.headers.get("authorization") || "").match(/^Bearer (.+)$/)?.[1];
  if (!token) return { response: json({ error: "Sign in again." }, 401) };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { response: json({ error: "Recent notes are not configured." }, 503) };
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return { response: json({ error: "Sign in again." }, 401) };
  const { data: participant } = await db.from("participants").select("id,cle_auth_user_id,workspace_id").eq("id", participantId).eq("active", true).maybeSingle();
  if (!participant) return { response: json({ error: "Participant unavailable." }, 403) };
  return { db, user, participant };
}
export async function GET(request) {
  const url = new URL(request.url);
  const ctx = await context(request, url.searchParams.get("participantId"));
  if (ctx.response) return ctx.response;
  const { db, user, participant } = ctx;
  if (url.searchParams.get("settings") === "1") {
    let allowed = participant.cle_auth_user_id === user.id;
    if (!allowed) {
      const { data } = await db.from("workspace_memberships").select("workspace_id").eq("workspace_id", participant.workspace_id).eq("user_id", user.id).eq("active", true).in("role", ["owner", "admin"]).maybeSingle();
      allowed = Boolean(data);
    }
    if (!allowed) return json({ error: "Access denied." }, 403);
    const { data, error } = await db.from("worker_note_view_settings").select("note_limit").eq("participant_id", participant.id).maybeSingle();
    return error ? json({ error: "Recent-note settings are unavailable." }, 503) : json({ noteLimit: data?.note_limit || 0 });
  }
  const { data: worker } = await db.from("workers").select("id").eq("auth_user_id", user.id).eq("active", true).maybeSingle();
  if (!worker) return json({ error: "No active worker account." }, 403);
  const { data: assignment } = await db.from("worker_participants").select("worker_id").eq("worker_id", worker.id).eq("participant_id", participant.id).maybeSingle();
  if (!assignment) return json({ error: "You are not assigned to this participant." }, 403);
  const { data: settings, error: settingsError } = await db.from("worker_note_view_settings").select("note_limit").eq("participant_id", participant.id).maybeSingle();
  if (settingsError) return json({ error: "Recent-note access could not be checked." }, 503);
  const limit = settings?.note_limit || 0;
  if (![5,10].includes(limit)) return json({ noteLimit: 0, notes: [] });
  const { data: notes, error } = await db.from("service_notes")
    .select("id,shift_date,service,time_in,time_out,location,narrative,signed_at,goals,goal_details,prompt_levels,workers(name),service_note_goals(prompt_level,participant_goals(id,goal_label,category_name))")
    .eq("participant_id", participant.id).eq("status", "submitted").order("shift_date", { ascending: false }).order("signed_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  if (error) return json({ error: "Recent notes could not be loaded." }, 503);
  const ids = (notes || []).map(note => note.id);
  const { data: corrections, error: correctionError } = ids.length ? await db.from("note_corrections").select("note_id,correction_text,correction_reason,signed_name,submitted_at").in("note_id", ids).eq("status", "submitted").order("submitted_at") : { data: [] };
  if (correctionError) return json({ error: "Correction history could not be checked." }, 503);
  const goalIds = [...new Set((notes || []).flatMap(note => Array.isArray(note.goals) ? note.goals : []))];
  const { data: goals, error: goalError } = goalIds.length ? await db.from("participant_goals").select("id,goal_label").eq("participant_id", participant.id).in("id", goalIds) : { data: [] };
  if (goalError) return json({ error: "Goal responses could not be loaded." }, 503);
  return json({ noteLimit: limit, notes: (notes || []).map(note => {
    const related = note.service_note_goals || [];
    const responses = related.length ? related.map(row => ({ label: row.participant_goals?.goal_label || "Goal", prompt: row.prompt_level || note.prompt_levels?.[row.participant_goals?.id], detail: note.goal_details?.[row.participant_goals?.id] })) : (goals || []).filter(goal => (note.goals || []).includes(goal.id)).map(goal => ({ label: goal.goal_label, prompt: note.prompt_levels?.[goal.id], detail: note.goal_details?.[goal.id] }));
    // Return only the read-only fields the worker needs, not internal goal IDs or auth fields.
    const { goals: ignoredGoals, goal_details, prompt_levels, service_note_goals, ...safeNote } = note;
    return { ...safeNote, goal_responses: responses, corrections: (corrections || []).filter(row => row.note_id === note.id) };
  }) });
}
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const ctx = await context(request, body.participantId);
  if (ctx.response) return ctx.response;
  const { db, user, participant } = ctx;
  if (participant.cle_auth_user_id !== user.id) return json({ error: "Only this participant's CLE can grant worker access." }, 403);
  if (![0,5,10].includes(body.noteLimit)) return json({ error: "Choose Off, 5 notes, or 10 notes." }, 400);
  const { error } = await db.from("worker_note_view_settings").upsert({ participant_id: participant.id, note_limit: body.noteLimit, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "participant_id" });
  return error ? json({ error: "Access settings could not be saved." }, 503) : json({ noteLimit: body.noteLimit, message: body.noteLimit ? `Assigned workers may read the last ${body.noteLimit} submitted notes.` : "Worker access to recent notes is off." });
}
