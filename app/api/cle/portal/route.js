import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function formatNoteTitle(note) {
  const date = note.shift_date || "No date";
  const service = note.service || "Service";
  const worker = note.workers?.name || "Worker";
  return `${date} · ${service} · ${worker}`;
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
    .select("id, name, cle_email, note_delivery_preference, active")
    .eq("active", true)
    .ilike("cle_email", email)
    .limit(1)
    .maybeSingle();

  if (participantError || !participant) {
    return json({ error: "No active CLE participant is linked to this login." }, 403);
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
    participant,
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

  const preference = String(body.noteDeliveryPreference || "").trim();
  const allowed = new Set(["immediate", "weekly", "monthly"]);

  if (!allowed.has(preference)) {
    return json({ error: "Choose immediate, weekly, or monthly delivery." }, 400);
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
    .update({ note_delivery_preference: preference })
    .eq("id", participant.id);

  if (updateError) {
    return json({ error: updateError.message }, 500);
  }

  return json({ message: "Delivery preference saved.", noteDeliveryPreference: preference });
}
