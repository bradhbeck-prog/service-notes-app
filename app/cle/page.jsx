"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const DELIVERY_LABELS = {
  immediate: "Email each note when submitted",
  weekly: "Weekly digest",
  monthly: "Monthly digest only",
};

function formatDate(value) {
  if (!value) return "Not set";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (year && month && day) return `${Number(month)}/${Number(day)}/${String(year).slice(-2)}`;
  return String(value);
}

function formatDateTime(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ClePortalPage() {
  const [loading, setLoading] = useState(true);
  const [savingPreference, setSavingPreference] = useState(false);
  const [message, setMessage] = useState("");
  const [participant, setParticipant] = useState(null);
  const [notes, setNotes] = useState([]);
  const [preference, setPreference] = useState("immediate");
  const [dateFilter, setDateFilter] = useState("");
  const [workerFilter, setWorkerFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [downloadingNoteId, setDownloadingNoteId] = useState("");

  async function loadPortal() {
    setLoading(true);
    setMessage("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      window.location.href = "/login";
      return;
    }

    const response = await fetch("/api/cle/portal", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || "The CLE portal could not be loaded.");
      setLoading(false);
      return;
    }

    setParticipant(result.participant);
    setPreference(result.participant?.note_delivery_preference || "immediate");
    setNotes(result.notes || []);
    setLoading(false);
  }

  useEffect(() => {
    loadPortal();
  }, []);

  async function handleSavePreference() {
    setSavingPreference(true);
    setMessage("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      window.location.href = "/login";
      return;
    }

    const response = await fetch("/api/cle/portal", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ noteDeliveryPreference: preference }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || "Preference could not be saved.");
    } else {
      setMessage(result.message || "Preference saved.");
      setParticipant((current) =>
        current ? { ...current, note_delivery_preference: preference } : current
      );
    }

    setSavingPreference(false);
  }


  const workerOptions = Array.from(
    new Set(notes.map((note) => note.workers?.name).filter(Boolean))
  ).sort();

  const serviceOptions = Array.from(
    new Set(notes.map((note) => note.service).filter(Boolean))
  ).sort();

  const filteredNotes = notes.filter((note) => {
    if (dateFilter && note.shift_date !== dateFilter) return false;
    if (workerFilter && note.workers?.name !== workerFilter) return false;
    if (serviceFilter && note.service !== serviceFilter) return false;
    return true;
  });

  function clearFilters() {
    setDateFilter("");
    setWorkerFilter("");
    setServiceFilter("");
  }

  function getFileNameFromResponse(response, fallback) {
    const disposition = response.headers.get("content-disposition") || "";
    const match = disposition.match(/filename="?([^";]+)"?/i);
    return match?.[1] || fallback;
  }

  async function handleDownloadPdf(note, openInNewTab = false) {
    setDownloadingNoteId(note.id);
    setMessage("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      window.location.href = "/login";
      return;
    }

    try {
      const response = await fetch(`/api/cle/note-pdf/${note.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) {
        const errorText = await response.text();
        setMessage(errorText || "PDF could not be downloaded.");
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      if (openInNewTab) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = getFileNameFromResponse(response, "Service-Note.pdf");
        document.body.appendChild(a);
        a.click();
        a.remove();
      }

      setTimeout(() => window.URL.revokeObjectURL(url), 30000);
    } catch {
      setMessage("PDF could not be downloaded. Please try again.");
    } finally {
      setDownloadingNoteId("");
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <main style={{ padding: 30, fontFamily: "Arial", maxWidth: 900, margin: "0 auto" }}>
        <h1>DreamNote CLE Portal</h1>
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 30, fontFamily: "Arial", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>DreamNote CLE Portal</h1>
          <p style={{ marginTop: 0, color: "#4b5563" }}>
            Review service notes and delivery preferences for your participant.
          </p>
        </div>
        <button onClick={handleSignOut} style={{ padding: "8px 12px" }}>
          Sign Out
        </button>
      </div>

      {message ? <p style={{ color: message.includes("saved") ? "#059669" : "#b45309" }}>{message}</p> : null}

      {!participant ? (
        <section style={{ marginTop: 20, padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
          <p>No participant is linked to this CLE login yet.</p>
        </section>
      ) : (
        <>
          <section style={{ marginTop: 20, padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
            <h2 style={{ marginTop: 0 }}>{participant.name}</h2>
            <p style={{ marginBottom: 0 }}>
              CLE email: {participant.cle_email || "Not set"}
            </p>
          </section>

          <section style={{ marginTop: 20, padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
            <h2 style={{ marginTop: 0 }}>Note Delivery Preference</h2>
            <p style={{ color: "#4b5563" }}>
              Choose how you would like to receive service notes. Weekly and monthly digest delivery will be added soon.
            </p>
            <select
              value={preference}
              onChange={(e) => setPreference(e.target.value)}
              style={{ width: "100%", maxWidth: 420, padding: 10, fontSize: 16 }}
            >
              {Object.entries(DELIVERY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 12 }}>
              <button
                onClick={handleSavePreference}
                disabled={savingPreference}
                style={{ padding: "10px 14px", fontSize: 15 }}
              >
                {savingPreference ? "Saving..." : "Save Preference"}
              </button>
            </div>
          </section>

          <section style={{ marginTop: 20, padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
            <h2 style={{ marginTop: 0, marginBottom: 8 }}>Submitted Service Notes</h2>
            {notes.length === 0 ? (
              <p>No submitted notes yet.</p>
            ) : (
              <>
                <details style={{ marginBottom: 14 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                    Filter notes
                  </summary>
                  <div style={{ display: "grid", gap: 10, marginTop: 12, maxWidth: 520 }}>
                    <label>
                      Date
                      <input
                        type="date"
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                      />
                    </label>
                    {workerOptions.length > 1 && (
                      <label>
                        Worker
                        <select
                          value={workerFilter}
                          onChange={(e) => setWorkerFilter(e.target.value)}
                          style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                        >
                          <option value="">All workers</option>
                          {workerOptions.map((workerName) => (
                            <option key={workerName} value={workerName}>{workerName}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    {serviceOptions.length > 1 && (
                      <label>
                        Service
                        <select
                          value={serviceFilter}
                          onChange={(e) => setServiceFilter(e.target.value)}
                          style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                        >
                          <option value="">All services</option>
                          {serviceOptions.map((serviceName) => (
                            <option key={serviceName} value={serviceName}>{serviceName}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <button type="button" onClick={clearFilters} style={{ padding: "8px 10px", width: "fit-content" }}>
                      Clear filters
                    </button>
                  </div>
                </details>

                <p style={{ marginTop: 0, color: "#4b5563", fontSize: 14 }}>
                  Showing {filteredNotes.length} of {notes.length} notes.
                </p>

                {filteredNotes.length === 0 ? (
                  <p>No notes match those filters.</p>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {filteredNotes.map((note) => (
                      <div
                        key={note.id}
                        style={{
                          padding: 10,
                          border: "1px solid #e5e7eb",
                          borderRadius: 8,
                          display: "grid",
                          gap: 6,
                        }}
                      >
                        <strong>{note.title}</strong>
                        <div style={{ color: "#4b5563", fontSize: 14 }}>
                          Completed: {formatDate(note.date_completed)} · Signed: {formatDateTime(note.signed_at)}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            onClick={() => handleDownloadPdf(note, true)}
                            disabled={downloadingNoteId === note.id}
                            style={{ padding: "7px 10px" }}
                          >
                            View PDF
                          </button>
                          <button
                            onClick={() => handleDownloadPdf(note, false)}
                            disabled={downloadingNoteId === note.id}
                            style={{ padding: "7px 10px" }}
                          >
                            {downloadingNoteId === note.id ? "Preparing..." : "Download PDF"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}
