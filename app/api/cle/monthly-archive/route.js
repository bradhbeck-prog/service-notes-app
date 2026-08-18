import { PDFDocument } from "pdf-lib";
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

function getParticipantInitials(name) {
  const parts = String(name || "Participant")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "PR";

  return parts
    .slice(0, 3)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getMonthName(monthNumber) {
  const date = new Date(Date.UTC(2026, Number(monthNumber) - 1, 1));
  return date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
}

function makeArchiveFileName(participantName, month) {
  const [year, monthNumber] = String(month || "").split("-");
  const initials = getParticipantInitials(participantName);
  const monthLabel = year && monthNumber
    ? `${getMonthName(monthNumber)}-${year}`
    : "Monthly";
  return `${initials}-${monthLabel}-Service-Notes.pdf`;
}

function isValidMonth(month) {
  return /^\d{4}-\d{2}$/.test(month || "");
}

export async function GET(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return responseText("CLE monthly archive is not configured.", 500);
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!accessToken) {
    return responseText("Sign in again before downloading an archive.", 401);
  }

  const url = new URL(request.url);
  const month = url.searchParams.get("month") || "";

  if (!isValidMonth(month)) {
    return responseText("Choose a valid archive month.", 400);
  }

  const monthStart = `${month}-01`;
  const monthEndDate = new Date(`${monthStart}T00:00:00Z`);
  monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1);
  const monthEnd = monthEndDate.toISOString().slice(0, 10);

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

  const { data: notes, error: notesError } = await admin
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
      worker_drawn_signature,
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
    .eq("participant_id", participant.id)
    .eq("status", "submitted")
    .gte("shift_date", monthStart)
    .lt("shift_date", monthEnd)
    .order("shift_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (notesError) {
    return responseText(notesError.message, 500);
  }

  if (!notes?.length) {
    return responseText("No submitted notes were found for that month.", 404);
  }

  const archive = await PDFDocument.create();

  for (const note of notes) {
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
        drawnSignature: note.worker_drawn_signature || "",
        signatureFont: note.worker_signature_font || "Pacifico",
        dateCompleted: note.date_completed,
        signedAt: note.signed_at,
        attestationText: "I certify that this service note accurately reflects the services I provided.",
      }),
    });

    if (!pdfResponse.ok) {
      return responseText("One of the service notes could not be regenerated for the archive.", 500);
    }

    const sourcePdf = await PDFDocument.load(await pdfResponse.arrayBuffer());
    const copiedPages = await archive.copyPages(sourcePdf, sourcePdf.getPageIndices());
    copiedPages.forEach((page) => archive.addPage(page));
  }

  const archiveBytes = await archive.save();
  const fileName = makeArchiveFileName(participant.name, month);

  return new Response(archiveBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
