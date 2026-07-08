"use client";

import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { supabase } from "../../lib/supabase";

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
  const rawLevels = Array.isArray(participant?.prompt_levels) && participant.prompt_levels.length > 0
    ? participant.prompt_levels
    : DEFAULT_PROMPT_LEVELS;

  const normalized = rawLevels
    .map(normalizePromptLevel)
    .filter(Boolean)
    .filter((level, index, levels) => levels.indexOf(level) === index);

  const orderedKnownLevels = DEFAULT_PROMPT_LEVELS.filter((level) => normalized.includes(level));
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


function normalizeGoalDetails(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, val]) => [String(key), typeof val === "string" ? val : String(val ?? "")])
  );
}

export default function Page() {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [worker, setWorker] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [shiftDate, setShiftDate] = useState(getTodayDate());
  const [timeIn, setTimeIn] = useState(getCurrentTime());
  const [timeOut, setTimeOut] = useState(getCurrentTime());
  const [location, setLocation] = useState("community");
  const [service, setService] = useState("");
  const [selectedGoals, setSelectedGoals] = useState([]);
const [goalDetails, setGoalDetails] = useState({});
const [promptLevels, setPromptLevels] = useState({});
  const [signatureMode, setSignatureMode] = useState("typed");
  const [typedSignature, setTypedSignature] = useState("");
  const [signatureFont, setSignatureFont] = useState("Pacifico");
  const sigCanvasRef = useRef(null);
  const [drawnSignature, setDrawnSignature] = useState("");
const [saving, setSaving] = useState(false);
const [currentNoteId, setCurrentNoteId] = useState(null);
const [hasDraft, setHasDraft] = useState(false);
const [loadingDraft, setLoadingDraft] = useState(true);

useEffect(() => {
  if (!worker) return;
  if (!participants.length) return;

  const loadDraft = async () => {
    setLoadingDraft(true);

    const { data, error } = await supabase
      .from("service_notes")
      .select("*")
      .eq("worker_id", worker.id)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Load draft error:", error);
      setLoadingDraft(false);
      return;
    }

    if (!data) {
      setLoadingDraft(false);
      return;
    }

    setHasDraft(true);
    setCurrentNoteId(data.id);

    const matchingParticipant = participants.find(
      (p) => p.id === data.participant_id
    );

    if (!matchingParticipant) {
      setLoadingDraft(false);
      return;
    }

    const firstService = matchingParticipant.participant_services?.find(
      (s) => s.active
    );

    setSelectedParticipant(matchingParticipant);
    setService(data.service || firstService?.service_name || "");
    setShiftDate(data.shift_date || getTodayDate());
    setTimeIn(data.time_in || getCurrentTime());
    setTimeOut(data.time_out || getCurrentTime());
    setLocation(data.location || "community");
    setNoteText(data.narrative || "");
    setSelectedGoals(Array.isArray(data.goals) ? data.goals.map(String) : []);
    setGoalDetails(normalizeGoalDetails(data.goal_details));
    setPromptLevels(normalizeGoalDetails(data.prompt_levels));
    setLoadingDraft(false);
  };

  loadDraft();
}, [worker, participants]);

  async function handleLogin() {
    setMessage("");

    const { data: workerData } = await supabase
      .from("workers")
      .select("*")
      .eq("pin", pin)
      .eq("active", true)
      .single();

    if (!workerData) {
      setMessage("Invalid PIN");
      return;
    }

    setWorker(workerData);

    const { data: assignmentRows } = await supabase
      .from("worker_participants")
      .select("participant_id")
      .eq("worker_id", workerData.id);

    const participantIds = (assignmentRows || []).map((row) => row.participant_id);

    if (participantIds.length === 0) {
      setParticipants([]);
      setMessage("No participants assigned");
      return;
    }

    const { data: participantRows } = await supabase
      .from("participants")
      .select(`
        *,
        participant_outcomes (
          outcome_phrase,
          outcome_statement,
          outcome_action_plan
        ),
participant_goals (
  id,
  goal_label,
  sort_order,
  active,
  category_name,
  participant_service_id,
  detail_prompt,
  requires_detail,
  requires_prompt_level
),
        participant_services (
          id,
          service_name,
          active
        )
      `)
.in("id", participantIds)
.eq("active", true);

setParticipants(participantRows || []);

if (participantRows?.length === 1) {
  const participant = participantRows[0];
  setSelectedParticipant(participant);

  const firstService = participant.participant_services?.find((s) => s.active);
  setService(firstService?.service_name || "");
}

setMessage("");
}


function getMissingGoalDetailLabels() {
  return visibleGoals
    .filter(
      (goal) =>
        selectedGoals.includes(String(goal.id)) &&
        goal.requires_detail &&
        !String(goalDetails[String(goal.id)] || "").trim()
    )
    .map((goal) => goal.goal_label);
}

function getMissingPromptLevelLabels() {
  return visibleGoals
    .filter(
      (goal) =>
        selectedGoals.includes(String(goal.id)) &&
        goal.requires_prompt_level &&
        !String(promptLevels[String(goal.id)] || "").trim()
    )
    .map((goal) => goal.goal_label);
}

async function handleSubmitNote() {
    if (!worker || !selectedParticipant) {
      setMessage("Missing worker or participant");
      return;
    }

    if (!shiftDate || !timeIn || !timeOut || !noteText.trim()) {
      setMessage("Please complete date, time in, time out, and note");
      return;
    }

    const missingGoalDetails = getMissingGoalDetailLabels();
    if (missingGoalDetails.length > 0) {
      setMessage(`Please complete the detail field for: ${missingGoalDetails.join(", ")}`);
      return;
    }

    const missingPromptLevels = getMissingPromptLevelLabels();
    if (missingPromptLevels.length > 0) {
      setMessage(`Please select a prompt level for: ${missingPromptLevels.join(", ")}`);
      return;
    }

    setMessage("");

    if (signatureMode === "typed" && !typedSignature.trim()) {
      setMessage("Please type your signature before submitting.");
      return;
    }

    if (signatureMode === "draw" && (!drawnSignature || sigCanvasRef.current?.isEmpty?.())) {
      setMessage("Please draw your signature before submitting.");
      return;
    }

    setSaving(true);
    setMessage("");

 const insertPayload = {
  worker_id: worker.id,
  participant_id: selectedParticipant.id,
  shift_date: shiftDate,
  time_in: timeIn,
  time_out: timeOut,
  service: service,
  location: location,
  narrative: noteText.trim(),
  goals: selectedGoals.map(String),
  goal_details: normalizeGoalDetails(goalDetails),
  prompt_levels: normalizeGoalDetails(promptLevels),
  status: "submitted",
  worker_signature_mode: signatureMode,
  worker_typed_signature: typedSignature,
  worker_signature_font: signatureFont,
  worker_signature_date: shiftDate,
};

    const { data: noteInsert, error } = await supabase
      .from("service_notes")
      .insert([insertPayload])
.select()
.maybeSingle();

    if (error) {
      console.log("SUPABASE ERROR:", error);
      setSaving(false);
      setMessage(`Error saving note: ${error.message}`);
      return;
    }

    if (selectedGoals.length > 0) {
      const goalRows = selectedGoals.map((goalId) => ({
        service_note_id: noteInsert.id,
        participant_goal_id: goalId,
        prompt_level: promptLevels[goalId] || null,
      }));

      const { error: goalsError } = await supabase
        .from("service_note_goals")
        .insert(goalRows);

      if (goalsError) {
        console.log("GOALS ERROR:", goalsError);
        setSaving(false);
        setMessage(`Note saved, but goals failed to save: ${goalsError.message}`);
        return;
      }
    }

    try {
      const res = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workerName: worker.name,
          participantName: selectedParticipant.name,
          cleEmail: selectedParticipant.cle_email,
          shiftDate,
          timeIn,
          timeOut,
          service,
          location,
          outcomePhrase: selectedParticipant.participant_outcomes?.[0]?.outcome_phrase || "",
          outcomeStatement: selectedParticipant.participant_outcomes?.[0]?.outcome_statement || "",
          outcomeActionPlan:
            selectedParticipant.participant_outcomes?.[0]?.outcome_action_plan || "",
          selectedGoals:
            selectedParticipant.participant_goals
              ?.filter((goal) => selectedGoals.includes(String(goal.id)))
              .map((goal) => ({
                ...goal,
                detail_value: goalDetails[goal.id] || "",
                prompt_level: promptLevels[goal.id] || "",
              })) || [],
          noteText: noteText.trim(),
          signatureMode,
          typedSignature,
          drawnSignature,
          signatureFont,
        }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const safeName = selectedParticipant.name
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-+|-+$/g, "");
        a.download = `${safeName}-${shiftDate}-Service-Note.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        setMessage("Note saved and PDF downloaded");
        setTypedSignature("");
        setDrawnSignature("");

        if (sigCanvasRef.current) {
          sigCanvasRef.current.clear();
        }

        setSignatureMode("typed");
      } else {
        setMessage("Note saved, but PDF download failed");
      }
    } catch (err) {
      console.error("PDF ERROR:", err);
      setMessage("Note saved, but PDF download failed");
    }

    setSaving(false);
    setNoteText("");
    setSelectedGoals([]);
    setGoalDetails({});
    setPromptLevels({});
    setTimeIn(getCurrentTime());
    setTimeOut(getCurrentTime());
  }


const activeServices =
  selectedParticipant?.participant_services?.filter((s) => s.active) || [];

const selectedServiceRow =
  activeServices.find((s) => s.service_name === service) || null;


const visibleGoals = (selectedParticipant?.participant_goals || [])
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

if (selectedParticipant) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--dn-bg)",
        padding: 30,
        fontFamily: "Arial",
        maxWidth: 700,
        margin: "0 auto",
      }}
    >
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
      </div>

      <p>Support Service Professional: {worker.name}</p>
      <p>Person Receiving Services: {selectedParticipant.name}</p>

      <div
        style={{
          display: "grid",
          gap: 16,
          marginTop: 20,
          maxWidth: 420,
          background: "#ffffff",
          padding: 20,
          borderRadius: 16,
          border: "1px solid var(--dn-border)",
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              marginBottom: 6,
              fontWeight: 600,
              color: "var(--dn-text)",
            }}
          >
            Shift Date
          </label>
          <input
            type="date"
            value={shiftDate}
            onChange={(e) => setShiftDate(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              fontSize: 16,
              boxSizing: "border-box",
              borderRadius: 10,
              border: "1px solid var(--dn-border)",
              background: "#f2faf8",
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              marginBottom: 6,
              fontWeight: 600,
              color: "var(--dn-text)",
            }}
          >
            Time In
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="time"
              value={timeIn}
              onChange={(e) => setTimeIn(e.target.value)}
              style={{
                flex: 1,
                padding: 10,
                fontSize: 16,
                boxSizing: "border-box",
                borderRadius: 10,
                border: "1px solid var(--dn-border)",
                background: "#f2faf8",
              }}
            />

            <button
              type="button"
              onClick={() => setTimeIn(getCurrentTime())}
              style={{
                padding: "10px 12px",
                fontSize: 14,
                cursor: "pointer",
                borderRadius: 10,
                border: "1px solid var(--dn-border)",
                background: "#ffffff",
              }}
            >
              Now
            </button>
          </div>
        </div>

        <div>
          <label
            style={{
              display: "block",
              marginBottom: 6,
              fontWeight: 600,
              color: "var(--dn-text)",
            }}
          >
            Time Out
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="time"
              value={timeOut}
              onChange={(e) => setTimeOut(e.target.value)}
              style={{
                flex: 1,
                padding: 10,
                fontSize: 16,
                boxSizing: "border-box",
                borderRadius: 10,
                border: "1px solid var(--dn-border)",
                background: "#f2faf8",
              }}
            />
          </div>
        </div>

        <div>
          <label
            style={{
              display: "block",
              marginBottom: 6,
              fontWeight: 600,
              color: "var(--dn-text)",
            }}
          >
            Service
          </label>

          <select
            value={service}
onChange={(e) => {
  setService(e.target.value);
  setSelectedGoals([]);
  setGoalDetails({});
}}
            style={{
              width: "100%",
              padding: 10,
              fontSize: 16,
              boxSizing: "border-box",
              borderRadius: 10,
              border: "1px solid var(--dn-border)",
              background: "#f2faf8",
            }}
          >
            {selectedParticipant.participant_services
              ?.filter((s) => s.active)
              .map((s) => (
                <option key={s.id} value={s.service_name}>
                  {s.service_name}
                </option>
              ))}
          </select>
        </div>

        <div style={{ marginTop: 15 }}>
          <label
            style={{
              display: "block",
              marginBottom: 6,
              fontWeight: 600,
              color: "var(--dn-text)",
            }}
          >
            Location of Services Provided
          </label>

          <label
            style={{
              display: "block",
              marginBottom: 6,
              fontWeight: 600,
              color: "var(--dn-text)",
            }}
          >
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

          <label style={{ display: "block" }}>
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
            marginTop: 20,
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
                                  setGoalDetails((prev) => {
                                    const next = { ...prev };
                                    delete next[goalId];
                                    return next;
                                  });

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
                                {getParticipantPromptLevels(selectedParticipant).map((level) => (
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
                                placeholder={goal.detail_prompt || "Add details"}
                                value={goalDetails[goalId] || ""}
                                onChange={(e) =>
                                  setGoalDetails((prev) => ({
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
                                }}
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

        <div style={{ marginTop: 20 }}>
          <label
            htmlFor="noteText"
            style={{
              display: "block",
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            What activities were completed today, what support was given, and what progress was made?
          </label>

          <textarea
            id="noteText"
            placeholder="Write service note..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            style={{
              width: "100%",
              minHeight: 180,
              padding: 12,
              borderRadius: 12,
              border: "1px solid var(--dn-border)",
              fontSize: 16,
              resize: "vertical",
              background: "#fff",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginTop: 20 }}>
          <label
            style={{
              display: "block",
              marginBottom: 6,
              fontWeight: 600,
              color: "var(--dn-text)",
            }}
          >
            Signature Type
          </label>

          <label
            style={{
              display: "block",
              marginBottom: 6,
              fontWeight: 600,
              color: "var(--dn-text)",
            }}
          >
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

        {signatureMode === "typed" && (
          <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
            <label
              htmlFor="typedSignature"
              style={{
                display: "block",
                fontWeight: "600",
                marginBottom: "0.4rem",
              }}
            >
              SSP Signature
            </label>
            <input
              id="typedSignature"
              type="text"
              value={typedSignature}
              onChange={(e) => setTypedSignature(e.target.value)}
              placeholder="Enter your full name"
              style={{
                width: "100%",
                padding: "0.65rem",
                fontSize: "1rem",
                border: "1px solid #ccc",
                borderRadius: "6px",
              }}
            />
          </div>
        )}

        {signatureMode === "typed" && (
          <div style={{ marginBottom: "1rem" }}>
            <label
              htmlFor="signatureFont"
              style={{
                display: "block",
                fontWeight: "600",
                marginBottom: "0.4rem",
              }}
            >
              Signature Font
            </label>
            <select
              id="signatureFont"
              value={signatureFont}
              onChange={(e) => setSignatureFont(e.target.value)}
              style={{
                width: "100%",
                padding: "0.65rem",
                fontSize: "1rem",
                border: "1px solid #ccc",
                borderRadius: "6px",
              }}
            >
              <option value="Pacifico">Pacifico</option>
              <option value="GreatVibes">Great Vibes</option>
              <option value="Allura">Allura</option>
              <option value="AlexBrush">Alex Brush</option>
            </select>
          </div>
        )}

        {signatureMode === "draw" && (
          <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                fontWeight: "600",
                marginBottom: "0.4rem",
              }}
            >
              SSP Signature
            </label>

            <div
              style={{
                border: "1px solid #ccc",
                borderRadius: "6px",
                width: "100%",
                height: 150,
              }}
            >
              <SignatureCanvas
                ref={sigCanvasRef}
                penColor="black"
                minWidth={1.5}
                maxWidth={3}
                canvasProps={{
                  width: 500,
                  height: 150,
                  style: { width: "100%", height: "150px" },
                }}
                onEnd={() => {
                  const dataURL = sigCanvasRef.current.toDataURL();
                  setDrawnSignature(dataURL);
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 15, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={handleSubmitNote}
          disabled={saving}
          style={{
            padding: "10px 18px",
            fontSize: 16,
            cursor: "pointer",
            borderRadius: 10,
            border: "none",
            background: "var(--dn-primary)",
            color: "#ffffff",
            fontWeight: 600,
          }}
        >
          {saving ? "Saving..." : "Submit Note"}
        </button>

        <button
          onClick={handleSaveDraft}
          disabled={saving}
          style={{
            padding: "10px 18px",
            fontSize: 16,
            cursor: "pointer",
            borderRadius: 10,
            border: "1px solid var(--dn-border)",
            background: "#ffffff",
            color: "var(--dn-primary)",
            fontWeight: 600,
          }}
        >
          {saving ? "Saving..." : "Save Draft"}
        </button>

        <button
          onClick={handleDeleteDraft}
          disabled={saving}
          style={{
            padding: "10px 18px",
            fontSize: 16,
            cursor: "pointer",
            borderRadius: 10,
            border: "1px solid var(--dn-border)",
            background: "#ffffff",
            color: "var(--dn-primary)",
            fontWeight: 600,
          }}
        >
          Clear Note
        </button>

<button
  onClick={() => {
    setSelectedParticipant(null);
    setMessage("");
  }}
          style={{
            padding: "10px 18px",
            fontSize: 16,
            cursor: "pointer",
            borderRadius: 10,
            border: "1px solid var(--dn-border)",
            background: "#ffffff",
            color: "var(--dn-primary)",
            fontWeight: 600,
          }}
        >
          Back
        </button>
      </div>

      <div style={{ marginTop: 20, padding: 12, border: "1px solid #ccc", borderRadius: 6 }}>
        <h3 style={{ marginTop: 0 }}>Outcome Information</h3>

        <p>
          <strong>Outcome Phrase:</strong>{" "}
          {selectedParticipant.participant_outcomes?.[0]?.outcome_phrase || "Not set"}
        </p>

        <p>
          <strong>Outcome Statement:</strong>{" "}
          {selectedParticipant.participant_outcomes?.[0]?.outcome_statement || "Not set"}
        </p>

        <p>
          <strong>Outcome Action Plan:</strong>{" "}
          {selectedParticipant.participant_outcomes?.[0]?.outcome_action_plan || "Not set"}
        </p>
      </div>

      <p style={{ marginTop: 10 }}>{message}</p>

      <div
        style={{
          width: "100%",
          maxWidth: 500,
          fontSize: 12,
          color: "#666",
          marginTop: 40,
          paddingTop: 20,
          borderTop: "1px solid #e5e5e5",
          textAlign: "center",
        }}
      >
        DreamNote Beta by Brad Beck. Please send feedback to{" "}
        <a href="mailto:bradley@supportsbroker.com">bradley@supportsbroker.com</a>
      </div>
    </main>
  );
}

async function handleSaveDraft() {
  setSaving(true);
  setMessage("");

  const participantObject =
    typeof selectedParticipant === "object"
      ? selectedParticipant
      : participants.find((p) => p.id === selectedParticipant);

  const participantId = participantObject?.id || selectedParticipant;

  if (!participantId) {
    setSaving(false);
    setMessage("No participant selected.");
    return;
  }

  if (!worker?.id) {
    setSaving(false);
    setMessage("Worker not found.");
    return;
  }

  let noteId = currentNoteId;

  const payload = {
    worker_id: worker.id,
    participant_id: participantId,
    shift_date: shiftDate,
    time_in: timeIn,
    time_out: timeOut,
    location,
    service,
    narrative: noteText.trim(),
    goals: selectedGoals.map(String),
    goal_details: normalizeGoalDetails(goalDetails),
    prompt_levels: normalizeGoalDetails(promptLevels),
    worker_signature_mode: signatureMode,
    worker_typed_signature: signatureMode === "typed" ? typedSignature : null,
    worker_signature_font: signatureFont,
    worker_signature_date: shiftDate,
    status: "draft",
  };

  if (!noteId) {
    const { data, error } = await supabase
      .from("service_notes")
      .insert([payload])
      .select()
      .maybeSingle();

    if (error) {
      console.error("Create draft error:", error);
      setSaving(false);
      setMessage(error.message);
      return;
    }

    noteId = data.id;
    setCurrentNoteId(data.id);
    setHasDraft(true);
  } else {
    const { error } = await supabase
      .from("service_notes")
      .update(payload)
      .eq("id", noteId);

    if (error) {
      console.error("Update draft error:", error);
      setSaving(false);
      setMessage(error.message);
      return;
    }
  }

  setSaving(false);
  setMessage("Draft saved.");
}

  async function handleDeleteDraft() {
    setSaving(true);
    setMessage("");

    if (currentNoteId) {
      const { error } = await supabase
        .from("service_notes")
        .delete()
        .eq("id", currentNoteId);

      if (error) {
        setSaving(false);
        setMessage("Could not clear note.");
        return;
      }
    }

    setCurrentNoteId(null);
    setHasDraft(false);
    setSelectedParticipant(null);
    setNoteText("");
    setGoalDetails({});
    setPromptLevels({});
    setShiftDate(getTodayDate());
    setTimeIn(getCurrentTime());
    setTimeOut(getCurrentTime());
    setLocation("community");
    setService("");
    setSelectedGoals([]);
    setTypedSignature("");
    setDrawnSignature("");
    setSaving(false);
    setMessage("Note cleared.");
  }

  if (worker && loadingDraft) {
    return (
      <main style={{ padding: 30, fontFamily: "Arial", maxWidth: 700, margin: "0 auto" }}>
        <h1>DreamNote</h1>
        <p>Loading saved note...</p>
      </main>
    );
  }

  if (worker) {
    return (
      <main style={{ padding: 30, fontFamily: "Arial", maxWidth: 700, margin: "0 auto" }}>
        <h1>DreamNote</h1>
        <p>Welcome, {worker.name}</p>
        <h2>Assigned Persons Receiving Services</h2>

        {participants.length === 0 ? (
          <p>No persons receiving services assigned.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {participants.map((participant) => (
              <button
                key={participant.id}
                onClick={async () => {
                  setSelectedParticipant(participant);

                  const firstService = participant.participant_services?.find((s) => s.active);
                  if (firstService) setService(firstService.service_name);

                }}
                style={{
                  padding: 12,
                  fontSize: 16,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {participant.name}
              </button>
            ))}
          </div>
        )}
      </main>
    );
  }

  return (
    <main
      style={{
        padding: 30,
        fontFamily: "Arial",
        maxWidth: 500,
        margin: "0 auto",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ flex: 1 }}>
        <h1>DreamNote</h1>

        <input
          type="password"
          placeholder="Enter support service professional PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          style={{
            width: "100%",
            padding: 12,
            fontSize: 16,
            marginTop: 10,
            marginBottom: 12,
            boxSizing: "border-box",
          }}
        />

        <button
          onClick={handleLogin}
          style={{
            padding: "10px 18px",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          Sign in
        </button>

        <p>{message}</p>
      </div>
    </main>
  );
}