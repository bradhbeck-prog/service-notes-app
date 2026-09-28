import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function formatShortDate(dateStr) {
  if (!dateStr) return "No date";
  const [year, month, day] = String(dateStr).slice(0, 10).split("-");
  return year && month && day ? `${Number(month)}-${Number(day)}-${String(year).slice(-2)}` : String(dateStr);
}

export async function GET(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Support Coordinator portal is not configured." }, 500);
  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return json({ error: "Sign in again to view the Support Coordinator portal." }, 401);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !user) return json({ error: "Your login session is invalid or expired." }, 401);
  const { data: coordinator, error: coordinatorError } = await admin.from("support_coordinators")
    .select("id, name, email, workspace_id, active").eq("auth_user_id", user.id).eq("active", true).maybeSingle();
  if (coordinatorError || !coordinator) return json({ error: "No active Support Coordinator profile is linked to this login." }, 403);
  const { data: assignmentRows, error: assignmentError } = await admin.from("support_coordinator_participants")
    .select("participant_id").eq("support_coordinator_id", coordinator.id);
  if (assignmentError) return json({ error: assignmentError.message }, 500);
  const participantIds = (assignmentRows || []).map((row) => row.participant_id);
  if (!participantIds.length) return json({ coordinator, participants: [], notes: [] });
  const { data: participants, error: participantError } = await admin.from("participants")
    .select("id, name, active").in("id", participantIds).eq("workspace_id", coordinator.workspace_id).eq("active", true).order("name");
  if (participantError) return json({ error: participantError.message }, 500);
  const activeIds = (participants || []).map((participant) => participant.id);
  const { data: notes, error: notesError } = activeIds.length
    ? await admin.from("service_notes")
        .select("id, participant_id, shift_date, date_completed, signed_at, service, location, created_at, workers(name)")
        .in("participant_id", activeIds).eq("status", "submitted")
        .order("shift_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000)
    : { data: [], error: null };
  if (notesError) return json({ error: notesError.message }, 500);
  return json({
    coordinator,
    participants: participants || [],
    notes: (notes || []).map((note) => ({ ...note, title: `${formatShortDate(note.shift_date)} · ${note.service || "Service"} · ${note.workers?.name || "Worker"}` })),
  });
}

