import test from "node:test";
import assert from "node:assert/strict";
import { managementGoalGroups, matchesActiveCategories, moveCategory, noteGoalGroups } from "../lib/goal-category-order.mjs";

const goals = [
  { id: "life-1", category_name: "Daily Living", sort_order: 1, active: true },
  { id: "community-1", category_name: "Community", sort_order: 1, active: true },
  { id: "life-2", category_name: "Daily Living", sort_order: 2, active: true },
  { id: "archive", category_name: "Archived", active: false },
];

test("category moves preserve goal order and apply to service-filtered templates", () => {
  const groups = managementGoalGroups({ participant_goals: goals });
  assert.deepEqual(groups.map(group => group.category), ["Community", "Daily Living"]);
  const order = moveCategory(groups, 1, -1);
  assert.deepEqual(order, ["daily living", "community"]);
  const updated = managementGoalGroups({ participant_goals: goals, goal_category_order: order });
  assert.deepEqual(updated.flatMap(group => group.goals.map(goal => goal.id)), ["life-1", "life-2", "community-1"]);
  assert.deepEqual(noteGoalGroups(goals.slice(1, 3), order).map(group => group.category), ["Daily Living", "Community"]);
  assert.deepEqual(noteGoalGroups(goals.slice(1, 2), order).map(group => group.category), ["Community"]);
  assert.equal(moveCategory(groups, 0, -1), null);
});

test("legacy form order is preserved, and new categories follow the saved order", () => {
  assert.deepEqual(noteGoalGroups(goals.slice(0, 3), []).map(group => group.category), ["Daily Living", "Community"]);
  assert.deepEqual(noteGoalGroups(goals.slice(0, 3), ["community", "removed"]).map(group => group.category), ["Community", "Daily Living"]);
  assert.equal(noteGoalGroups([{ category_name: null }], [])[0].category, "Goals");
});

test("save only accepts every active category exactly once", () => {
  const active = goals.filter(goal => goal.active);
  assert.ok(matchesActiveCategories(["daily living", "community"], active));
  assert.ok(!matchesActiveCategories(["daily living"], active));
  assert.ok(!matchesActiveCategories(["daily living", "daily living"], active));
  assert.ok(!matchesActiveCategories(["daily living", "archived"], active));
  assert.ok(matchesActiveCategories(["uncategorized"], [{ category_name: null }, { category_name: " UNCATEGORIZED " }]));
});
