import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function responseText(message, status = 400) {
  return new Response(message, { status, headers: { "Cache-Control": "no-store" } });
}

function getGoalDetail(details, goalId) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return "";
  return details[String(goalId)] || details[goalId] || "";
}

function buildSelectedGoals(note) {
  const rows = Array.isArray(note.service_note_goals) ? note.service_note_goals : [];
  if (rows.length) {
    return rows.map((row) => {
      const goal = row.participant_goals;
      return goal ? {
        ...goal,
        prompt_level: row.prompt_level || getGoalDetail(note.prompt_levels, goal.id),
        detail_value: getGoalDetail(note.goal_details, goal.id),
      } : null;
    }).filter(Boolean);
  }
  const selectedIds = Array.isArray(note.goals) ? note.goals.map(String) : [];
  return (note.participants?.participant_goals || [])
    .filter((goal) => selectedIds.includes(String(goal.id)))
    .map((goal) => ({
      ...goal,
      prompt_level: getGoalDetail(note.prompt_levels, goal.id),
      detail_value: getGoalDetail(note.goal_details, goal.id),
    }));
}

export async function GET(request, { params }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return responseText("Support Coordinator PDF access is not configured.", 500);

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return responseText("Sign in again before downloading a PDF.", 401);
  const noteId = String(params?.noteId || "").trim();
  if (!noteId) return responseText("Choose a note before downloading a PDF.", 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !user) return responseText("Your login session is invalid or expired.", 401);

  const { data: coordinator } = await admin.from("support_coordinators")
    .select("id, workspace_id").eq("auth_user_id", user.id).eq("active", true).maybeSingle();
  if (!coordinator) return responseText("No active Support Coordinator profile is linked to this login.", 403);

  const { data: note, error: noteError } = await admin.from("service_notes").select(`
    id, participant_id, shift_date, date_completed, signed_at, time_in, time_out, service, location,
    narrative, goals, goal_details, prompt_levels, status, worker_signature_mode,
    worker_typed_signature, worker_drawn_signature, worker_signature_font,
    workers(name),
    participants(id, name, workspace_id, participant_goals(id, goal_label, category_name, sort_order, participant_service_id)),
    service_note_goals(prompt_level, participant_goals(id, goal_label, category_name, sort_order, participant_service_id))
  `).eq("id", noteId).eq("status", "submitted").maybeSingle();
  if (noteError || !note || note.participants?.workspace_id !== coordinator.workspace_id) {
    return responseText("Submitted service note not found.", 404);
  }

  const { data: assignment } = await admin.from("support_coordinator_participants")
    .select("support_coordinator_id").eq("support_coordinator_id", coordinator.id)
    .eq("participant_id", note.participant_id).maybeSingle();
  if (!assignment) return responseText("You do not have access to this participant's notes.", 403);

  const pdfResponse = await fetch(new URL("/api/generate-pdf", request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workerName: note.workers?.name || "Worker",
      participantName: note.participants?.name || "Participant",
      cleEmail: null,
      shiftDate: note.shift_date,
      timeIn: note.time_in,
      timeOut: note.time_out,
      service: note.service,
      location: note.location,
      outcomePhrase: "",
      outcomeStatement: "",
      outcomeActionPlan: "",
      selectedGoals: buildSelectedGoals(note),
      noteText: note.narrative || "",
      signatureMode: note.worker_signature_mode || "typed",
      typedSignature: note.worker_typed_signature || note.workers?.name || "",
      drawnSignature: note.worker_drawn_signature || "",
      signatureFont: note.worker_signature_font || "Pacifico",
      dateCompleted: note.date_completed,
      signedAt: note.signed_at,
      attestationText: "I certify that this service note accurately reflects the services I provided.",
    }),
  });
  if (!pdfResponse.ok) return responseText("PDF could not be regenerated for this note.", 500);
  return new Response(await pdfResponse.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": pdfResponse.headers.get("content-disposition") || 'attachment; filename="Service-Note.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
