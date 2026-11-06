"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const box = { padding: 16, margin: "12px 0", border: "1px solid var(--dn-border)", borderRadius: 12, background: "var(--dn-yellow-pale, #fff9dc)" };
const field = { width: "100%", boxSizing: "border-box", padding: 10, margin: "6px 0 12px", font: "inherit", border: "1px solid #9cabb8", borderRadius: 8 };
function date(value) { return value ? new Date(value).toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" }) : "Not recorded"; }
async function api(body, noteId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in again.");
  const response = await fetch(`/api/note-corrections${noteId ? `?noteId=${encodeURIComponent(noteId)}` : ""}`, {
    method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The correction could not be loaded.");
  return result;
}

export function CleNoteCorrections({ noteId, readOnly = false }) {
  const [open, setOpen] = useState(false), [rows, setRows] = useState([]), [reason, setReason] = useState("");
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  async function load() { const result = await api(null, noteId); setRows(result.corrections); setLoaded(true); }
  async function toggle() {
    setOpen(!open);
    if (!open) { setBusy(true); try { await load(); } catch (error) { setMessage(error.message); } finally { setBusy(false); } }
  }
  async function act(body) {
    setBusy(true); setMessage("");
    try { const result = await api(body); setMessage(result.message); setReason(""); await load(); } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  return <div>
    <button type="button" onClick={toggle} aria-expanded={open}>Corrections</button>
    {open && <section style={box} aria-label="Note corrections">
      <p>The original note is preserved. Signed corrections are included in future PDF downloads.</p>
      {message && <p role="status">{message}</p>}
      {rows.map(row => <article key={row.id} style={{ borderBottom: "1px solid #bac8d4", padding: "10px 0", overflowWrap: "anywhere" }}>
        <strong>{row.status === "submitted" ? "Signed correction" : row.status === "revoked" ? "Canceled request" : "Awaiting worker correction"}</strong>
        <p>Requested {date(row.requested_at)}: {row.request_reason}</p>
        {row.status === "submitted" && <><p style={{ whiteSpace: "pre-wrap" }}>{row.correction_text}</p><p>Reason: {row.correction_reason}</p><p>Signed by {row.signed_name} · {date(row.submitted_at)}</p></>}
        {row.status === "pending" && !readOnly && <button type="button" disabled={busy} onClick={() => act({ action: "revoke", id: row.id })}>Cancel request</button>}
      </article>)}
      {readOnly && <p>CLEs can request a correction here. Requests cannot be sent from admin preview.</p>}
      {loaded && !readOnly && !rows.some(row => row.status === "pending") && <form onSubmit={event => { event.preventDefault(); act({ action: "request", noteId, reason }); }}>
        <label>What should the original worker correct?<textarea required maxLength={4000} value={reason} onChange={event => setReason(event.target.value)} style={field} /></label>
        <button disabled={busy} type="submit">{busy ? "Saving…" : "Request correction"}</button>
      </form>}
    </section>}
  </div>;
}

export function WorkerCorrections({ participantId }) {
  const [rows, setRows] = useState([]), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api().then(result => { if (active) setRows(result.corrections); }).catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [participantId]);
  async function submit(event, row) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    if (!window.confirm("Sign and submit this correction? It will be permanent and the original note will remain unchanged.")) return;
    setBusy(true); setMessage("");
    try {
      const result = await api({ action: "submit", id: row.id, correctionText: values.get("correctionText"), reason: values.get("reason"), signedName: values.get("signedName"), attested: values.get("attested") === "on" });
      setRows(current => current.filter(item => item.id !== row.id)); setMessage(result.message);
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  const visible = participantId ? rows.filter(row => row.participant_id === participantId) : rows;
  if (!visible.length && !message) return null;
  return <section style={box} aria-label="Corrections requested">
    <h2>Corrections requested</h2>
    {message && <p role="status">{message}</p>}
    {visible.map(row => {
      const note = row.original_note;
      return <details key={row.id} style={{ marginBottom: 12 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>{row.participants?.name} · {note.shift_date} · {note.service}</summary>
        <p>CLE request ({date(row.requested_at)}): {row.request_reason}</p>
        <details><summary>Read original note</summary>
          <p>{note.workers?.name} · {note.time_in}–{note.time_out} · {note.location}</p>
          <p>Originally submitted: {date(note.signed_at)}</p>
          {(note.service_note_goals || []).map((goal, index) => <p key={index}>{goal.participant_goals?.category_name} · {goal.participant_goals?.goal_label}{goal.prompt_level ? ` — ${goal.prompt_level}` : ""}</p>)}
          {(note.goal_response_snapshot || []).map(goal => <p key={goal.id}>{goal.goal_label} {goal.prompt_level && `— ${goal.prompt_level}`} {goal.detail_value}</p>)}
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{note.narrative}</p>
        </details>
        <form onSubmit={event => submit(event, row)}>
          <p>Enter a correction or clarification below. Identify the original statement or field and its corrected value. The original note and dates cannot be changed.</p>
          <label>Correction<textarea name="correctionText" required maxLength={12000} style={field} /></label>
          <label>Reason for correction<textarea name="reason" required maxLength={4000} style={field} /></label>
          <label>Type your full name to sign<input name="signedName" required maxLength={200} style={field} /></label>
          <label style={{ display: "block", marginBottom: 12 }}><input type="checkbox" name="attested" required /> I certify that this correction accurately reflects the services I provided.</label>
          <button type="submit" disabled={busy}>{busy ? "Submitting…" : "Sign and submit correction"}</button>
        </form>
      </details>;
    })}
  </section>;
}
