"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabase";

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

export default function AdminClePreviewPage() {
  const params = useParams();
  const participantId = params?.participantId;
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [participant, setParticipant] = useState(null);
  const [notes, setNotes] = useState([]);
  const [assignedWorkers, setAssignedWorkers] = useState([]);
  const [dateFilter, setDateFilter] = useState("");
  const [workerFilter, setWorkerFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");

  async function loadPreview() {
    setLoading(true);
    setMessage("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      window.location.href = "/login";
      return;
    }

    const response = await fetch(`/api/admin/cle-preview/${participantId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || "The admin CLE preview could not be loaded.");
      setLoading(false);
      return;
    }

    setParticipant(result.participant);
    setAssignedWorkers(result.assignedWorkers || []);
    setNotes(result.notes || []);
    setLoading(false);
  }

  useEffect(() => {
    if (participantId) loadPreview();
  }, [participantId]);

  const deliveryPreferences = Array.isArray(participant?.note_delivery_preferences)
    ? participant.note_delivery_preferences
    : ["immediate", "monthly"];

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

  if (loading) {
    return (
      <main style={{ padding: 24, fontFamily: "Arial", maxWidth: 980, margin: "0 auto" }}>
        <h1>DreamNote CLE Portal Preview</h1>
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "Arial", maxWidth: 980, margin: "0 auto" }}>
      <div
        style={{
          padding: 14,
          borderRadius: 16,
          background: "#fffbeb",
          border: "1px solid #f59e0b",
          color: "#92400e",
          fontWeight: 700,
          marginBottom: 16,
        }}
      >
        Admin Preview — this is a read-only view of what the CLE portal looks like for this participant.
      </div>

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
        <button onClick={() => { window.location.href = "/admin"; }} style={{ padding: "8px 10px" }}>
          Back to Admin
        </button>
      </div>

      {message ? <p style={{ color: "#b45309" }}>{message}</p> : null}

      {!participant ? (
        <section style={cardStyle}>
          <p>No participant was found for this preview.</p>
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
                  <div key={worker.id || worker.name} style={{ padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 999, background: "#f8fffd" }}>
                    {worker.name}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Note Delivery Preferences</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {DELIVERY_OPTIONS.map((option) => (
                <div
                  key={option.value}
                  style={{
                    padding: 12,
                    border: deliveryPreferences.includes(option.value) ? "2px solid var(--dn-primary)" : "1px solid #d9e7e4",
                    borderRadius: 12,
                    background: deliveryPreferences.includes(option.value) ? "#ecfdf5" : "#ffffff",
                  }}
                >
                  {deliveryPreferences.includes(option.value) ? "☑" : "☐"} {option.label}
                </div>
              ))}
            </div>
          </section>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, marginBottom: 8 }}>Submitted Service Notes</h2>
            {notes.length === 0 ? (
              <p>No submitted notes yet.</p>
            ) : (
              <>
                <details style={{ marginBottom: 14 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 700 }}>Filter notes</summary>
                  <div style={{ display: "grid", gap: 10, marginTop: 12, maxWidth: 520, padding: 12, borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <label>
                      Date
                      <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }} />
                    </label>
                    {workerOptions.length > 1 && (
                      <label>
                        Worker
                        <select value={workerFilter} onChange={(e) => setWorkerFilter(e.target.value)} style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}>
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
                        <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}>
                          <option value="">All services</option>
                          {serviceOptions.map((serviceName) => (
                            <option key={serviceName} value={serviceName}>{serviceName}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                </details>

                <p style={{ marginTop: 0, color: "#4b5563", fontSize: 14 }}>
                  Showing {filteredNotes.length} of {notes.length} notes. Scroll inside the box below to view more.
                </p>

                {filteredNotes.length === 0 ? (
                  <p>No notes match those filters.</p>
                ) : (
                  <div style={{ display: "grid", gap: 8, maxHeight: 430, overflowY: "auto", padding: 10, border: "2px solid #cfe5df", borderRadius: 14, background: "#f8fffd" }}>
                    {filteredNotes.map((note) => (
                      <div key={note.id} style={{ padding: 12, border: "1px solid #d9e7e4", borderRadius: 12, background: "#ffffff", display: "grid", gap: 6 }}>
                        <strong>{note.title}</strong>
                        <div style={{ color: "#4b5563", fontSize: 14 }}>
                          Completed: {formatDate(note.date_completed)} · Signed: {formatDateTime(note.signed_at)}
                        </div>
                        <div style={{ color: "#6b7280", fontSize: 13 }}>
                          PDF buttons are hidden in admin preview for now. Use the CLE portal to test downloads.
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
