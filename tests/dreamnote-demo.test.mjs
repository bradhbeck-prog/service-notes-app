import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { createDemoPdf, goalsForService, sampleNotes, validatePracticeNote } from "../lib/dreamnote-demo.mjs";

test("each service displays its own goals and the shared goals", () => {
  assert.deepEqual(goalsForService("ihcs").map(goal => goal.id), ["meal", "checklist", "community", "choice"]);
  assert.deepEqual(goalsForService("companion").map(goal => goal.id), ["evening", "leisure", "community", "choice"]);
});

test("the practice note requires only the configured responses", () => {
  const valid = { ...sampleNotes[0], attested: true, responses: [{ id: "meal", detail: "Prepared lunch.", prompt: "Verbal Prompt" }] };
  assert.equal(validatePracticeNote(valid), "");
  assert.match(validatePracticeNote({ ...valid, responses: [{ id: "meal", detail: "Prepared lunch." }] }), /prompt level/i);
  assert.match(validatePracticeNote({ ...valid, responses: [{ id: "meal", prompt: "Verbal Prompt" }] }), /goal question/i);
  assert.match(validatePracticeNote({ ...valid, service: "companion" }), /selected service/i);
  assert.match(validatePracticeNote({ ...valid, end: valid.start }), /end time/i);
  assert.equal(validatePracticeNote({ ...valid, responses: [{ id: "choice" }] }), "");
});

test("sample PDFs are genuine PDFs and long practice notes paginate", async () => {
  for (const note of sampleNotes) {
    const doc = await PDFDocument.load(await createDemoPdf(note));
    assert.equal(doc.getPageCount(), 1);
    assert.match(doc.getTitle(), /demonstration/);
  }
  const long = await PDFDocument.load(await createDemoPdf({ ...sampleNotes[0], narrative: ("An example with curly quotes “like this” and emoji 🙂.\n").repeat(80) + "A".repeat(400) }));
  assert.ok(long.getPageCount() > 1);
});

test("the demo has no live client imports, requests or persistent storage", async () => {
  for (const path of ["../app/demo/page.jsx", "../lib/dreamnote-demo.mjs"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /supabase|fetch\s*\(|\/api\/|localStorage|sessionStorage|sendEmail/i);
  }
});
