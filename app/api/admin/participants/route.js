import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const DEFAULT_PROMPT_LEVELS = [
  "Independent",
  "Verbal Prompt",
  "Gesture Prompt",
  "Modeling",
  "Partial Physical Prompt",
  "Hand Over Hand",
  "Full Physical Prompt",
];

const SERVICE_NAMES = new Set([
  "In-Home and Community Supports",
  "In-Home and Community Supports Enhanced",
  "Companion",
  "Day Respite",
  "15-Minute Respite",
]);

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function clean(value) {
  return String(value || "").trim();
}

function normalizeServiceName(value) {
  const serviceName = clean(value);
  return serviceName.toLowerCase() === "respite" ? "Day Respite" : serviceName;
}

export async function POST(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Participant creation is not available." }, 500);
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return json({ error: "Sign in again before continuing." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: userError } = await admin.auth.getUser(accessToken);
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
    return json({ error: "You do not have permission to add participants." }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const name = clean(body.name);
  const cleEmail = clean(body.cleEmail).toLowerCase();
  const serviceName = normalizeServiceName(body.serviceName);
  const outcomePhrase = clean(body.outcomePhrase);
  const outcomeStatement = clean(body.outcomeStatement);
  const outcomeActionPlan = clean(body.outcomeActionPlan);

  if (!name) return json({ error: "Enter participant name." }, 400);
  if (cleEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleEmail)) {
    return json({ error: "Enter a valid CLE email address." }, 400);
  }
  if (serviceName && !SERVICE_NAMES.has(serviceName)) {
    return json({ error: "Choose one of the approved DreamNote services." }, 400);
  }

  const { data: participant, error: participantError } = await admin
    .from("participants")
    .insert({
      workspace_id: membership.workspace_id,
      name,
      cle_email: cleEmail || null,
      service_name: serviceName || null,
      outcome_phrase: outcomePhrase || null,
      active: true,
      prompt_levels: DEFAULT_PROMPT_LEVELS,
    })
    .select("id, name")
    .single();
  if (participantError || !participant) {
    return json({ error: participantError?.message || "The participant could not be created." }, 400);
  }

  const rollback = async (message) => {
    await admin.from("participants").delete().eq("id", participant.id).eq("workspace_id", membership.workspace_id);
    return json({ error: message }, 400);
  };

  if (outcomePhrase || outcomeStatement || outcomeActionPlan) {
    const { error } = await admin.from("participant_outcomes").insert({
      participant_id: participant.id,
      outcome_phrase: outcomePhrase,
      outcome_statement: outcomeStatement,
      outcome_action_plan: outcomeActionPlan,
    });
    if (error) return rollback(`The participant was not added because the outcome could not be saved: ${error.message}`);
  }

  if (serviceName) {
    const { error } = await admin.from("participant_services").insert({
      participant_id: participant.id,
      service_name: serviceName,
      active: true,
    });
    if (error) return rollback(`The participant was not added because the service could not be saved: ${error.message}`);
  }

  return json({
    participant,
    message: `${participant.name} was added successfully.`,
  }, 201);
}
