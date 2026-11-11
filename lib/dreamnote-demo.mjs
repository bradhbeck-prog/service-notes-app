// Fictional fixtures only. Never import a live data client into the demo.
export const participant = "Jordan Ellis";
export const workers = ["Alex Parker", "Sam Avery"];
export const services = {
  ihcs: "In-Home and Community Supports",
  companion: "Companion",
};
export const prompts = ["Independent", "Verbal Prompt", "Gesture Prompt", "Modeling"];
export const goals = [
  { id: "meal", category: "Daily living", label: "Plan and prepare a meal", services: ["ihcs"], question: "What did Jordan prepare, and what help was needed?", prompt: true },
  { id: "checklist", category: "Daily living", label: "Follow a household checklist", services: ["ihcs"], question: "Which tasks did Jordan complete?" },
  { id: "evening", category: "Daily living", label: "Follow an evening routine", services: ["companion"], question: "What support did Jordan receive during the routine?" },
  { id: "leisure", category: "Community participation", label: "Choose a leisure activity", services: ["companion"] },
  { id: "community", category: "Community participation", label: "Participate in a community activity", services: ["ihcs", "companion"], question: "Where did you go and what did Jordan do?" },
  { id: "choice", category: "Self-advocacy", label: "Express a preference", services: ["ihcs", "companion"] },
];
export const outcomes = [
  { title: "Build daily living skills", text: "Jordan builds independence with household routines and meal preparation.", services: ["ihcs"] },
  { title: "Choose meaningful activities", text: "Jordan chooses enjoyable activities at home and in the community.", services: ["ihcs", "companion"] },
];

export const sampleNotes = [
  { id: "sample-1", date: "2026-11-10", start: "09:00", end: "12:00", worker: workers[0], service: "ihcs", location: "Home", narrative: "Jordan chose a recipe, made a grocery list, and prepared lunch. We reviewed the kitchen checklist together before cleaning up.", responses: [{ label: goals[0].label, prompt: "Verbal Prompt", detail: "Jordan prepared soup and needed two reminders to check the recipe." }], signed: workers[0], completed: "Nov 10, 2026, 12:10 PM ET" },
  { id: "sample-2", date: "2026-11-09", start: "17:00", end: "19:00", worker: workers[1], service: "companion", location: "Home", narrative: "Jordan chose a card game and organized clothing for the following day. Jordan asked for a reminder about the evening checklist.", responses: [{ label: goals[2].label, detail: "Reviewed the evening checklist together." }, { label: goals[3].label }], signed: workers[1], completed: "Nov 9, 2026, 7:15 PM ET" },
  { id: "sample-3", date: "2026-11-08", start: "13:00", end: "15:00", worker: workers[0], service: "ihcs", location: "Community", narrative: "Jordan picked a book at the library and asked the librarian where to return it next week.", responses: [{ label: goals[4].label, detail: "Visited the library and practiced asking for help at the desk." }, { label: goals[5].label }], signed: workers[0], completed: "Nov 8, 2026, 3:08 PM ET" },
];

export function goalsForService(service) {
  return goals.filter(goal => goal.services.includes(service));
}

export function validatePracticeNote(note) {
  if (!Object.hasOwn(services, note.service)) return "Choose a service.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(note.date)) return "Choose a service date.";
  if (![note.start, note.end].every(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || note.end <= note.start) {
    return "Choose an end time later than the start time.";
  }
  if (!["Home", "Community"].includes(note.location)) return "Choose a location.";
  if (!note.narrative.trim() || !note.signed.trim() || !note.attested) return "Complete the note and certify the practice signature.";
  const available = new Map(goalsForService(note.service).map(goal => [goal.id, goal]));
  if (!note.responses.length) return "Choose at least one goal.";
  for (const response of note.responses) {
    const goal = available.get(response.id);
    if (!goal) return "Choose goals for the selected service.";
    if (goal.prompt && !prompts.includes(response.prompt)) return "Choose the required prompt level.";
    if (goal.question && !response.detail?.trim()) return "Answer the required goal question.";
  }
  return "";
}

export async function createDemoPdf(note) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(regular.getCharacterSet());
  const clean = value => [...String(value ?? "").replace(/\r\n?/g, "\n")].map(ch => ch === "\n" || supported.has(ch.codePointAt(0)) ? ch : "?").join("");
  const ink = rgb(.16, .18, .2), teal = rgb(.03, .47, .43);
  let page, y;
  function newPage() {
    page = pdf.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 784, width: 612, height: 8, color: teal });
    page.drawText("DreamNote | DEMO - FICTIONAL RECORD", { x: 48, y: 746, size: 13, font: bold, color: teal });
    page.drawText("Practice only. Not a service record.", { x: 48, y: 48, size: 10, font: regular, color: ink });
    y = 713;
  }
  function line(text, size, font) {
    if (y < 75) newPage();
    page.drawText(text, { x: 48, y, size, font, color: ink });
    y -= size + 5;
  }
  function block(value, size = 11, font = regular) {
    for (const paragraph of clean(value).split("\n")) {
      let row = "";
      for (const word of paragraph.split(/\s+/)) {
        const next = row ? `${row} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= 516) { row = next; continue; }
        if (row) line(row, size, font);
        row = "";
        for (const ch of word) {
          if (font.widthOfTextAtSize(row + ch, size) > 516) { line(row, size, font); row = ""; }
          row += ch;
        }
      }
      line(row, size, font);
    }
    y -= 5;
  }
  newPage();
  pdf.setTitle("DreamNote demonstration service note");
  block("Service Note", 22, bold);
  block(`Participant: ${participant}\nWorker: ${note.worker}\nService: ${services[note.service]}\nDate: ${note.date} | ${note.start} to ${note.end}\nLocation: ${note.location}`);
  block("Goals worked on", 14, bold);
  for (const goal of note.responses) {
    block(goal.label, 11, bold);
    if (goal.prompt) block(`Prompt level: ${goal.prompt}`);
    if (goal.detail) block(goal.detail);
  }
  block("Activities and support", 14, bold);
  block(note.narrative);
  block(`Sample signature: ${note.signed}\nCompleted: ${note.completed}`);
  return pdf.save();
}
