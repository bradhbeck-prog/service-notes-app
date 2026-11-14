const eastern = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function easternShiftDefaults(now = new Date()) {
  const p = Object.fromEntries(eastern.formatToParts(now).map(({ type, value }) => [type, value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

function calendarDay(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000")) return null;
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date ? ms / 86400000 : null;
}

function minutes(time) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(\.\d+)?)?$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) + Number((match[3] || "0") + (match[4] || "")) / 60 : null;
}

export function suggestedEndDate(startDate, startTime, endTime) {
  const day = calendarDay(startDate);
  const start = minutes(startTime);
  const end = minutes(endTime);
  if (day === null || start === null || end === null || end >= start) return startDate;
  return new Date((day + 1) * 86400000).toISOString().slice(0, 10);
}

// Compare local service dates and wall-clock times, not submission timestamps.
export function shiftInterval(startDate, startTime, endDate, endTime) {
  const first = calendarDay(startDate);
  const last = calendarDay(endDate);
  const from = minutes(startTime);
  const to = minutes(endTime);
  if ([first, last, from, to].includes(null)) return null;
  const start = first * 1440 + from;
  const end = last * 1440 + to;
  return end > start ? { start, end } : null;
}

export function shiftsOverlap(a, b) {
  return Boolean(a && b && a.start < b.end && a.end > b.start);
}
