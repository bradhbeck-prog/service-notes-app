import { categoryKey, matchesActiveCategories } from "./goal-category-order.mjs";

// Call only after the portal has authorized this participant.
export async function saveGoalCategoryOrder(admin, participantId, order) {
  const { data: goals, error: loadError } = await admin.from("participant_goals").select("category_name")
    .eq("participant_id", participantId).eq("active", true);
  if (loadError) return { status: 500, body: { error: "Could not load the participant’s goal categories." } };
  if (!matchesActiveCategories(order, goals || [])) {
    return { status: 409, body: { error: "Goal categories changed. Refresh the page and try again." } };
  }
  const { data, error } = await admin.from("participants").update({ goal_category_order: order })
    .eq("id", participantId).eq("active", true).select("id").maybeSingle();
  if (error || !data) return { status: 500, body: { error: "Category order could not be saved." } };
  return { status: 200, body: { message: "Goal category order saved." } };
}

export async function updateRenamedCategoryPosition(admin, participant, from, to) {
  const order = participant.goal_category_order || [];
  const fromKey = categoryKey(from);
  const toKey = to == null ? null : categoryKey(to);
  if (!order.includes(fromKey) || fromKey === toKey) return true;
  const next = order.flatMap(key => key !== fromKey ? [key] : toKey && !order.includes(toKey) ? [toKey] : []);
  const { data, error } = await admin.from("participants").update({ goal_category_order: next })
    .eq("id", participant.id).eq("active", true).select("id").maybeSingle();
  return !error && Boolean(data);
}
