"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

function formatDate(value) {
  if (!value) return "Not set";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${Number(month)}/${Number(day)}/${String(year).slice(-2)}` : String(value);
}
function formatDateTime(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-US", { month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function SupportCoordinatorPortal() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [coordinator, setCoordinator] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [notes, setNotes] = useState([]);
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [workerFilter, setWorkerFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [downloadingNoteId, setDownloadingNoteId] = useState("");
  const [archiveMonth, setArchiveMonth] = useState("");
  const [downloadingArchive, setDownloadingArchive] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return void (window.location.href = "/login");
      const response = await fetch("/api/sc/portal", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error || "The Support Coordinator portal could not be loaded."); setLoading(false); return; }
      const loadedParticipants = result.participants || [];
      setCoordinator(result.coordinator); setParticipants(loadedParticipants); setNotes(result.notes || []);
      if (loadedParticipants.length === 1) setSelectedParticipantId(loadedParticipants[0].id);
      setLoading(false);
    }
    load();
  }, []);

  const selectedParticipant = participants.find((item) => item.id === selectedParticipantId) || null;
  const participantNotes = useMemo(() => notes.filter((note) => note.participant_id === selectedParticipantId), [notes, selectedParticipantId]);
  const workerOptions = [...new Set(participantNotes.map((note) => note.workers?.name).filter(Boolean))].sort();
  const serviceOptions = [...new Set(participantNotes.map((note) => note.service).filter(Boolean))].sort();
  const filteredNotes = participantNotes.filter((note) => (!dateFilter || note.shift_date === dateFilter) && (!workerFilter || note.workers?.name === workerFilter) && (!serviceFilter || note.service === serviceFilter));
  const monthOptions = useMemo(() => [...new Set(participantNotes.map((note) => String(note.shift_date || "").slice(0, 7)).filter((month) => /^\d{4}-\d{2}$/.test(month)))].sort().reverse(), [participantNotes]);
  useEffect(() => { setArchiveMonth(monthOptions[0] || ""); }, [selectedParticipantId, monthOptions]);

  async function authorizedDownload(url, fallbackName) {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${session?.access_token || ""}` } });
    if (!response.ok) throw new Error(await response.text());
    const blob = await response.blob();
    const fileName = (response.headers.get("content-disposition") || "").match(/filename="?([^";]+)"?/i)?.[1] || fallbackName;
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = objectUrl; link.download = fileName; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(objectUrl);
  }
  async function downloadNote(note) {
    setDownloadingNoteId(note.id); setMessage("");
    try { await authorizedDownload(`/api/sc/note-pdf/${note.id}`, "Service-Note.pdf"); } catch (error) { setMessage(error.message || "The PDF could not be downloaded."); } finally { setDownloadingNoteId(""); }
  }
  async function downloadArchive() {
    if (!archiveMonth || !selectedParticipantId) return;
    setDownloadingArchive(true); setMessage("");
    try { await authorizedDownload(`/api/sc/monthly-archive?participantId=${encodeURIComponent(selectedParticipantId)}&month=${encodeURIComponent(archiveMonth)}`, "Monthly-Service-Notes.pdf"); } catch (error) { setMessage(error.message || "The monthly archive could not be downloaded."); } finally { setDownloadingArchive(false); }
  }
  async function signOut() { await supabase.auth.signOut(); window.location.href = "/login"; }

  if (loading) return <main style={pageStyle}><h1>DreamNote Support Coordinator</h1><p>Loading…</p></main>;
  return <main style={pageStyle}>
    <header style={headerStyle}><div><h1 style={{ margin: 0 }}>DreamNote Support Coordinator</h1><p style={{ marginBottom: 0, color: "#5d6878" }}>Welcome, {coordinator?.name || "Support Coordinator"}.</p></div><button onClick={signOut} style={secondaryButton}>Sign Out</button></header>
    {message && <p role="status" style={{ padding: 12, borderRadius: 10, background: "#fff7cf", color: "#7c4a03" }}>{message}</p>}
    {!participants.length ? <section style={cardStyle}><p>No participants are assigned to this account yet.</p></section> : !selectedParticipant ? <section style={cardStyle}><h2 style={{ marginTop: 0 }}>Choose a participant</h2><p style={{ color: "#5d6878" }}>Select whose submitted service notes you want to review.</p><div style={{ display: "grid", gap: 10 }}>{participants.map((participant) => <button key={participant.id} onClick={() => setSelectedParticipantId(participant.id)} style={{ ...primaryButton, justifyContent: "flex-start" }}>{participant.name}</button>)}</div></section> : <>
      <section style={cardStyle}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><div><h2 style={{ margin: 0 }}>{selectedParticipant.name}</h2><p style={{ color: "#5d6878", marginBottom: 0 }}>{participantNotes.length} submitted service note{participantNotes.length === 1 ? "" : "s"}</p></div>{participants.length > 1 && <button onClick={() => setSelectedParticipantId("")} style={secondaryButton}>Choose Another Participant</button>}</div></section>
      <details open style={cardStyle}><summary style={summaryStyle}>Submitted Service Notes</summary>
        <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "var(--dn-yellow-pale)", border: "1px solid #f3d66c" }}><h3 style={{ marginTop: 0 }}>Monthly Archive</h3><p>Download one combined PDF for county review or recordkeeping.</p>{monthOptions.length ? <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><select value={archiveMonth} onChange={(event) => setArchiveMonth(event.target.value)} style={inputStyle}>{monthOptions.map((month) => <option key={month} value={month}>{new Date(`${month}-01T12:00:00`).toLocaleString("en-US", { month: "long", year: "numeric" })}</option>)}</select><button onClick={downloadArchive} disabled={downloadingArchive} style={primaryButton}>{downloadingArchive ? "Preparing…" : "Download Monthly Archive"}</button></div> : <p>No monthly archive is available yet.</p>}</div>
        {!!participantNotes.length && <details style={{ marginTop: 14 }}><summary style={{ cursor: "pointer", fontWeight: 700 }}>Filter notes</summary><div style={{ display: "grid", gap: 10, marginTop: 10, maxWidth: 520 }}><label>Date<input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} style={inputStyle} /></label>{workerOptions.length > 1 && <label>Worker<select value={workerFilter} onChange={(e) => setWorkerFilter(e.target.value)} style={inputStyle}><option value="">All workers</option>{workerOptions.map((name) => <option key={name}>{name}</option>)}</select></label>}{serviceOptions.length > 1 && <label>Service<select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} style={inputStyle}><option value="">All services</option>{serviceOptions.map((name) => <option key={name}>{name}</option>)}</select></label>}<button onClick={() => { setDateFilter(""); setWorkerFilter(""); setServiceFilter(""); }} style={secondaryButton}>Clear Filters</button></div></details>}
        <div style={{ marginTop: 14, maxHeight: 560, overflowY: "auto", display: "grid", gap: 9, padding: 8, border: "2px solid var(--dn-border)", borderRadius: 12, background: "var(--dn-blue-pale)" }}>{filteredNotes.map((note) => <article key={note.id} style={{ padding: 13, borderRadius: 10, background: "white", border: "1px solid var(--dn-border)" }}><strong>{note.title}</strong><div style={{ color: "#5d6878", margin: "5px 0" }}>Completed: {formatDate(note.date_completed)} · Signed: {formatDateTime(note.signed_at)}</div><button onClick={() => downloadNote(note)} disabled={downloadingNoteId === note.id} style={primaryButton}>{downloadingNoteId === note.id ? "Preparing…" : "Download PDF"}</button></article>)}{!filteredNotes.length && <p style={{ padding: 12 }}>No submitted notes match these filters.</p>}</div>
      </details>
    </>}
  </main>;
}

const pageStyle = { padding: 24, maxWidth: 980, margin: "0 auto", fontFamily: "Arial", color: "#1f2937" };
const headerStyle = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap", padding: 20, borderRadius: 20, border: "1px solid var(--dn-border)", background: "linear-gradient(135deg,var(--dn-blue-pale),white,var(--dn-pink-pale))" };
const cardStyle = { display: "block", marginTop: 18, padding: 20, borderRadius: 16, border: "1px solid var(--dn-border)", background: "white" };
const summaryStyle = { cursor: "pointer", fontSize: 24, fontWeight: 800, color: "#1f2937" };
const primaryButton = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 42, padding: "9px 15px", borderRadius: 8, border: "1px solid var(--dn-primary)", background: "var(--dn-primary)", color: "white", fontWeight: 700, cursor: "pointer" };
const secondaryButton = { ...primaryButton, background: "white", color: "var(--dn-blue)", borderColor: "var(--dn-border)" };
const inputStyle = { display: "block", width: "100%", minHeight: 42, marginTop: 5, padding: "8px 10px", border: "1px solid var(--dn-border)", borderRadius: 8, boxSizing: "border-box", fontSize: 15 };
