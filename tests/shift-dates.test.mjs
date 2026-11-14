import test from "node:test";
import assert from "node:assert/strict";
import { easternShiftDefaults, suggestedEndDate, shiftInterval, shiftsOverlap } from "../lib/shift-dates.mjs";

test("defaults use the Pennsylvania calendar even after UTC midnight", () => {
  assert.deepEqual(easternShiftDefaults(new Date("2026-11-14T02:00:00Z")), { date: "2026-11-13", time: "21:00" });
  assert.deepEqual(easternShiftDefaults(new Date("2026-11-14T05:00:00Z")), { date: "2026-11-14", time: "00:00" });
});

test("suggests the following calendar date only when the end time is earlier", () => {
  assert.equal(suggestedEndDate("2026-11-13", "09:00", "17:00"), "2026-11-13");
  assert.equal(suggestedEndDate("2026-12-31", "21:00", "06:00"), "2027-01-01");
  assert.equal(suggestedEndDate("2028-02-28", "21:00", "06:00"), "2028-02-29");
  assert.equal(suggestedEndDate("2026-11-13", "09:00", "09:00"), "2026-11-13");
});

test("accepts an overnight shift but rejects impossible or reversed dates and times", () => {
  assert.ok(shiftInterval("2026-11-13", "21:00", "2026-11-14", "06:00"));
  assert.equal(shiftInterval("2026-11-13", "21:00", "2026-11-13", "06:00"), null);
  assert.equal(shiftInterval("2026-11-13", "09:00", "2026-11-13", "09:00"), null);
  assert.equal(shiftInterval("2026-02-30", "09:00", "2026-03-01", "17:00"), null);
  assert.equal(shiftInterval("2026-11-13", "24:00", "2026-11-14", "06:00"), null);
});

test("overlap is checked on both days; adjacent shifts are allowed", () => {
  const overnight = shiftInterval("2026-11-13", "21:00", "2026-11-14", "06:00");
  assert.ok(shiftsOverlap(overnight, shiftInterval("2026-11-13", "20:00", "2026-11-13", "21:30")));
  assert.ok(shiftsOverlap(overnight, shiftInterval("2026-11-14", "05:30:00", "2026-11-14", "08:00:00")));
  assert.equal(shiftsOverlap(overnight, shiftInterval("2026-11-14", "06:00:00", "2026-11-14", "08:00:00")), false);
});
