import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SERVICE_NAMES = [
  "In-Home and Community Supports",
  "In-Home and Community Supports Enhanced",
  "Companion",
  "Day Respite",
  "15-Minute Respite",
];

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function getAdminContext(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return { response: json({ error: "Participant configuration is not available." }, 500) };
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return { response: json({ error: "Sign in again before continuing." }, 401) };

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !user) return { response: json({ error: "Your login session is invalid or expired." }, 401) };

  const { data: membership, error: membershipError } = await admin.from("workspace_memberships")
    .select("workspace_id, role").eq("user_id", user.id).eq("active", true)
    .in("role", ["owner", "admin"]).limit(1).maybeSingle();
  if (membershipError || !membership) {
    return { response: json({ error: "You do not have permission to manage participant settings." }, 403) };
  }
  return { admin, membership };
}

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.response) return context.response;
  const { admin, membership } = context;

  const { data: participants, error } = await admin.from("participants").select(`
    id, name, cle_email, active, service_name, workspace_id, prompt_levels,
    participant_services (id, service_name, active),
    participant_goals (
      id, participant_id, participant_service_id, applicable_service_ids, goal_label, category_name,
      sort_order, active, requires_detail, requires_prompt_level, detail_prompt
    )
  `).eq("workspace_id", membership.workspace_id).eq("active", true).order("name");
  if (error) return json({ error: error.message }, 400);
  return json({ participants: participants || [] });
}

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.response) return context.response;
  const { admin, membership } = context;

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const action = String(body.action || "");
  const participantId = String(body.participantId || "");
  if (!participantId) return json({ error: "Choose a participant." }, 400);

  const { data: participant } = await admin.from("participants").select("id, name")
    .eq("id", participantId).eq("workspace_id", membership.workspace_id).eq("active", true).maybeSingle();
  if (!participant) return json({ error: "Participant not found in your workspace." }, 404);

  if (action === "save_services") {
    const selectedNames = [...new Set((Array.isArray(body.serviceNames) ? body.serviceNames : []).map(String))]
      .filter((name) => SERVICE_NAMES.includes(name));
    if (!selectedNames.length) return json({ error: "Choose at least one service." }, 400);

    const { data: existing, error: loadError } = await admin.from("participant_services")
      .select("id, service_name, active").eq("participant_id", participantId);
    if (loadError) return json({ error: loadError.message }, 400);

    for (const row of existing || []) {
      const shouldBeActive = selectedNames.includes(row.service_name) && row.service_name.trim().toLowerCase() !== "respite";
      if (Boolean(row.active) !== shouldBeActive) {
        const { error } = await admin.from("participant_services").update({ active: shouldBeActive }).eq("id", row.id);
        if (error) return json({ error: error.message }, 400);
      }
    }

    for (const serviceName of selectedNames) {
      if (!(existing || []).some((row) => row.service_name === serviceName)) {
        const { error } = await admin.from("participant_services")
          .insert({ participant_id: participantId, service_name: serviceName, active: true });
        if (error) return json({ error: error.message }, 400);
      }
    }

    const { data: verified, error: verifyError } = await admin.from("participant_services")
      .select("id, service_name, active").eq("participant_id", participantId).eq("active", true).order("service_name");
    if (verifyError) return json({ error: verifyError.message }, 400);
    const verifiedNames = (verified || []).map((row) => row.service_name).filter((name) => name.toLowerCase() !== "respite");
    if (selectedNames.some((name) => !verifiedNames.includes(name))) {
      return json({ error: "The services could not be verified after saving." }, 500);
    }
    return json({ message: `Services saved for ${participant.name}.`, services: verified });
  }

  if (action === "save_goal") {
    const goal = body.goal || {};
    const goalId = String(goal.id || "");
    const categoryName = String(goal.categoryName || "Goals").trim() || "Goals";
    const goalLabel = String(goal.goalLabel || "").trim();
    const requestedServiceIds = [...new Set((Array.isArray(goal.serviceIds) ? goal.serviceIds : []).map(String))];
    if (!goalLabel) return json({ error: "Enter the goal description." }, 400);

    const { data: activeServices, error: serviceError } = await admin.from("participant_services")
      .select("id").eq("participant_id", participantId).eq("active", true);
    if (serviceError) return json({ error: serviceError.message }, 400);
    const activeServiceIds = (activeServices || []).map((service) => service.id);
    const validServiceIds = requestedServiceIds.filter((id) => activeServiceIds.includes(id));
    if (activeServiceIds.length && !validServiceIds.length) return json({ error: "Choose at least one service for this goal." }, 400);

    let existingGoal = null;
    if (goalId) {
      const { data } = await admin.from("participant_goals")
        .select("id, category_name, sort_order").eq("id", goalId).eq("participant_id", participantId).maybeSingle();
      if (!data) return json({ error: "Goal not found for this participant." }, 404);
      existingGoal = data;
    }

    const categoryChanged = existingGoal && (existingGoal.category_name || "Goals") !== categoryName;
    let sortOrder = existingGoal?.sort_order || 1;
    if (!existingGoal || categoryChanged) {
      const { data: categoryGoals } = await admin.from("participant_goals")
        .select("sort_order").eq("participant_id", participantId).eq("category_name", categoryName).eq("active", true);
      sortOrder = Math.max(0, ...(categoryGoals || []).map((item) => Number(item.sort_order) || 0)) + 1;
    }

    const values = {
      participant_id: participantId,
      participant_service_id: null,
      applicable_service_ids: validServiceIds.length === activeServiceIds.length ? null : validServiceIds,
      category_name: categoryName,
      goal_label: goalLabel,
      requires_detail: Boolean(goal.requiresDetail),
      requires_prompt_level: Boolean(goal.requiresPromptLevel),
      detail_prompt: goal.requiresDetail ? String(goal.detailPrompt || "").trim() || null : null,
      active: true,
      sort_order: sortOrder,
    };
    const { data: saved, error } = existingGoal
      ? await admin.from("participant_goals").update(values).eq("id", goalId).eq("participant_id", participantId).select("id").single()
      : await admin.from("participant_goals").insert(values).select("id").single();
    if (error || !saved) return json({ error: error?.message || "The goal could not be verified after saving." }, 400);
    return json({ message: existingGoal ? `Goal updated under ${categoryName}.` : `Goal added under ${categoryName}.`, goalId: saved.id });
  }

  if (action === "archive_goal") {
    const goalId = String(body.goalId || "");
    const { data, error } = await admin.from("participant_goals").update({ active: false })
      .eq("id", goalId).eq("participant_id", participantId).select("id").maybeSingle();
    if (error || !data) return json({ error: error?.message || "The goal was not removed." }, 400);
    return json({ message: "Goal removed from the active template." });
  }

  if (action === "reorder_goals") {
    const goalIds = [...new Set((Array.isArray(body.goalIds) ? body.goalIds : []).map(String))];
    for (let index = 0; index < goalIds.length; index += 1) {
      const { data, error } = await admin.from("participant_goals").update({ sort_order: index + 1 })
        .eq("id", goalIds[index]).eq("participant_id", participantId).select("id").maybeSingle();
      if (error || !data) return json({ error: error?.message || "A goal could not be reordered." }, 400);
    }
    return json({ message: "Goal order saved." });
  }

  return json({ error: "Unknown participant configuration action." }, 400);
}
