import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const file = new URL("../app/api/worker/submit-note/route.js", import.meta.url);
const source = (await readFile(file, "utf8"))
  .replace('import { createClient } from "@supabase/supabase-js";', "const createClient = () => globalThis.overnightTestDb;")
  .replace('"../../../../lib/shift-dates.mjs"', JSON.stringify(new URL("../lib/shift-dates.mjs", import.meta.url).href));
const { POST } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";

function mockDb(results) {
  const calls = [];
  globalThis.overnightTestDb = {
    auth: { getUser: async () => ({ data: { user: { id: "worker-login" } } }) },
    from(table) {
      const chain = {};
      for (const method of ["select", "eq", "lte", "or", "in", "insert", "update", "delete"]) {
        chain[method] = (...args) => { calls.push([table, method, ...args]); return chain; };
      }
      chain.maybeSingle = chain.single = async () => results.shift();
      chain.then = (resolve, reject) => Promise.resolve(results.shift()).then(resolve, reject);
      return chain;
    },
  };
  return calls;
}
const setup = () => ["worker", "assignment", "participant", "service"].map(id => ({ data: { id } }));
function submit(overrides = {}) {
  return POST(new Request("https://test.invalid/api/worker/submit-note", {
    method: "POST", headers: { Authorization: "Bearer test" },
    body: JSON.stringify({
      participantId: "participant", shiftDate: "2026-11-13", shiftEndDate: "2026-11-14",
      timeIn: "21:00", timeOut: "06:00", service: "Companion", location: "home",
      noteText: "Fictional note.", signatureAttested: true, typedSignature: "Test Worker", ...overrides,
    }),
  }));
}
test("persists overnight dates and records completion on the server", async () => {
  const calls = mockDb([...setup(), { data: [] }, { data: { id: "note" } }, {},
    { data: { id: "note", date_completed: "2026-11-14", signed_at: "2026-11-14T11:00:00Z" } }]);
  assert.equal((await submit({ dateCompleted: "2001-01-01" })).status, 201);
  const values = calls.find(([table, method]) => table === "service_notes" && method === "insert")[2];
  assert.equal(values.shift_end_date, "2026-11-14");
  assert.equal(values.status, "draft");
  const finalized = calls.find(([table, method]) => table === "service_notes" && method === "update")[2];
  assert.equal(finalized.status, "submitted");
  assert.notEqual(finalized.date_completed, "2001-01-01");
  assert.ok(finalized.signed_at);
});
test("an overnight submission rejects an overlap on the end date before saving", async () => {
  const calls = mockDb([...setup(), { data: [{ shift_date: "2026-11-14", shift_end_date: null,
    time_in: "05:30:00", time_out: "07:30:00" }] }]);
  assert.equal((await submit()).status, 409);
  assert.ok(calls.some(([table, method, field, value]) =>
    table === "service_notes" && method === "lte" && field === "shift_date" && value === "2026-11-14"));
  assert.ok(!calls.some(([, method]) => method === "insert"));
});
test("a required prompt level must still be filled in", async () => {
  const calls = mockDb([...setup(), { data: [] }, { data: [{ id: "goal", goal_label: "Evening routine", requires_prompt_level: true }] }]);
  assert.equal((await submit({ selectedGoals: ["goal"] })).status, 400);
  assert.ok(!calls.some(([, method]) => method === "insert"));
});
