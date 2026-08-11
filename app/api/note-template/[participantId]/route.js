import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request, { params }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Note template preview is not configured." }, 500);
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!accessToken) {
    return json({ error: "Sign in again to view this template." }, 401);
  }

  const participantId = String(params?.participantId || "").trim();

  if (!participantId) {
    return json({ error: "Choose a participant template to preview." }, 400);
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

  const { data: participant, error: participantError } = await admin
    .from("participants")
    .select(`
      id,
      name,
      cle_email,
      prompt_levels,
      active,
      participant_outcomes (
        outcome_phrase,
        outcome_statement,
        outcome_action_plan
      ),
      participant_goals (
        id,
        goal_label,
        sort_order,
        active,
        category_name,
        participant_service_id,
        detail_prompt,
        requires_detail,
        requires_prompt_level
      ),
      participant_services (
        id,
        service_name,
        active
      )
    `)
    .eq("id", participantId)
    .eq("active", true)
    .maybeSingle();

  if (participantError || !participant) {
    return json({ error: "Participant template not found." }, 404);
  }

  const { data: membership } = await admin
    .from("workspace_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("active", true)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();

  const userEmail = user.email.trim().toLowerCase();
  const cleEmail = String(participant.cle_email || "").trim().toLowerCase();
  const canView = Boolean(membership) || (cleEmail && cleEmail === userEmail);

  if (!canView) {
    return json({ error: "You do not have permission to view this note template." }, 403);
  }

  return json({
    participant,
    viewerRole: membership ? "admin" : "cle",
  });
}
