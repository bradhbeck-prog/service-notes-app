import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function responseText(message, status = 400) {
  return new Response(message, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getGoalDetail(details, goalId) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return "";
  return details[String(goalId)] || details[goalId] || "";
}

function buildSelectedGoals(note) {
  const noteGoalRows = Array.isArray(note.service_note_goals)
    ? note.service_note_goals
    : [];

  if (noteGoalRows.length > 0) {
    return noteGoalRows
      .map((row) => {
        const goal = row.participant_goals;
        if (!goal) return null;
        return {
          ...goal,
          prompt_level: row.prompt_level || getGoalDetail(note.prompt_levels, goal.id),
          detail_value: getGoalDetail(note.goal_details, goal.id),
        };
      })
      .filter(Boolean);
  }

  const selectedIds = Array.isArray(note.goals) ? note.goals.map(String) : [];
  const participantGoals = note.participants?.participant_goals || [];

  return participantGoals
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

  if (!supabaseUrl || !serviceRoleKey) {
    return responseText("CLE PDF download is not configured.", 500);
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!accessToken) {
    return responseText("Sign in again before downloading a PDF.", 401);
  }

  const noteId = String(params?.noteId || "").trim();

  if (!noteId) {
    return responseText("Choose a note before downloading a PDF.", 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(accessToken);

  if (userError || !user?.email) {
    return responseText("Your login session is invalid or expired.", 401);
  }

  const email = user.email.trim().toLowerCase();

  const { data: participant, error: participantError } = await admin
    .from("participants")
    .select("id, name, cle_email")
    .eq("active", true)
    .ilike("cle_email", email)
    .limit(1)
    .maybeSingle();

  if (participantError || !participant) {
    return responseText("No active CLE participant is linked to this login.", 403);
  }

  const { data: note, error: noteError } = await admin
    .from("service_notes")
    .select(`
      id,
      participant_id,
      worker_id,
      shift_date,
      date_completed,
      signed_at,
      time_in,
      time_out,
      service,
      location,
      narrative,
      goals,
      goal_details,
      prompt_levels,
      status,
      worker_signature_mode,
      worker_typed_signature,
      worker_signature_font,
      workers(name),
      participants(
        id,
        name,
        cle_email,
        participant_goals(
          id,
          goal_label,
          category_name,
          sort_order,
          participant_service_id
        ),
        participant_outcomes(
          outcome_phrase,
          outcome_statement,
          outcome_action_plan
        )
      ),
      service_note_goals(
        prompt_level,
        participant_goals(
          id,
          goal_label,
          category_name,
          sort_order,
          participant_service_id
        )
      )
    `)
    .eq("id", noteId)
    .eq("participant_id", participant.id)
    .eq("status", "submitted")
    .maybeSingle();

  if (noteError || !note) {
    return responseText("Submitted service note not found for this CLE account.", 404);
  }

  const participantRow = note.participants || participant;
  const outcome = participantRow.participant_outcomes?.[0] || {};

  const pdfResponse = await fetch(new URL("/api/generate-pdf", request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workerName: note.workers?.name || "Worker",
      participantName: participantRow.name || participant.name,
      cleEmail: null,
      shiftDate: note.shift_date,
      timeIn: note.time_in,
      timeOut: note.time_out,
      service: note.service,
      location: note.location,
      outcomePhrase: outcome.outcome_phrase || "",
      outcomeStatement: outcome.outcome_statement || "",
      outcomeActionPlan: outcome.outcome_action_plan || "",
      selectedGoals: buildSelectedGoals(note),
      noteText: note.narrative || "",
      signatureMode: note.worker_signature_mode || "typed",
      typedSignature: note.worker_typed_signature || note.workers?.name || "",
      drawnSignature: "",
      signatureFont: note.worker_signature_font || "Pacifico",
      dateCompleted: note.date_completed,
      signedAt: note.signed_at,
      attestationText: "I certify that this service note accurately reflects the services I provided.",
    }),
  });

  if (!pdfResponse.ok) {
    return responseText("PDF could not be regenerated for this note.", 500);
  }

  const pdfBytes = await pdfResponse.arrayBuffer();
  const contentDisposition = pdfResponse.headers.get("content-disposition") ||
    'attachment; filename="Service-Note.pdf"';

  return new Response(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition,
      "Cache-Control": "no-store",
    },
  });
}
