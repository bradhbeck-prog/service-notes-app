import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const DEFAULT_PROMPT_LEVELS = [
  "Independent", "Verbal Prompt", "Gesture Prompt", "Modeling",
  "Partial Physical Prompt", "Hand Over Hand", "Full Physical Prompt",
];

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function text(value) {
  return String(value || "").trim();
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [String(key), text(item)]));
}

function timeToMinutes(value) {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(String(value || ""));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function easternDate(timestamp) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function easternDateTime(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(timestamp);
}

export async function POST(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Secure note submission is not configured." }, 500);

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return json({ error: "Sign in again before submitting this note." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !user) return json({ error: "Your login session is invalid or expired." }, 401);

  const { data: worker, error: workerError } = await admin.from("workers")
    .select("id, name, auth_user_id, active").eq("auth_user_id", user.id).eq("active", true).maybeSingle();
  if (workerError || !worker) return json({ error: "No active worker account is linked to this login." }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid service-note request." }, 400); }

  const participantId = text(body.participantId);
  const currentNoteId = text(body.currentNoteId);
  const shiftDate = text(body.shiftDate);
  const timeIn = text(body.timeIn);
  const timeOut = text(body.timeOut);
  const service = text(body.service);
  const location = text(body.location);
  const narrative = text(body.noteText);
  const selectedGoalIds = [...new Set((Array.isArray(body.selectedGoals) ? body.selectedGoals : []).map(String))];
  const goalDetails = normalizeObject(body.goalDetails);
  const promptLevels = normalizeObject(body.promptLevels);
  const signatureMode = body.signatureMode === "draw" ? "draw" : "typed";
  const typedSignature = text(body.typedSignature);
  const drawnSignature = text(body.drawnSignature);
  const signatureFont = text(body.signatureFont) || "Pacifico";

  if (!participantId) return json({ error: "Choose a participant." }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(shiftDate)) return json({ error: "Choose a valid date of service." }, 400);
  if (!narrative) return json({ error: "Complete the service-note narrative." }, 400);
  if (!body.signatureAttested) return json({ error: "Certify the note before submitting it." }, 400);
  if (signatureMode === "typed" && !typedSignature) return json({ error: "Type your signature before submitting." }, 400);
  if (signatureMode === "draw" && !drawnSignature) return json({ error: "Draw your signature before submitting." }, 400);

  const startMinutes = timeToMinutes(timeIn);
  const endMinutes = timeToMinutes(timeOut);
  if (startMinutes === null || endMinutes === null) return json({ error: "Enter valid start and end times." }, 400);
  if (endMinutes <= startMinutes) return json({ error: "The end time must be later than the start time. Use separate notes when service crosses midnight." }, 400);

  const { data: assignment } = await admin.from("worker_participants").select("participant_id")
    .eq("worker_id", worker.id).eq("participant_id", participantId).maybeSingle();
  if (!assignment) return json({ error: "You are not assigned to this participant." }, 403);

  const { data: participant } = await admin.from("participants").select("id, name, active, prompt_levels")
    .eq("id", participantId).eq("active", true).maybeSingle();
  if (!participant) return json({ error: "This participant is not active." }, 404);

  const { data: participantService } = await admin.from("participant_services").select("id, service_name")
    .eq("participant_id", participantId).eq("service_name", service).eq("active", true).maybeSingle();
  if (!participantService) return json({ error: "Choose one of this participant's active services." }, 400);

  if (currentNoteId) {
    const { data: draft } = await admin.from("service_notes").select("id")
      .eq("id", currentNoteId).eq("worker_id", worker.id).eq("participant_id", participantId)
      .eq("status", "draft").maybeSingle();
    if (!draft) return json({ error: "Only your own saved draft can be submitted." }, 403);
  }

  const { data: sameDayNotes, error: overlapError } = await admin.from("service_notes")
    .select("id, time_in, time_out, participants(name)").eq("worker_id", worker.id)
    .eq("shift_date", shiftDate).eq("status", "submitted");
  if (overlapError) return json({ error: "Existing notes could not be checked for overlapping time." }, 500);
  const overlap = (sameDayNotes || []).find((note) => {
    if (currentNoteId && note.id === currentNoteId) return false;
    const existingStart = timeToMinutes(note.time_in);
    const existingEnd = timeToMinutes(note.time_out);
    return existingStart !== null && existingEnd !== null && startMinutes < existingEnd && endMinutes > existingStart;
  });
  if (overlap) return json({
    error: `This time overlaps a submitted note${overlap.participants?.name ? ` for ${overlap.participants.name}` : ""}. Check the start and end times before submitting.`,
  }, 409);

  let selectedGoals = [];
  if (selectedGoalIds.length) {
    const { data, error } = await admin.from("participant_goals")
      .select("id, goal_label, requires_detail, requires_prompt_level, participant_service_id, applicable_service_ids")
      .eq("participant_id", participantId).eq("active", true).in("id", selectedGoalIds);
    if (error) return json({ error: "The selected goals could not be verified." }, 500);
    selectedGoals = data || [];
    if (selectedGoals.length !== selectedGoalIds.length) return json({ error: "One or more selected goals are no longer available." }, 400);
  }

  for (const goal of selectedGoals) {
    const applicableIds = Array.isArray(goal.applicable_service_ids) ? goal.applicable_service_ids.map(String) : [];
    const appliesToService = applicableIds.length
      ? applicableIds.includes(String(participantService.id))
      : !goal.participant_service_id || String(goal.participant_service_id) === String(participantService.id);
    if (!appliesToService) return json({ error: `“${goal.goal_label}” is not available for the selected service.` }, 400);
    if (goal.requires_detail && !goalDetails[String(goal.id)]) return json({ error: `Complete the required response for: ${goal.goal_label}` }, 400);
    if (goal.requires_prompt_level && !promptLevels[String(goal.id)]) return json({ error: `Choose the required prompt level for: ${goal.goal_label}` }, 400);
    const allowedPromptLevels = Array.isArray(participant.prompt_levels) && participant.prompt_levels.length
      ? participant.prompt_levels.map(String)
      : DEFAULT_PROMPT_LEVELS;
    if (goal.requires_prompt_level && !allowedPromptLevels.includes(promptLevels[String(goal.id)])) {
      return json({ error: `Choose one of the available prompt levels for: ${goal.goal_label}` }, 400);
    }
  }

  const draftValues = {
    worker_id: worker.id, participant_id: participantId, shift_date: shiftDate, time_in: timeIn,
    time_out: timeOut, service, location: location === "home" ? "home" : "community",
    narrative, goals: selectedGoalIds, goal_details: goalDetails, prompt_levels: promptLevels,
    status: "draft", worker_signature_mode: signatureMode,
    worker_typed_signature: signatureMode === "typed" ? typedSignature : null,
    worker_drawn_signature: signatureMode === "draw" ? drawnSignature : null,
    worker_signature_font: signatureFont, worker_signature_date: shiftDate, signature_attested: false,
  };

  const draftResult = currentNoteId
    ? await admin.from("service_notes").update(draftValues).eq("id", currentNoteId).eq("status", "draft").select("id").single()
    : await admin.from("service_notes").insert(draftValues).select("id").single();
  if (draftResult.error || !draftResult.data) return json({ error: draftResult.error?.message || "The note could not be prepared for submission." }, 400);
  const noteId = draftResult.data.id;

  const { error: deleteGoalError } = await admin.from("service_note_goals").delete().eq("service_note_id", noteId);
  if (deleteGoalError) return json({ error: "The note remains a draft because its goal responses could not be prepared." }, 500);
  if (selectedGoals.length) {
    const goalRows = selectedGoals.map((goal) => ({
      service_note_id: noteId, participant_goal_id: goal.id,
      prompt_level: promptLevels[String(goal.id)] || null,
    }));
    const { error } = await admin.from("service_note_goals").insert(goalRows);
    if (error) return json({ error: "The note remains a draft because its goal responses could not be saved." }, 500);
  }

  const submittedAt = new Date();
  const signedAt = submittedAt.toISOString();
  const dateCompleted = easternDate(submittedAt);
  const { data: submitted, error: submitError } = await admin.from("service_notes")
    .update({ status: "submitted", date_completed: dateCompleted, signed_at: signedAt,
      signed_by_user_id: user.id, signature_attested: true })
    .eq("id", noteId).eq("status", "draft").select("id, date_completed, signed_at").single();
  if (submitError || !submitted) return json({ error: "The note remains a draft because final submission could not be completed." }, 500);

  const submittedAtDisplay = easternDateTime(submittedAt);
  return json({ noteId: submitted.id, dateCompleted: submitted.date_completed,
    signedAt: submitted.signed_at, submittedAtDisplay,
    message: `Service note submitted on ${submittedAtDisplay}.` }, 201);
}
