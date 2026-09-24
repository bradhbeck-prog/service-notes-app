import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function getCleContext(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return { response: json({ error: "Goal management is not configured." }, 500) };
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return { response: json({ error: "Sign in again before continuing." }, 401) };

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !user?.email) {
    return { response: json({ error: "Your login session is invalid or expired." }, 401) };
  }

  const { data: participant, error: participantError } = await admin
    .from("participants")
    .select("id, name")
    .eq("active", true)
    .ilike("cle_email", user.email.trim().toLowerCase())
    .limit(1)
    .maybeSingle();
  if (participantError || !participant) {
    return { response: json({ error: "No active CLE participant is linked to this login." }, 403) };
  }

  return { admin, participant };
}

export async function POST(request) {
  const context = await getCleContext(request);
  if (context.response) return context.response;
  const { admin, participant } = context;

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const action = String(body.action || "");

  if (body.participantId && String(body.participantId) !== participant.id) {
    return json({ error: "You can only manage goals for your linked participant." }, 403);
  }

  if (action === "save_prompt_levels") {
    const promptLevels = [...new Set(
      (Array.isArray(body.promptLevels) ? body.promptLevels : [])
        .map((level) => String(level || "").trim())
        .filter(Boolean)
    )];
    if (!promptLevels.length) return json({ error: "Choose at least one prompt level." }, 400);
    if (promptLevels.length > 20 || promptLevels.some((level) => level.length > 80)) {
      return json({ error: "The prompt-level selection is invalid." }, 400);
    }

    const { data: updated, error } = await admin.from("participants")
      .update({ prompt_levels: promptLevels })
      .eq("id", participant.id)
      .eq("active", true)
      .select("id")
      .maybeSingle();
    if (error || !updated) {
      return json({ error: error?.message || "Prompt levels could not be saved." }, 400);
    }
    return json({ message: `Prompt levels saved for ${participant.name}.`, promptLevels });
  }

  if (action === "save_goal") {
    const goal = body.goal || {};
    const goalId = String(goal.id || "");
    const categoryName = String(goal.categoryName || "Goals").trim() || "Goals";
    const goalLabel = String(goal.goalLabel || "").trim();
    const requestedServiceIds = [...new Set((Array.isArray(goal.serviceIds) ? goal.serviceIds : []).map(String))];
    if (!goalLabel) return json({ error: "Enter the goal description." }, 400);

    const { data: activeServices, error: serviceError } = await admin.from("participant_services")
      .select("id").eq("participant_id", participant.id).eq("active", true);
    if (serviceError) return json({ error: serviceError.message }, 400);
    const activeServiceIds = (activeServices || []).map((service) => service.id);
    const validServiceIds = requestedServiceIds.filter((id) => activeServiceIds.includes(id));
    if (activeServiceIds.length && !validServiceIds.length) {
      return json({ error: "Choose at least one service for this goal." }, 400);
    }

    let existingGoal = null;
    if (goalId) {
      const { data } = await admin.from("participant_goals")
        .select("id, category_name, sort_order")
        .eq("id", goalId).eq("participant_id", participant.id).maybeSingle();
      if (!data) return json({ error: "Goal not found for this participant." }, 404);
      existingGoal = data;
    }

    const categoryChanged = existingGoal && (existingGoal.category_name || "Goals") !== categoryName;
    let sortOrder = existingGoal?.sort_order || 1;
    if (!existingGoal || categoryChanged) {
      const { data: categoryGoals } = await admin.from("participant_goals")
        .select("sort_order").eq("participant_id", participant.id)
        .eq("category_name", categoryName).eq("active", true);
      sortOrder = Math.max(0, ...(categoryGoals || []).map((item) => Number(item.sort_order) || 0)) + 1;
    }

    const values = {
      participant_id: participant.id,
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
      ? await admin.from("participant_goals").update(values).eq("id", goalId)
        .eq("participant_id", participant.id).select("id").single()
      : await admin.from("participant_goals").insert(values).select("id").single();
    if (error || !saved) return json({ error: error?.message || "The goal could not be verified after saving." }, 400);
    return json({
      message: existingGoal ? `Goal updated under ${categoryName}.` : `Goal added under ${categoryName}.`,
      goalId: saved.id,
    });
  }

  if (action === "rename_category") {
    const oldCategory = String(body.oldCategory || "").trim();
    const newCategory = String(body.newCategory || "").trim();
    const goalIds = [...new Set((Array.isArray(body.goalIds) ? body.goalIds : []).map(String))];
    if (!oldCategory || !newCategory || !goalIds.length) {
      return json({ error: "Choose a category and enter its new name." }, 400);
    }

    const { data: renamed, error } = await admin.from("participant_goals")
      .update({ category_name: newCategory })
      .eq("participant_id", participant.id).eq("active", true).in("id", goalIds).select("id");
    if (error) return json({ error: error.message }, 400);
    if ((renamed || []).length !== goalIds.length) {
      return json({ error: "Not every goal in this category could be updated." }, 400);
    }
    return json({ message: `Category renamed from ${oldCategory} to ${newCategory}.` });
  }

  if (action === "archive_goal") {
    const goalId = String(body.goalId || "");
    const { data, error } = await admin.from("participant_goals").update({ active: false })
      .eq("id", goalId).eq("participant_id", participant.id).select("id").maybeSingle();
    if (error || !data) return json({ error: error?.message || "The goal was not removed." }, 400);
    return json({ message: "Goal removed from the active template." });
  }

  if (action === "reorder_goals") {
    const goalIds = [...new Set((Array.isArray(body.goalIds) ? body.goalIds : []).map(String))];
    if (!goalIds.length) return json({ error: "No goals were provided for reordering." }, 400);

    const { data: ownedGoals, error: ownedError } = await admin.from("participant_goals")
      .select("id").eq("participant_id", participant.id).eq("active", true).in("id", goalIds);
    if (ownedError) return json({ error: ownedError.message }, 400);
    if ((ownedGoals || []).length !== goalIds.length) {
      return json({ error: "One or more goals do not belong to this participant." }, 403);
    }

    for (let index = 0; index < goalIds.length; index += 1) {
      const { error } = await admin.from("participant_goals")
        .update({ sort_order: index + 1 }).eq("id", goalIds[index]).eq("participant_id", participant.id);
      if (error) return json({ error: error.message }, 400);
    }
    return json({ message: "Goal order saved." });
  }

  return json({ error: "Unknown goal action." }, 400);
}
