export function categoryName(value) {
  return value?.trim() || "Uncategorized";
}

export function categoryKey(value) {
  return categoryName(value).toLowerCase();
}

export function groupGoals(goals, order, alphabetical = false) {
  const groups = new Map();
  for (const goal of goals) {
    const category = categoryName(goal.category_name);
    const key = categoryKey(category);
    if (!groups.has(key)) groups.set(key, { key, category, goals: [] });
    groups.get(key).goals.push(goal);
  }
  const positions = new Map((order || []).map((key, index) => [key, index]));
  return [...groups.values()].sort((a, b) =>
    (positions.get(a.key) ?? Infinity) - (positions.get(b.key) ?? Infinity) ||
    (alphabetical || positions.size ? a.category.localeCompare(b.category) : 0)
  );
}

export function managementGoalGroups(participant) {
  const goals = (participant?.participant_goals || []).filter(goal => goal.active).sort((a, b) =>
    (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
    (a.goal_label || "").localeCompare(b.goal_label || "")
  );
  return groupGoals(goals, participant?.goal_category_order, true);
}

export function noteGoalGroups(goals, order) {
  if (order?.length) return groupGoals(goals, order);
  // Keep the template's existing grouping until an order is explicitly saved.
  const groups = Object.create(null);
  for (const goal of goals) (groups[goal.category_name || "Goals"] ??= []).push(goal);
  return Object.entries(groups).map(([category, entries]) => ({ category, goals: entries }));
}

export function moveCategory(groups, index, direction) {
  const next = index + direction;
  if (index < 0 || index >= groups.length || next < 0 || next >= groups.length) return null;
  const keys = groups.map(group => group.key);
  [keys[index], keys[next]] = [keys[next], keys[index]];
  return keys;
}

export function matchesActiveCategories(order, goals) {
  if (!Array.isArray(order) || !order.length || new Set(order).size !== order.length) return false;
  const active = new Set(goals.map(goal => categoryKey(goal.category_name)));
  return order.length === active.size && order.every(key => active.has(key));
}
