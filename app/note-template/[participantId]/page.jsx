"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

const DEFAULT_PROMPT_LEVELS = [
  "Independent",
  "Verbal Prompt",
  "Gesture Prompt",
  "Modeling",
  "Partial Physical Prompt",
  "Hand Over Hand",
  "Full Physical Prompt",
];

const PROMPT_LEVEL_ALIASES = {
  independent: "Independent",
  "verbal prompt": "Verbal Prompt",
  verbal: "Verbal Prompt",
  "gesture prompt": "Gesture Prompt",
  gestural: "Gesture Prompt",
  gesture: "Gesture Prompt",
  modeling: "Modeling",
  model: "Modeling",
  "partial physical prompt": "Partial Physical Prompt",
  "partial physical": "Partial Physical Prompt",
  pp: "Partial Physical Prompt",
  "hand over hand": "Hand Over Hand",
  "hand over hand prompt": "Hand Over Hand",
  "hand-over-hand": "Hand Over Hand",
  "hand-over-hand prompt": "Hand Over Hand",
  hoh: "Hand Over Hand",
  "full physical prompt": "Full Physical Prompt",
  "full physical": "Full Physical Prompt",
  fp: "Full Physical Prompt",
};

function normalizePromptLevel(level) {
  const cleaned = String(level || "")
    .trim()
    .replace(/[–—]/g, "-")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ");

  return PROMPT_LEVEL_ALIASES[cleaned.toLowerCase()] || cleaned;
}

function getParticipantPromptLevels(participant) {
  const rawLevels =
    Array.isArray(participant?.prompt_levels) && participant.prompt_levels.length > 0
      ? participant.prompt_levels
      : DEFAULT_PROMPT_LEVELS;

  const normalized = rawLevels
    .map(normalizePromptLevel)
    .filter(Boolean)
    .filter((level, index, levels) => levels.indexOf(level) === index);

  const orderedKnownLevels = DEFAULT_PROMPT_LEVELS.filter((level) =>
    normalized.includes(level)
  );
  const customLevels = normalized.filter((level) => !DEFAULT_PROMPT_LEVELS.includes(level));

  return [...orderedKnownLevels, ...customLevels];
}

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

function getCurrentTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export default function NoteTemplatePreviewPage() {
  const params = useParams();
  const participantId = params?.participantId;
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [participant, setParticipant] = useState(null);
  const [viewerRole, setViewerRole] = useState("");
  const [shiftDate, setShiftDate] = useState(getTodayDate());
  const [timeIn, setTimeIn] = useState(getCurrentTime());
  const [timeOut, setTimeOut] = useState(getCurrentTime());
  const [location, setLocation] = useState("community");
  const [service, setService] = useState("");
  const [selectedGoals, setSelectedGoals] = useState([]);
  const [promptLevels, setPromptLevels] = useState({});
  const [signatureMode, setSignatureMode] = useState("typed");
  const [signatureFont, setSignatureFont] = useState("Pacifico");
  const [signatureAttested, setSignatureAttested] = useState(false);

  useEffect(() => {
    async function loadTemplate() {
      setLoading(true);
      setMessage("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }

      const response = await fetch(`/api/note-template/${participantId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "The note template could not be loaded.");
        setLoading(false);
        return;
      }

      const loadedParticipant = result.participant;
      setParticipant(loadedParticipant);
      setViewerRole(result.viewerRole || "");

      const firstService = loadedParticipant.participant_services?.find((s) => s.active);
      setService(firstService?.service_name || "");
      setLoading(false);
    }

    if (participantId) loadTemplate();
  }, [participantId]);

  const activeServices = participant?.participant_services?.filter((s) => s.active) || [];
  const selectedServiceRow =
    activeServices.find((s) => s.service_name === service) || null;

  const visibleGoals = (participant?.participant_goals || [])
    .filter((goal) => goal.active)
    .filter((goal) => {
      if (!goal.participant_service_id) return true;
      if (goal.participant_service_id === selectedServiceRow?.id) return true;
      return selectedGoals.includes(String(goal.id));
    })
    .sort((a, b) => a.sort_order - b.sort_order);

  const groupedVisibleGoals = visibleGoals.reduce((acc, goal) => {
    const category = goal.category_name || "Goals";
    if (!acc[category]) acc[category] = [];
    acc[category].push(goal);
    return acc;
  }, {});

  const cardStyle = {
    marginTop: 18,
    padding: 18,
    border: "1px solid var(--dn-border)",
    borderRadius: 16,
    background: "#ffffff",
  };

  const inputStyle = {
    width: "100%",
    padding: 10,
    fontSize: 16,
    boxSizing: "border-box",
    borderRadius: 10,
    border: "1px solid var(--dn-border)",
    background: "#f2faf8",
  };

  const disabledInputStyle = {
    ...inputStyle,
    color: "#64748b",
    background: "#f8fafc",
  };

  if (loading) {
    return (
      <main style={{ padding: 30, fontFamily: "Arial", maxWidth: 760, margin: "0 auto" }}>
        <h1>DreamNote Template Preview</h1>
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--dn-bg)",
        padding: 30,
        fontFamily: "Arial",
        maxWidth: 760,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          marginBottom: 16,
          padding: 14,
          borderRadius: 14,
          background: "#fffbeb",
          border: "1px solid #f59e0b",
          color: "#92400e",
          fontWeight: 700,
        }}
      >
        Read-only worker note template preview. You can click around to see goal prompts and
        required fields, but nothing can be submitted from this page.
      </div>

      <div
        style={{
          marginBottom: 20,
          padding: "18px 20px",
          background: "#ffffff",
          border: "1px solid var(--dn-border)",
          borderRadius: 16,
        }}
      >
        <h1 style={{ margin: 0, color: "var(--dn-primary)" }}>DreamNote</h1>
        <p style={{ marginBottom: 0, color: "#4b5563" }}>
          {viewerRole === "admin" ? "Admin preview" : "CLE preview"}
        </p>
      </div>

      {message ? (
        <section style={cardStyle}>
          <p style={{ color: "#b45309" }}>{message}</p>
        </section>
      ) : null}

      {participant ? (
        <>
          <p>Support Service Professional: Worker Name</p>
          <p>Person Receiving Services: {participant.name}</p>

          <div style={{ display: "grid", gap: 16, marginTop: 20, ...cardStyle }}>
            <div>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                Shift Date
              </label>
              <input
                type="date"
                value={shiftDate}
                onChange={(e) => setShiftDate(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                Time In
              </label>
              <input
                type="time"
                value={timeIn}
                onChange={(e) => setTimeIn(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                Time Out
              </label>
              <input
                type="time"
                value={timeOut}
                onChange={(e) => setTimeOut(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                Service
              </label>
              <select
                value={service}
                onChange={(e) => {
                  setService(e.target.value);
                  setSelectedGoals([]);
                  setPromptLevels({});
                }}
                style={inputStyle}
              >
                {activeServices.map((s) => (
                  <option key={s.id} value={s.service_name}>
                    {s.service_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                Location of Services Provided
              </div>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                <input
                  type="radio"
                  name="location"
                  value="home"
                  checked={location === "home"}
                  onChange={(e) => setLocation(e.target.value)}
                  style={{ marginRight: 8 }}
                />
                Home
              </label>
              <label style={{ display: "block", fontWeight: 600 }}>
                <input
                  type="radio"
                  name="location"
                  value="community"
                  checked={location === "community"}
                  onChange={(e) => setLocation(e.target.value)}
                  style={{ marginRight: 8 }}
                />
                Community
              </label>
            </div>

            <div
              style={{
                marginTop: 10,
                padding: 16,
                border: "1px solid var(--dn-border)",
                borderRadius: 12,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Goals worked on today</div>

              {visibleGoals.length > 0 ? (
                <div style={{ display: "grid", gap: 16 }}>
                  {Object.entries(groupedVisibleGoals).map(([category, goals]) => (
                    <div key={category}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 14,
                          marginBottom: 8,
                          color: "var(--dn-primary)",
                        }}
                      >
                        {category}
                      </div>

                      <div style={{ display: "grid", gap: 10 }}>
                        {goals.map((goal) => {
                          const goalId = String(goal.id);
                          const isChecked = selectedGoals.includes(goalId);

                          return (
                            <div
                              key={goal.id}
                              style={{
                                padding: 10,
                                border: "1px solid var(--dn-border)",
                                borderRadius: 10,
                                background: "#fafafa",
                              }}
                            >
                              <label
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  cursor: "pointer",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    const checked = e.target.checked;

                                    setSelectedGoals((prev) =>
                                      checked
                                        ? [...prev, goalId]
                                        : prev.filter((id) => id !== goalId)
                                    );

                                    if (!checked) {
                                      setPromptLevels((prev) => {
                                        const next = { ...prev };
                                        delete next[goalId];
                                        return next;
                                      });
                                    }
                                  }}
                                />
                                <span>{goal.goal_label}</span>
                              </label>

                              {isChecked && goal.requires_prompt_level && (
                                <div style={{ marginTop: 10 }}>
                                  <label style={{ fontSize: 13, fontWeight: 700 }}>
                                    Prompt level
                                  </label>
                                  <select
                                    value={promptLevels[goalId] || ""}
                                    onChange={(e) =>
                                      setPromptLevels((prev) => ({
                                        ...prev,
                                        [goalId]: e.target.value,
                                      }))
                                    }
                                    style={{
                                      width: "100%",
                                      padding: "10px 12px",
                                      borderRadius: 8,
                                      border: "1px solid var(--dn-border)",
                                      fontSize: 14,
                                      boxSizing: "border-box",
                                      marginTop: 6,
                                    }}
                                  >
                                    <option value="">Select prompt level</option>
                                    {getParticipantPromptLevels(participant).map((level) => (
                                      <option key={level} value={level}>
                                        {level}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              {isChecked && goal.requires_detail && (
                                <div style={{ marginTop: 10 }}>
                                  <input
                                    type="text"
                                    disabled
                                    placeholder={goal.detail_prompt || "Add details"}
                                    style={disabledInputStyle}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0 }}>No goals set for this service.</p>
              )}
            </div>

            <div style={{ marginTop: 10 }}>
              <label
                htmlFor="noteText"
                style={{
                  display: "block",
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                What activities were completed today, what support was given, and what progress
                was made?
              </label>
              <textarea
                id="noteText"
                disabled
                placeholder="Write service note..."
                style={{
                  width: "100%",
                  minHeight: 180,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid var(--dn-border)",
                  fontSize: 16,
                  resize: "vertical",
                  background: "#f8fafc",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                Signature Type
              </label>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                <input
                  type="radio"
                  name="signatureMode"
                  value="typed"
                  checked={signatureMode === "typed"}
                  onChange={(e) => setSignatureMode(e.target.value)}
                  style={{ marginRight: 8 }}
                />
                Type Signature
              </label>
              <label style={{ display: "block" }}>
                <input
                  type="radio"
                  name="signatureMode"
                  value="draw"
                  checked={signatureMode === "draw"}
                  onChange={(e) => setSignatureMode(e.target.value)}
                  style={{ marginRight: 8 }}
                />
                Draw Signature
              </label>
            </div>

            {signatureMode === "typed" ? (
              <>
                <div style={{ marginTop: "1rem" }}>
                  <label
                    htmlFor="typedSignature"
                    style={{ display: "block", fontWeight: "600", marginBottom: "0.4rem" }}
                  >
                    SSP Signature
                  </label>
                  <input
                    id="typedSignature"
                    type="text"
                    disabled
                    placeholder="Enter your full name"
                    style={disabledInputStyle}
                  />
                </div>

                <div>
                  <label
                    htmlFor="signatureFont"
                    style={{ display: "block", fontWeight: "600", marginBottom: "0.4rem" }}
                  >
                    Signature Font
                  </label>
                  <select
                    id="signatureFont"
                    value={signatureFont}
                    onChange={(e) => setSignatureFont(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="Pacifico">Pacifico</option>
                    <option value="GreatVibes">Great Vibes</option>
                    <option value="Allura">Allura</option>
                    <option value="AlexBrush">Alex Brush</option>
                  </select>
                </div>
              </>
            ) : (
              <div>
                <label style={{ display: "block", fontWeight: "600", marginBottom: "0.4rem" }}>
                  SSP Signature
                </label>
                <div
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: "6px",
                    width: "100%",
                    height: 150,
                    background: "#f8fafc",
                    display: "grid",
                    placeItems: "center",
                    color: "#64748b",
                  }}
                >
                  Signature drawing area
                </div>
              </div>
            )}

            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: 12,
                border: "1px solid var(--dn-border)",
                borderRadius: 10,
                background: "#fff",
                lineHeight: 1.4,
              }}
            >
              <input
                type="checkbox"
                checked={signatureAttested}
                onChange={(e) => setSignatureAttested(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>
                I certify that this service note accurately reflects the services I provided.
              </span>
            </label>

            <button
              type="button"
              disabled
              style={{
                padding: "10px 18px",
                fontSize: 16,
                borderRadius: 10,
                border: "none",
                background: "#94a3b8",
                color: "#ffffff",
                fontWeight: 600,
              }}
            >
              Submit Note disabled in preview
            </button>
          </div>

          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Outcome Information</h3>
            <p>
              <strong>Outcome Phrase:</strong>{" "}
              {participant.participant_outcomes?.[0]?.outcome_phrase || "Not set"}
            </p>
            <p>
              <strong>Outcome Statement:</strong>{" "}
              {participant.participant_outcomes?.[0]?.outcome_statement || "Not set"}
            </p>
            <p>
              <strong>Outcome Action Plan:</strong>{" "}
              {participant.participant_outcomes?.[0]?.outcome_action_plan || "Not set"}
            </p>
          </section>
        </>
      ) : null}
    </main>
  );
}
