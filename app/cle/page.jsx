"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const DELIVERY_OPTIONS = [
  { value: "immediate", label: "Email each note when submitted" },
  { value: "weekly", label: "Weekly digest" },
  { value: "monthly", label: "Monthly archive" },
];

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
  const [deliveryPreferences, setDeliveryPreferences] = useState(["immediate", "monthly"]);
  const [assignedWorkers, setAssignedWorkers] = useState([]);
  const [dateFilter, setDateFilter] = useState("");
  const [workerFilter, setWorkerFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [downloadingNoteId, setDownloadingNoteId] = useState("");
  const [archiveMonth, setArchiveMonth] = useState("");
  const [downloadingArchive, setDownloadingArchive] = useState(false);

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
    setDeliveryPreferences(
      Array.isArray(result.participant?.note_delivery_preferences) &&
        result.participant.note_delivery_preferences.length > 0
        ? result.participant.note_delivery_preferences
        : ["immediate", "monthly"]
    );
    setAssignedWorkers(result.assignedWorkers || []);
    const loadedNotes = result.notes || [];
    setNotes(loadedNotes);
    if (!archiveMonth && loadedNotes[0]?.shift_date) {
      setArchiveMonth(String(loadedNotes[0].shift_date).slice(0, 7));
    }
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
      body: JSON.stringify({ noteDeliveryPreferences: deliveryPreferences }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || "Preference could not be saved.");
    } else {
      setMessage(result.message || "Preferences saved.");
      setDeliveryPreferences(result.noteDeliveryPreferences || deliveryPreferences);
      setParticipant((current) =>
        current
          ? { ...current, note_delivery_preferences: result.noteDeliveryPreferences || deliveryPreferences }
          : current
      );
    }

    setSavingPreference(false);
  }


  function toggleDeliveryPreference(value, checked) {
    setDeliveryPreferences((current) => {
      if (checked) return [...new Set([...current, value])];
      const next = current.filter((item) => item !== value);
      return next.length > 0 ? next : current;
    });
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

  const archiveMonthOptions = Array.from(
    new Set(notes.map((note) => String(note.shift_date || "").slice(0, 7)).filter(Boolean))
  ).sort((a, b) => b.localeCompare(a));

  function formatArchiveMonth(month) {
    if (!month) return "";
    const [year, monthNumber] = month.split("-");
    const date = new Date(Date.UTC(Number(year), Number(monthNumber) - 1, 1));
    if (Number.isNaN(date.getTime())) return month;
    return date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
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

  async function handleDownloadMonthlyArchive() {
    if (!archiveMonth) {
      setMessage("Choose a month before downloading an archive.");
      return;
    }

    setDownloadingArchive(true);
    setMessage("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      window.location.href = "/login";
      return;
    }

    try {
      const response = await fetch(`/api/cle/monthly-archive?month=${encodeURIComponent(archiveMonth)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) {
        const errorText = await response.text();
        setMessage(errorText || "Monthly archive could not be downloaded.");
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getFileNameFromResponse(response, "Monthly-Service-Notes.pdf");
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 30000);
    } catch {
      setMessage("Monthly archive could not be downloaded. Please try again.");
    } finally {
      setDownloadingArchive(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }


  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const thisMonthNotes = notes.filter((note) => String(note.shift_date || "").slice(0, 7) === thisMonthKey);
  const cardStyle = {
    marginTop: 18,
    padding: 18,
    border: "1px solid #d9e7e4",
    borderRadius: 18,
    background: "#ffffff",
    boxShadow: "0 8px 24px rgba(31, 41, 55, 0.06)",
  };
  const statCardStyle = {
    padding: 14,
    border: "1px solid #d9e7e4",
    borderRadius: 14,
    background: "#f8fffd",
  };
  const primaryButtonStyle = {
    padding: "10px 14px",
    fontSize: 15,
    borderRadius: 10,
    border: "1px solid var(--dn-primary)",
    background: "var(--dn-primary)",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  };
  const secondaryButtonStyle = {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#1f2937",
    cursor: "pointer",
  };

  if (loading) {
    return (
      <main style={{ padding: 24, fontFamily: "Arial", maxWidth: 980, margin: "0 auto" }}>
        <h1>DreamNote CLE Portal</h1>
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "Arial", maxWidth: 980, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "flex-start",
          padding: 18,
          borderRadius: 22,
          background: "linear-gradient(135deg, #f0fdfa 0%, #ffffff 70%)",
          border: "1px solid #d9e7e4",
        }}
      >
        <div>
          <h1 style={{ marginBottom: 6 }}>DreamNote CLE Portal</h1>
          <p style={{ marginTop: 0, color: "#4b5563" }}>
            Review service notes and delivery preferences for your participant.
          </p>
        </div>
        <button onClick={handleSignOut} style={secondaryButtonStyle}>
          Sign Out
        </button>
      </div>

      {message ? <p style={{ color: message.includes("saved") ? "#059669" : "#b45309" }}>{message}</p> : null}

      {!participant ? (
        <section style={cardStyle}>
          <p>No participant is linked to this CLE login yet.</p>
        </section>
      ) : (
        <>
          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, marginBottom: 6 }}>{participant.name}</h2>
            <p style={{ marginTop: 0, color: "#4b5563" }}>
              CLE email: {participant.cle_email || "Not set"}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <div style={statCardStyle}>
                <div style={{ fontSize: 26, fontWeight: 800, color: "var(--dn-primary)" }}>{notes.length}</div>
                <div style={{ color: "#4b5563", fontSize: 14 }}>Submitted notes</div>
              </div>
              <div style={statCardStyle}>
                <div style={{ fontSize: 26, fontWeight: 800, color: "var(--dn-primary)" }}>{thisMonthNotes.length}</div>
                <div style={{ color: "#4b5563", fontSize: 14 }}>This month</div>
              </div>
              <div style={statCardStyle}>
                <div style={{ fontSize: 26, fontWeight: 800, color: "var(--dn-primary)" }}>{assignedWorkers.length}</div>
                <div style={{ color: "#4b5563", fontSize: 14 }}>Assigned workers</div>
              </div>
            </div>
          </section>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Assigned Workers</h2>
            {assignedWorkers.length === 0 ? (
              <p>No active workers are assigned yet.</p>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {assignedWorkers.map((worker) => (
                  <div
                    key={worker.id || worker.name}
                    style={{
                      padding: "8px 10px",
                      border: "1px solid #e5e7eb",
                      borderRadius: 999,
                      background: "#f8fffd",
                    }}
                  >
                    {worker.name}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Note Delivery Preferences</h2>
            <p style={{ color: "#4b5563" }}>
              Choose one or more ways you would like to receive service notes.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {DELIVERY_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    padding: 12,
                    border: deliveryPreferences.includes(option.value) ? "2px solid var(--dn-primary)" : "1px solid #d9e7e4",
                    borderRadius: 12,
                    background: deliveryPreferences.includes(option.value) ? "#ecfdf5" : "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={deliveryPreferences.includes(option.value)}
                    onChange={(e) => toggleDeliveryPreference(option.value, e.target.checked)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <button
                onClick={handleSavePreference}
                disabled={savingPreference}
                style={primaryButtonStyle}
              >
                {savingPreference ? "Saving..." : "Save Preferences"}
              </button>
            </div>
          </section>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Monthly Archive</h2>
            <p style={{ color: "#4b5563" }}>
              Download one combined PDF for a calendar month. Each service note starts on its own page.
            </p>
            {archiveMonthOptions.length === 0 ? (
              <p>No submitted notes are available for an archive yet.</p>
            ) : (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={archiveMonth}
                  onChange={(e) => setArchiveMonth(e.target.value)}
                  style={{ padding: 10, fontSize: 16, minWidth: 220, borderRadius: 10, border: "1px solid #cbd5e1" }}
                >
                  {archiveMonthOptions.map((month) => (
                    <option key={month} value={month}>
                      {formatArchiveMonth(month)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleDownloadMonthlyArchive}
                  disabled={downloadingArchive}
                  style={primaryButtonStyle}
                >
                  {downloadingArchive ? "Preparing archive..." : "Download Monthly Archive"}
                </button>
              </div>
            )}
          </section>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, marginBottom: 8 }}>Submitted Service Notes</h2>
            {notes.length === 0 ? (
              <p>No submitted notes yet.</p>
            ) : (
              <>
                <details style={{ marginBottom: 14 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                    Filter notes
                  </summary>
                  <div style={{ display: "grid", gap: 10, marginTop: 12, maxWidth: 520, padding: 12, borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <label>
                      Date
                      <input
                        type="date"
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        style={{ display: "block", width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #cbd5e1" }}
                      />
                    </label>
                    {workerOptions.length > 1 && (
                      <label>
                        Worker
                        <select
                          value={workerFilter}
                          onChange={(e) => setWorkerFilter(e.target.value)}
                          style={{ display: "block", width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #cbd5e1" }}
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
                          style={{ display: "block", width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #cbd5e1" }}
                        >
                          <option value="">All services</option>
                          {serviceOptions.map((serviceName) => (
                            <option key={serviceName} value={serviceName}>{serviceName}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <button type="button" onClick={clearFilters} style={{ ...secondaryButtonStyle, width: "fit-content" }}>
                      Clear filters
                    </button>
                  </div>
                </details>

                <p style={{ marginTop: 0, color: "#4b5563", fontSize: 14 }}>
                  Showing {filteredNotes.length} of {notes.length} notes. Scroll inside the box below to view more.
                </p>

                {filteredNotes.length === 0 ? (
                  <p>No notes match those filters.</p>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gap: 8,
                      maxHeight: 430,
                      overflowY: "auto",
                      padding: 10,
                      border: "2px solid #cfe5df",
                      borderRadius: 14,
                      background: "#f8fffd",
                      boxShadow: "inset 0 1px 8px rgba(31, 41, 55, 0.06)",
                    }}
                  >
                    {filteredNotes.map((note) => (
                      <div
                        key={note.id}
                        style={{
                          padding: 12,
                          border: "1px solid #d9e7e4",
                          borderRadius: 12,
                          background: "#ffffff",
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
                            style={secondaryButtonStyle}
                          >
                            View PDF
                          </button>
                          <button
                            onClick={() => handleDownloadPdf(note, false)}
                            disabled={downloadingNoteId === note.id}
                            style={secondaryButtonStyle}
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
