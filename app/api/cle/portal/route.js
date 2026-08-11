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

export async function GET(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "CLE portal is not configured." }, 500);
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!accessToken) {
    return json({ error: "Sign in again to view the CLE portal." }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(accessToken);

  if (userError || !user?.email) {
    return json({ error: "Your login session is invalid or expired." }, 401);
  }

  const email = user.email.trim().toLowerCase();

  const { data: participant, error: participantError } = await admin
    .from("participants")
    .select("id, name, cle_email, note_delivery_preference, note_delivery_preferences, active")
    .eq("active", true)
    .ilike("cle_email", email)
    .limit(1)
    .maybeSingle();

  if (participantError || !participant) {
    return json({ error: "No active CLE participant is linked to this login." }, 403);
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
    assignedWorkers,
    notes: (noteRows || []).map((note) => ({
      ...note,
      title: formatNoteTitle(note),
    })),
  });
}

export async function PATCH(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "CLE portal is not configured." }, 500);
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!accessToken) {
    return json({ error: "Sign in again before changing preferences." }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid preference request." }, 400);
  }

  const preferences = Array.isArray(body.noteDeliveryPreferences)
    ? body.noteDeliveryPreferences.map((value) => String(value).trim())
    : [];
  const allowed = new Set(["immediate", "weekly", "monthly"]);
  const uniquePreferences = [...new Set(preferences)].filter((value) => allowed.has(value));

  if (uniquePreferences.length === 0) {
    return json({ error: "Choose at least one delivery option." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(accessToken);

  if (userError || !user?.email) {
    return json({ error: "Your login session is invalid or expired." }, 401);
  }

  const email = user.email.trim().toLowerCase();

  const { data: participant, error: participantError } = await admin
    .from("participants")
    .select("id")
    .eq("active", true)
    .ilike("cle_email", email)
    .limit(1)
    .maybeSingle();

  if (participantError || !participant) {
    return json({ error: "No active CLE participant is linked to this login." }, 403);
  }

  const { error: updateError } = await admin
    .from("participants")
    .update({
      note_delivery_preference: uniquePreferences[0],
      note_delivery_preferences: uniquePreferences,
    })
    .eq("id", participant.id);

  if (updateError) {
    return json({ error: updateError.message }, 500);
  }

  return json({
    message: "Delivery preferences saved.",
    noteDeliveryPreferences: uniquePreferences,
  });
}
