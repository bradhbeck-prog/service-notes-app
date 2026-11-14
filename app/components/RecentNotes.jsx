"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
const panel = { margin: "14px 0", padding: 16, border: "1px solid var(--dn-border)", borderRadius: 12, background: "var(--dn-blue-pale, #eef6ff)" };
async function call(participantId, settings, noteLimit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in again.");
  const response = await fetch(`/api/worker/recent-notes?participantId=${encodeURIComponent(participantId)}${settings ? "&settings=1" : ""}`, {
    method: noteLimit === undefined ? "GET" : "POST", cache: "no-store",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    ...(noteLimit === undefined ? {} : { body: JSON.stringify({ participantId, noteLimit }) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Recent notes are unavailable.");
  return result;
}
export function RecentNoteSettings({ participantId, readOnly = false }) {
  const [limit, setLimit] = useState(0), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    let active = true; setLoaded(false); setMessage("");
    call(participantId, true).then(result => { if (active) { setLimit(result.noteLimit); setLoaded(true); } }).catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [participantId]);
  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { const result = await call(participantId, true, limit); setMessage(result.message); } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  return <section style={panel}>
    <h3 style={{ marginTop: 0 }}>Worker access to recent notes</h3>
    <p>You can allow currently assigned workers to read the most recent submitted notes for this participant, including notes by other workers. This does not allow editing or downloading PDFs.</p>
    <form onSubmit={save}>
      <label>Access <select disabled={!loaded || busy || readOnly} value={limit} onChange={event => setLimit(Number(event.target.value))} style={{ font: "inherit", maxWidth: "100%", padding: 8 }}>
        <option value={0}>Off — no access</option><option value={5}>Last 5 notes</option><option value={10}>Last 10 notes</option>
      </select></label>
      {!readOnly && <button type="submit" disabled={!loaded || busy} style={{ margin: 8 }}>{busy ? "Saving…" : "Save access"}</button>}
    </form>
    <p style={{ fontSize: 14 }}>Off by default. Turning it off prevents future viewing; it cannot undo anything already read or copied.</p>
    {readOnly && <p>Only the CLE can change this setting. This preview is read-only.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
export function WorkerRecentNotes({ participantId }) {
  const [open, setOpen] = useState(false), [notes, setNotes] = useState([]), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  useEffect(() => { setOpen(false); setNotes([]); setMessage(""); }, [participantId]);
  // Clear sensitive content when leaving this section; check permission every time it opens.
  async function toggle() {
    if (open) { setOpen(false); setNotes([]); return; }
    setOpen(true); setBusy(true); setNotes([]); setMessage("");
    try { const result = await call(participantId, false); setNotes(result.notes); if (!result.noteLimit) setMessage("The CLE has not enabled access to recent notes."); else if (!result.notes.length) setMessage("No submitted notes yet."); } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  return <section style={panel}>
    <button type="button" onClick={toggle} aria-expanded={open}>Recent service notes {open ? "▴" : "▾"}</button>
    {open && <div style={{ maxHeight: "60vh", overflowY: "auto", overscrollBehavior: "contain", marginTop: 12 }}>
      <p>Read-only examples for this participant. Complete your own note for the services you actually provide.</p>
      {busy && <p role="status">Loading…</p>}{message && <p role="status">{message}</p>}
      {notes.map(note => <details key={note.id} style={{ padding: 12, marginBottom: 10, background: "var(--dn-legacy-panel, white)", borderRadius: 8, overflowWrap: "anywhere" }}>
        <summary>{note.shift_date} · {note.service} · {note.workers?.name}</summary>
        <p>{note.time_in}–{note.shift_end_date && note.shift_end_date !== note.shift_date ? `${note.shift_end_date} ` : ""}{note.time_out} · {note.location}</p>
        {(note.goal_responses || []).map((goal, index) => <p key={index}>{goal.label}{goal.prompt ? ` — ${goal.prompt}` : ""}{goal.detail ? `: ${goal.detail}` : ""}</p>)}
        <p style={{ whiteSpace: "pre-wrap" }}>{note.narrative}</p>
        {note.corrections.map((row, index) => <aside key={index} style={{ ...panel, whiteSpace: "pre-wrap" }}><strong>Signed correction</strong><p>{row.correction_text}</p><p>Reason: {row.correction_reason}</p><p>{row.signed_name} · {new Date(row.submitted_at).toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" })}</p></aside>)}
      </details>)}
    </div>}
  </section>;
}
