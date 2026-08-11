import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function DELETE(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "CLE worker access is not configured." }, 500);
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!accessToken) {
    return json({ error: "Sign in again before changing worker access." }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid worker access request." }, 400);
  }

  const workerId = String(body.workerId || "").trim();

  if (!workerId) {
    return json({ error: "Choose a worker to remove." }, 400);
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

  const { data: existingAssignment, error: assignmentError } = await admin
    .from("worker_participants")
    .select("worker_id, participant_id")
    .eq("worker_id", workerId)
    .eq("participant_id", participant.id)
    .limit(1)
    .maybeSingle();

  if (assignmentError) {
    return json({ error: assignmentError.message }, 500);
  }

  if (!existingAssignment) {
    return json({ error: "That worker is not assigned to this participant." }, 404);
  }

  const { error: deleteError } = await admin
    .from("worker_participants")
    .delete()
    .eq("worker_id", workerId)
    .eq("participant_id", participant.id);

  if (deleteError) {
    return json({ error: deleteError.message }, 500);
  }

  return json({ message: "Worker access removed for this participant." });
}
