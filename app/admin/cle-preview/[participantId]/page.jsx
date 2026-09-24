"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabase";

const DELIVERY_OPTIONS = [
  { value: "immediate", label: "Email each note when submitted" },
  { value: "weekly", label: "Weekly digest" },
  { value: "monthly", label: "Monthly archive" },
];
const DEFAULT_PROMPT_LEVELS = [
  "Independent",
  "Verbal Prompt",
  "Gesture Prompt",
  "Modeling",
  "Partial Physical Prompt",
  "Hand Over Hand",
  "Full Physical Prompt",
];

function previewPromptLevels(participant) {
  const levels = Array.isArray(participant?.prompt_levels) && participant.prompt_levels.length
    ? participant.prompt_levels
    : DEFAULT_PROMPT_LEVELS;
  return [...new Set(levels.map((level) => String(level || "").trim()).filter(Boolean))];
}

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
  const [hiddenDraftCount, setHiddenDraftCount] = useState(0);
  const [dateFilter, setDateFilter] = useState("");
  const [workerFilter, setWorkerFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [downloadingNoteId, setDownloadingNoteId] = useState("");

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
    setHiddenDraftCount(result.hiddenDraftCount || 0);
    setNotes(result.notes || []);
    setLoading(false);
  }

  useEffect(() => {
    if (participantId) loadPreview();
  }, [participantId]);

  const deliveryPreferences = Array.isArray(participant?.note_delivery_preferences)
    ? participant.note_delivery_preferences
    : ["immediate", "monthly"];

  const activeParticipantServices = (participant?.participant_services || [])
    .filter((service) => service.active && String(service.service_name || "").trim().toLowerCase() !== "respite")
    .sort((first, second) => String(first.service_name || "").localeCompare(String(second.service_name || "")));

  const groupedGoals = useMemo(() => {
    const groups = new Map();
    for (const goal of (participant?.participant_goals || []).filter((item) => item.active)) {
      const category = goal.category_name?.trim() || "Goals";
      const categoryKey = category.toLocaleLowerCase();
      if (!groups.has(categoryKey)) groups.set(categoryKey, { category, goals: [] });
      groups.get(categoryKey).goals.push(goal);
    }
    return [...groups.values()]
      .sort((first, second) => first.category.localeCompare(second.category))
      .map((group) => ({
        category: group.category,
        goals: group.goals.sort((first, second) =>
          (Number(first.sort_order) || 0) - (Number(second.sort_order) || 0) ||
          String(first.goal_label || "").localeCompare(String(second.goal_label || ""))
        ),
      }));
  }, [participant]);
  const selectedPromptLevels = previewPromptLevels(participant);

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
      const response = await fetch(`/api/admin/note-pdf/${note.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) {
        const errorText = await response.text();
        setMessage(errorText || "PDF could not be opened.");
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
      setMessage("PDF could not be opened. Please try again.");
    } finally {
      setDownloadingNoteId("");
    }
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
  const disabledButtonStyle = {
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#64748b",
    fontWeight: 700,
    opacity: 0.7,
  };
  const previewInputStyle = {
    display: "block",
    width: "100%",
    minHeight: 44,
    padding: "10px 12px",
    marginTop: 6,
    borderRadius: 9,
    border: "1px solid var(--dn-border)",
    background: "#ffffff",
    fontSize: 16,
    boxSizing: "border-box",
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
      <button
        type="button"
        onClick={() => { window.location.href = "/admin"; }}
        style={{ position: "sticky", top: 10, zIndex: 20, padding: "10px 14px", marginBottom: 14, borderRadius: 10, border: "1px solid #cbd5e1", background: "#ffffff", color: "#1f2937", fontWeight: 700, boxShadow: "0 4px 14px rgba(31,41,55,.14)" }}
      >
        ← Back to Admin
      </button>
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
          background: "linear-gradient(135deg, var(--dn-blue-pale) 0%, #ffffff 58%, var(--dn-pink-pale) 100%)",
          border: "1px solid #d9e7e4",
        }}
      >
        <div>
          <h1 style={{ marginBottom: 6 }}>DreamNote CLE Portal</h1>
          <p style={{ marginTop: 0, color: "#4b5563" }}>
            Review service notes and delivery preferences for your participant.
          </p>
        </div>
      </div>

      {message ? <p style={{ color: "#b45309" }}>{message}</p> : null}

      {hiddenDraftCount > 0 ? (
        <div
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 14,
            background: "#fff7ed",
            border: "1px solid #fb923c",
            color: "#9a3412",
          }}
        >
          <strong>Admin note:</strong> {hiddenDraftCount} draft note{hiddenDraftCount === 1 ? "" : "s"} with text are hidden from the CLE portal. These may be old notes that need review/recovery.
        </div>
      ) : null}

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
            <button
              type="button"
              onClick={() => { window.location.href = `/note-template/${participant.id}?returnTo=${encodeURIComponent(`/admin/cle-preview/${participant.id}`)}`; }}
              style={{ padding: "8px 10px", marginBottom: 12 }}
            >
              View Blank Service Note Template
            </button>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div>
                <h2 style={{ margin: 0 }}>Goals</h2>
                <p style={{ color: "#5d6878", margin: "5px 0 0" }}>
                  These goals control what workers see on the service note. In the real CLE portal, the CLE can add and edit them.
                </p>
              </div>
              <button type="button" disabled style={{ ...disabledButtonStyle, background: "var(--dn-primary)", color: "white" }}>Add Goal</button>
            </div>

            <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
              {groupedGoals.map((group) => (
                <section key={group.category} style={{ border: "1px solid var(--dn-border)", borderRadius: 11, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px 9px 14px", background: "#fff7cf", borderLeft: "6px solid var(--dn-pink)" }}>
                    <h3 style={{ margin: 0, color: "var(--dn-blue)", overflowWrap: "anywhere" }}>{group.category}</h3>
                    <button type="button" disabled style={disabledButtonStyle}>Rename</button>
                  </div>
                  {group.goals.map((goal, index) => {
                    const applicableIds = Array.isArray(goal.applicable_service_ids) && goal.applicable_service_ids.length
                      ? goal.applicable_service_ids
                      : goal.participant_service_id
                        ? [goal.participant_service_id]
                        : [];
                    const applicableNames = applicableIds.length
                      ? activeParticipantServices.filter((service) => applicableIds.includes(service.id)).map((service) => service.service_name)
                      : [];
                    return (
                      <article key={goal.id} style={{ padding: 14, borderTop: index ? "1px solid var(--dn-border)" : "none" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                            <strong style={{ overflowWrap: "anywhere" }}>{goal.goal_label}</strong>
                            <div style={{ color: "var(--dn-blue)", fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                              {applicableIds.length ? applicableNames.join(" · ") || "No active services" : "All services"}
                            </div>
                            {goal.requires_prompt_level && <span style={{ display: "inline-block", marginTop: 7, marginRight: 6, padding: "3px 7px", borderRadius: 999, background: "var(--dn-pink-pale)", color: "#8f3655", fontSize: 12, fontWeight: 700 }}>Prompt level</span>}
                            {goal.requires_detail && <span style={{ display: "inline-block", marginTop: 7, marginRight: 6, padding: "3px 7px", borderRadius: 999, background: "var(--dn-pink-pale)", color: "#8f3655", fontSize: 12, fontWeight: 700 }}>Written detail</span>}
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <button type="button" disabled style={disabledButtonStyle}>↑</button>
                            <button type="button" disabled style={disabledButtonStyle}>↓</button>
                            <button type="button" disabled style={disabledButtonStyle}>Edit</button>
                            <button type="button" disabled style={{ ...disabledButtonStyle, color: "#9b2c2c" }}>Remove</button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </section>
              ))}
              {!groupedGoals.length && (
                <p style={{ padding: 16, borderRadius: 9, background: "var(--dn-blue-pale)", color: "#5d6878" }}>
                  No active goals yet. The CLE will be able to use Add Goal here.
                </p>
              )}
            </div>

            <div style={{ marginTop: 20, padding: 18, borderRadius: 11, background: "var(--dn-blue-pale)" }}>
              <h3 style={{ marginTop: 0 }}>Add Goal</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 14 }}>
                <label style={{ fontWeight: 800, minWidth: 0 }}>
                  Category
                  <span style={{ display: "block", color: "#5d6878", fontSize: 14, lineHeight: 1.4, fontWeight: 400, whiteSpace: "normal", overflowWrap: "anywhere" }}>
                    The CLE can choose an existing category or type a new one.
                  </span>
                  <input disabled placeholder="Select or type a category" style={previewInputStyle} />
                </label>
                <label style={{ fontWeight: 800, minWidth: 0 }}>
                  Goal
                  <textarea disabled rows={3} style={{ ...previewInputStyle, resize: "vertical" }} />
                </label>
              </div>
              {activeParticipantServices.length > 0 && (
                <fieldset disabled style={{ margin: "0 0 14px", padding: 14, borderRadius: 9, border: "1px solid var(--dn-border)" }}>
                  <legend style={{ fontWeight: 800 }}>Services for this goal</legend>
                  <p style={{ color: "#5d6878", marginTop: 0 }}>The CLE can choose which services should show this goal.</p>
                  <div style={{ display: "grid", gap: 8 }}>
                    {activeParticipantServices.map((service) => (
                      <label key={service.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <input type="checkbox" defaultChecked /> {service.service_name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, fontWeight: 700 }}><input type="checkbox" disabled /> Ask the worker to select a prompt level</label>
              <label style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, fontWeight: 700 }}><input type="checkbox" disabled /> Ask the worker for written details</label>
              <button type="button" disabled style={{ ...disabledButtonStyle, background: "var(--dn-primary)", color: "white" }}>Add Goal</button>
              <p style={{ marginBottom: 0, color: "#92400e", fontSize: 14, fontWeight: 700 }}>Controls are disabled only because this is the Admin preview.</p>
            </div>
          </section>

          <section style={cardStyle}>
            <h2 style={{ margin: "0 0 5px" }}>Prompt Levels</h2>
            <p style={{ color: "#5d6878", marginTop: 0 }}>
              The CLE can choose which prompt levels workers see whenever a goal requires a prompt level.
            </p>
            <div style={{ display: "grid", gap: 8, maxWidth: 620 }}>
              {DEFAULT_PROMPT_LEVELS.concat(selectedPromptLevels.filter((level) => !DEFAULT_PROMPT_LEVELS.includes(level))).map((level, index) => {
                const selected = selectedPromptLevels.includes(level);
                return (
                  <label
                    key={level}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                      padding: "10px 12px",
                      borderRadius: 9,
                      border: `1px solid ${selected ? "var(--dn-pink)" : "var(--dn-border)"}`,
                      background: selected ? "var(--dn-pink-pale)" : "white",
                    }}
                  >
                    <input type="checkbox" checked={selected} disabled readOnly />
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 27, height: 27, borderRadius: 14, background: selected ? "var(--dn-yellow)" : "var(--dn-blue-pale)", color: "#1f2937", fontSize: 13, fontWeight: 800 }}>
                      {index + 1}
                    </span>
                    <strong>{level}</strong>
                  </label>
                );
              })}
            </div>
            <button type="button" disabled style={{ ...disabledButtonStyle, marginTop: 14, background: "var(--dn-primary)", color: "white" }}>
              Save Prompt Levels
            </button>
            <p style={{ marginBottom: 0, color: "#92400e", fontSize: 14, fontWeight: 700 }}>Controls are disabled only because this is the Admin preview.</p>
          </section>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, marginBottom: 8 }}>Assigned Workers</h2>
            <p style={{ marginTop: 0, color: "#4b5563" }}>
              Read-only admin preview. CLEs can remove a worker's access from their own portal.
            </p>
            {assignedWorkers.length === 0 ? (
              <p>No active workers are assigned yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {assignedWorkers.map((worker) => (
                  <div
                    key={worker.id || worker.name}
                    style={{
                      padding: 12,
                      border: "1px solid #d9e7e4",
                      borderRadius: 14,
                      background: "#f8fffd",
                    }}
                  >
                    <strong>{worker.name}</strong>
                    <div style={{ color: "#4b5563", fontSize: 14 }}>
                      {worker.email ? `${worker.email} · ` : ""}Last submitted note: {formatDate(worker.last_note_date)}
                    </div>
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
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            onClick={() => handleDownloadPdf(note, true)}
                            disabled={downloadingNoteId === note.id}
                            style={{ padding: "8px 10px" }}
                          >
                            View PDF
                          </button>
                          <button
                            onClick={() => handleDownloadPdf(note, false)}
                            disabled={downloadingNoteId === note.id}
                            style={{ padding: "8px 10px" }}
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
