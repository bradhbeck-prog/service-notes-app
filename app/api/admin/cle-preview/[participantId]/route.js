import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function formatShortDate(dateStr) {
  if (!dateStr) return "No date";
  const [year, month, day] = String(dateStr).slice(0, 10).split("-");
  if (!year || !month || !day) return String(dateStr);
  return `${Number(month)}-${Number(day)}-${String(year).slice(-2)}`;
}

function formatNoteTitle(note) {
  const date = formatShortDate(note.shift_date);
  const service = note.service || "Service";
  const worker = note.workers?.name || "Worker";
  return `${date} · ${service} · ${worker}`;
}

function normalizeDeliveryPreferences(participant) {
  if (
    Array.isArray(participant?.note_delivery_preferences) &&
    participant.note_delivery_preferences.length > 0
  ) {
    return participant.note_delivery_preferences;
  }

  if (participant?.note_delivery_preference === "weekly") return ["weekly", "monthly"];
  if (participant?.note_delivery_preference === "monthly") return ["monthly"];
  return ["immediate", "monthly"];
}

export async function GET(request, { params }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Admin CLE preview is not configured." }, 500);
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!accessToken) {
    return json({ error: "Sign in again to view the admin preview." }, 401);
  }

  const participantId = String(params?.participantId || "").trim();

  if (!participantId) {
    return json({ error: "Choose a participant to preview." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(accessToken);

  if (userError || !user) {
    return json({ error: "Your login session is invalid or expired." }, 401);
  }

  const { data: membership, error: membershipError } = await admin
    .from("workspace_memberships")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .eq("active", true)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return json({ error: "You do not have permission to preview CLE portals." }, 403);
  }

  const { data: participant, error: participantError } = await admin
    .from("participants")
    .select("id, name, cle_email, note_delivery_preference, note_delivery_preferences, active")
    .eq("id", participantId)
    .maybeSingle();

  if (participantError || !participant) {
    return json({ error: "Participant not found." }, 404);
  }

  const { data: assignedWorkerRows } = await admin
    .from("worker_participants")
    .select("workers(id, name, email, active)")
    .eq("participant_id", participant.id);

  const assignedWorkers = (assignedWorkerRows || [])
    .map((row) => row.workers)
    .filter(Boolean)
    .filter((worker) => worker.active !== false)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  const { data: workerLastNoteRows, error: workerLastNoteError } = await admin
    .from("service_notes")
    .select("worker_id, shift_date, created_at")
    .eq("participant_id", participant.id)
    .eq("status", "submitted")
    .order("shift_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (workerLastNoteError) {
    return json({ error: workerLastNoteError.message }, 500);
  }

  const lastNoteByWorker = new Map();
  (workerLastNoteRows || []).forEach((note) => {
    if (note.worker_id && !lastNoteByWorker.has(note.worker_id)) {
      lastNoteByWorker.set(note.worker_id, note.shift_date);
    }
  });

  const assignedWorkersWithActivity = assignedWorkers.map((worker) => ({
    ...worker,
    last_note_date: lastNoteByWorker.get(worker.id) || null,
  }));

  const { count: hiddenDraftCount, error: hiddenDraftError } = await admin
    .from("service_notes")
    .select("id", { count: "exact", head: true })
    .eq("participant_id", participant.id)
    .eq("status", "draft")
    .not("narrative", "is", null)
    .neq("narrative", "");

  if (hiddenDraftError) {
    return json({ error: hiddenDraftError.message }, 500);
  }

  const { data: noteRows, error: notesError } = await admin
    .from("service_notes")
    .select("id, shift_date, date_completed, signed_at, time_in, time_out, service, location, status, created_at, workers(name)")
    .eq("participant_id", participant.id)
    .eq("status", "submitted")
    .order("shift_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (notesError) {
    return json({ error: notesError.message }, 500);
  }

  return json({
    participant: {
      ...participant,
      note_delivery_preferences: normalizeDeliveryPreferences(participant),
    },
    assignedWorkers: assignedWorkersWithActivity,
    hiddenDraftCount: hiddenDraftCount || 0,
    notes: (noteRows || []).map((note) => ({
      ...note,
      title: formatNoteTitle(note),
    })),
  });
}
