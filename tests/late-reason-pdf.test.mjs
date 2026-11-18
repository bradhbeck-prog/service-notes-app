import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");
const { PDFDocument, PDFPage } = require("pdf-lib");
let source = await readFile(new URL("../app/api/generate-pdf/route.js", import.meta.url), "utf8");
const start = source.indexOf("async function loadAuthorizedNote(");
const end = source.indexOf("export async function POST", start);
source = source.slice(0, start) + "async function loadAuthorizedNote() { return globalThis.pdfReasonTestNote; }\n" + source.slice(end);
const { code } = transformSync(source, { filename: "route.js", jsc: { parser: { syntax: "ecmascript" }, target: "es2022" }, module: { type: "commonjs" } });
const module = { exports: {} };
new Function("module", "exports", "require", code)(module, module.exports, name =>
  name === "../../../lib/sendEmail" ? { sendServiceNoteEmail: async () => { throw new Error("Tests must not send email."); } } : require(name)
);
const { POST } = module.exports;

async function render(reason, extraNarrative = "") {
  globalThis.pdfReasonTestNote = {
    workerOwnsNote: true, corrections: [],
    note: {
      id: "sample", shift_date: "2026-11-14", shift_end_date: "2026-11-14",
      time_in: "09:00", time_out: "17:00", service: "Companion", location: "home",
      narrative: "Fictional service note for testing. " + extraNarrative,
      goals: [], service_note_goals: [], worker_signature_mode: "typed",
      worker_typed_signature: "Sample Worker", worker_signature_font: "Pacifico",
      date_completed: "2026-11-15", signed_at: "2026-11-15T16:00:00Z",
      late_submission_reason: reason,
      workers: { name: "Sample Worker" },
      participants: { name: "Sample Participant", participant_goals: [], participant_outcomes: [] },
    },
  };
  const drawn = [];
  const original = PDFPage.prototype.drawText;
  PDFPage.prototype.drawText = function(text, options) {
    drawn.push({ text, ...options });
    return original.call(this, text, options);
  };
  try {
    const response = await POST(new Request("https://test.invalid/api/generate-pdf", {
      method: "POST", headers: { Authorization: "Bearer test" },
      body: JSON.stringify({ noteId: "sample", lateSubmissionReason: "CLIENT VALUE MUST BE IGNORED" }),
    }));
    assert.equal(response.status, 200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (process.env.DREAMNOTE_PDF_QA && reason === "Internet service was down.") {
      await writeFile(process.env.DREAMNOTE_PDF_QA, bytes);
    }
    const document = await PDFDocument.load(bytes);
    return { drawn, document };
  } finally {
    PDFPage.prototype.drawText = original;
  }
}

test("PDF displays the saved late reason, never a supplied replacement", async () => {
  const { drawn } = await render("Internet service was down.");
  assert.ok(drawn.some(row => row.text === "Reason for late submission:"));
  assert.ok(drawn.some(row => row.text === "Internet service was down."));
  assert.ok(!drawn.some(row => row.text.includes("CLIENT VALUE")));
  assert.ok(drawn.some(row => row.text.startsWith("Submitted and signed")));
});

test("legacy or on-time notes do not gain an empty late-reason section", async () => {
  const { drawn } = await render(null);
  assert.ok(!drawn.some(row => row.text.includes("Reason for late submission")));
});

test("long reasons stay inside the page and long notes paginate", async () => {
  const { drawn, document } = await render("x".repeat(500), "Practiced the routine with support. ".repeat(180));
  assert.ok(document.getPageCount() > 1);
  let inReason = false;
  for (const row of drawn) {
    if (row.text.startsWith("Reason for late submission")) inReason = true;
    if (inReason && /^x+$/.test(row.text)) {
      assert.ok(row.y >= 55);
      assert.ok(row.font.widthOfTextAtSize(row.text, row.size) <= 512);
    }
  }
});
