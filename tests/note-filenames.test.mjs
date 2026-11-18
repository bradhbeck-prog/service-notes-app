import test from "node:test";
import assert from "node:assert/strict";
import { getParticipantInitials } from "../lib/note-filenames.mjs";

test("quoted nicknames do not truncate PDF download headers", () => {
  for (const name of ['Nancy "Jane" Barnes', "Nancy “Jane” Barnes", "Nancy 'Jane' Barnes"]) {
    const fileName = getParticipantInitials(name) + "-11-18-26-Companion-Service-Note.pdf";
    const response = new Response(null, { headers: { "Content-Disposition": `attachment; filename="${fileName}"` } });
    const parsed = response.headers.get("content-disposition").match(/filename="?([^";]+)"?/i)?.[1];
    assert.equal(parsed, "NJB-11-18-26-Companion-Service-Note.pdf");
  }
});
test("ordinary names retain their initials; punctuation and accents are safe", () => {
  assert.equal(getParticipantInitials("Nancy Barnes"), "NB");
  assert.equal(getParticipantInitials("  Nancy   Jane  Barnes "), "NJB");
  assert.equal(getParticipantInitials("José O’Connor"), "JO");
  assert.equal(getParticipantInitials('";\r\n'), "PR");
  assert.equal(getParticipantInitials(null), "PR");
});
