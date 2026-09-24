"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const SERVICE_CODES = {
  "In-Home and Community Supports": "W7060",
  "In-Home and Community Supports Enhanced": "W7061",
  Companion: "W1726",
  "Day Respite": "W9798",
  "15-Minute Respite": "W9862",
};

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
  const [removingWorkerId, setRemovingWorkerId] = useState("");
  const [editingGoalId, setEditingGoalId] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const [renamingCategory, setRenamingCategory] = useState("");
  const [categoryRenameDraft, setCategoryRenameDraft] = useState("");
  const [savingCategoryRename, setSavingCategoryRename] = useState(false);
  const [goalDraft, setGoalDraft] = useState({
    categoryName: "",
    goalLabel: "",
    serviceIds: [],
    requiresDetail: false,
    requiresPromptLevel: false,
    detailPrompt: "",
  });

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
    setGoalDraft((current) => current.goalLabel || current.categoryName
      ? current
      : {
          ...current,
          serviceIds: (result.participant?.participant_services || [])
            .filter((service) => service.active && String(service.service_name || "").trim().toLowerCase() !== "respite")
            .map((service) => service.id),
        });
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

  async function handleRemoveWorkerAccess(worker) {
    const workerName = worker?.name || "this worker";
    const confirmed = window.confirm(
      `Remove ${workerName}'s access to ${participant?.name || "this participant"}? This will not delete the worker account or past notes.`
    );

    if (!confirmed) return;

    setRemovingWorkerId(worker.id);
    setMessage("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      window.location.href = "/login";
      return;
    }

    const response = await fetch("/api/cle/worker-access", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ workerId: worker.id }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || "Worker access could not be removed.");
    } else {
      setMessage(result.message || "Worker access removed.");
      setAssignedWorkers((current) => current.filter((item) => item.id !== worker.id));
    }

    setRemovingWorkerId("");
  }

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

  async function callGoalConfig(payload) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      window.location.href = "/login";
      throw new Error("Sign in again before continuing.");
    }
    const response = await fetch("/api/cle/participant-config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ ...payload, participantId: participant?.id }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The goal change could not be saved.");
    return result;
  }

  function clearGoalDraft() {
    setEditingGoalId("");
    setGoalDraft({
      categoryName: "",
      goalLabel: "",
      serviceIds: activeParticipantServices.map((service) => service.id),
      requiresDetail: false,
      requiresPromptLevel: false,
      detailPrompt: "",
    });
  }

  function editGoal(goal) {
    setEditingGoalId(goal.id);
    const activeServiceIds = activeParticipantServices.map((service) => service.id);
    const storedServiceIds = Array.isArray(goal.applicable_service_ids) && goal.applicable_service_ids.length
      ? goal.applicable_service_ids
      : goal.participant_service_id
        ? [goal.participant_service_id]
        : activeServiceIds;
    setGoalDraft({
      categoryName: goal.category_name || "Goals",
      goalLabel: goal.goal_label || "",
      serviceIds: storedServiceIds.filter((id) => activeServiceIds.includes(id)),
      requiresDetail: Boolean(goal.requires_detail),
      requiresPromptLevel: Boolean(goal.requires_prompt_level),
      detailPrompt: goal.detail_prompt || "",
    });
    document.getElementById("cle-goal-editor")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function saveGoal(event) {
    event.preventDefault();
    const categoryName = goalDraft.categoryName.trim() || "Goals";
    const goalLabel = goalDraft.goalLabel.trim();
    if (!goalLabel) return setMessage("Enter the goal description.");
    if (activeParticipantServices.length && !goalDraft.serviceIds.length) {
      return setMessage("Choose at least one service for this goal.");
    }
    setSavingGoal(true);
    setMessage("");
    try {
      const result = await callGoalConfig({
        action: "save_goal",
        goal: {
          id: editingGoalId || null,
          categoryName,
          goalLabel,
          serviceIds: goalDraft.serviceIds,
          requiresDetail: goalDraft.requiresDetail,
          requiresPromptLevel: goalDraft.requiresPromptLevel,
          detailPrompt: goalDraft.detailPrompt,
        },
      });
      clearGoalDraft();
      await loadPortal();
      setMessage(result.message);
      window.setTimeout(() => document.getElementById("cle-goals")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (error) {
      setMessage(`Could not save goal: ${error.message}`);
    } finally {
      setSavingGoal(false);
    }
  }

  async function archiveGoal(goal) {
    if (!window.confirm(`Remove “${goal.goal_label}” from the active note template?`)) return;
    try {
      const result = await callGoalConfig({ action: "archive_goal", goalId: goal.id });
      if (editingGoalId === goal.id) clearGoalDraft();
      await loadPortal();
      setMessage(result.message);
    } catch (error) {
      setMessage(`Could not remove goal: ${error.message}`);
    }
  }

  async function moveGoal(category, goalId, direction) {
    const group = groupedGoals.find((item) => item.category === category);
    if (!group) return;
    const currentIndex = group.goals.findIndex((goal) => goal.id === goalId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= group.goals.length) return;
    const reordered = [...group.goals];
    [reordered[currentIndex], reordered[nextIndex]] = [reordered[nextIndex], reordered[currentIndex]];
    try {
      const result = await callGoalConfig({
        action: "reorder_goals",
        goalIds: reordered.map((goal) => goal.id),
      });
      await loadPortal();
      setMessage(result.message);
    } catch (error) {
      setMessage(`Could not reorder goals: ${error.message}`);
    }
  }

  async function renameCategory(event, group) {
    event.preventDefault();
    const newCategory = categoryRenameDraft.trim();
    if (!newCategory) return setMessage("Enter a category name.");
    if (newCategory.toLocaleLowerCase() === group.category.toLocaleLowerCase()) {
      setRenamingCategory("");
      setCategoryRenameDraft("");
      return;
    }
    setSavingCategoryRename(true);
    setMessage("");
    try {
      const result = await callGoalConfig({
        action: "rename_category",
        oldCategory: group.category,
        newCategory,
        goalIds: group.goals.map((goal) => goal.id),
      });
      if (goalDraft.categoryName.trim().toLocaleLowerCase() === group.category.toLocaleLowerCase()) {
        setGoalDraft((current) => ({ ...current, categoryName: newCategory }));
      }
      setRenamingCategory("");
      setCategoryRenameDraft("");
      await loadPortal();
      setMessage(result.message);
    } catch (error) {
      setMessage(`Could not rename category: ${error.message}`);
    } finally {
      setSavingCategoryRename(false);
    }
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
    border: "1px solid var(--dn-border)",
    borderRadius: 18,
    background: "#ffffff",
    boxShadow: "0 8px 24px rgba(31, 41, 55, 0.06)",
  };
  const statCardStyle = {
    padding: 14,
    border: "1px solid var(--dn-border)",
    borderRadius: 14,
    background: "var(--dn-blue-pale)",
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
  const smallButtonStyle = {
    ...secondaryButtonStyle,
    padding: "6px 9px",
    minHeight: 34,
    fontSize: 14,
    fontWeight: 700,
  };
  const inputStyle = {
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
  const checkLabelStyle = {
    display: "flex",
    alignItems: "center",
    gap: 9,
    marginBottom: 12,
    fontWeight: 700,
  };
  const tagStyle = {
    display: "inline-block",
    marginTop: 7,
    marginRight: 6,
    padding: "3px 7px",
    borderRadius: 999,
    background: "var(--dn-pink-pale)",
    color: "#8f3655",
    fontSize: 12,
    fontWeight: 700,
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
          background: "linear-gradient(135deg, var(--dn-blue-pale) 0%, #ffffff 58%, var(--dn-pink-pale) 100%)",
          border: "1px solid var(--dn-border)",
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
            <button
              type="button"
              onClick={() => { window.location.href = `/note-template/${participant.id}?returnTo=${encodeURIComponent("/cle")}`; }}
              style={{ ...secondaryButtonStyle, marginBottom: 12 }}
            >
              View Blank Service Note Template
            </button>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <div style={{ ...statCardStyle, borderTop: "4px solid var(--dn-blue)" }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: "var(--dn-blue)" }}>{notes.length}</div>
                <div style={{ color: "#4b5563", fontSize: 14 }}>Submitted notes</div>
              </div>
              <div style={{ ...statCardStyle, background: "var(--dn-pink-pale)", borderTop: "4px solid var(--dn-pink)" }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#a43f60" }}>{thisMonthNotes.length}</div>
                <div style={{ color: "#4b5563", fontSize: 14 }}>This month</div>
              </div>
              <div style={{ ...statCardStyle, background: "var(--dn-yellow-pale)", borderTop: "4px solid var(--dn-yellow)" }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: "var(--dn-primary)" }}>{assignedWorkers.length}</div>
                <div style={{ color: "#4b5563", fontSize: 14 }}>Assigned workers</div>
              </div>
            </div>
          </section>

          <section id="cle-goals" style={{ ...cardStyle, scrollMarginTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div>
                <h2 style={{ margin: 0 }}>Goals</h2>
                <p style={{ color: "#5d6878", margin: "5px 0 0" }}>
                  These goals control what workers see on the service note. Goals are grouped by category.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  clearGoalDraft();
                  window.setTimeout(() => document.getElementById("cle-goal-editor")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
                }}
                style={primaryButtonStyle}
              >
                Add Goal
              </button>
            </div>

            <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
              {groupedGoals.map((group) => (
                <section key={group.category} style={{ border: "1px solid var(--dn-border)", borderRadius: 11, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px 9px 14px", background: "#fff7cf", borderLeft: "6px solid var(--dn-pink)" }}>
                    <h3 style={{ margin: 0, color: "var(--dn-blue)", overflowWrap: "anywhere" }}>{group.category}</h3>
                    <button
                      type="button"
                      disabled={savingCategoryRename}
                      onClick={() => {
                        setRenamingCategory(group.category);
                        setCategoryRenameDraft(group.category);
                      }}
                      style={{ ...smallButtonStyle, opacity: savingCategoryRename ? 0.5 : 1 }}
                    >
                      Rename
                    </button>
                  </div>

                  {renamingCategory === group.category && (
                    <form
                      onSubmit={(event) => renameCategory(event, group)}
                      style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "10px 14px", background: "var(--dn-pink-pale)", borderTop: "1px solid var(--dn-border)" }}
                    >
                      <label style={{ fontWeight: 700 }}>New category name</label>
                      <input
                        autoFocus
                        value={categoryRenameDraft}
                        onChange={(event) => setCategoryRenameDraft(event.target.value)}
                        style={{ ...inputStyle, flex: "1 1 240px", width: "auto", marginTop: 0 }}
                      />
                      <button type="submit" disabled={savingCategoryRename || !categoryRenameDraft.trim()} style={{ ...smallButtonStyle, background: "var(--dn-primary)", color: "white" }}>
                        {savingCategoryRename ? "Saving..." : "Save"}
                      </button>
                      <button type="button" onClick={() => { setRenamingCategory(""); setCategoryRenameDraft(""); }} style={smallButtonStyle}>
                        Cancel
                      </button>
                    </form>
                  )}

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
                            {goal.requires_prompt_level && <span style={tagStyle}>Prompt level</span>}
                            {goal.requires_detail && <span style={tagStyle}>Written detail</span>}
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <button type="button" aria-label={`Move ${goal.goal_label} up`} disabled={index === 0} onClick={() => moveGoal(group.category, goal.id, -1)} style={{ ...smallButtonStyle, opacity: index === 0 ? 0.4 : 1 }}>↑</button>
                            <button type="button" aria-label={`Move ${goal.goal_label} down`} disabled={index === group.goals.length - 1} onClick={() => moveGoal(group.category, goal.id, 1)} style={{ ...smallButtonStyle, opacity: index === group.goals.length - 1 ? 0.4 : 1 }}>↓</button>
                            <button type="button" onClick={() => editGoal(goal)} style={smallButtonStyle}>Edit</button>
                            <button type="button" onClick={() => archiveGoal(goal)} style={{ ...smallButtonStyle, color: "#9b2c2c" }}>Remove</button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </section>
              ))}
              {!groupedGoals.length && (
                <p style={{ padding: 16, borderRadius: 9, background: "var(--dn-blue-pale)", color: "#5d6878" }}>
                  No active goals yet. Use Add Goal to begin the service note template.
                </p>
              )}
            </div>

            <form id="cle-goal-editor" onSubmit={saveGoal} style={{ marginTop: 20, padding: 18, borderRadius: 11, background: "var(--dn-blue-pale)", scrollMarginTop: 20 }}>
              <h3 style={{ marginTop: 0 }}>{editingGoalId ? "Edit Goal" : "Add Goal"}</h3>
              <datalist id="cle-goal-categories">
                {groupedGoals.map((group) => <option key={group.category} value={group.category} />)}
              </datalist>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 14 }}>
                <label style={{ fontWeight: 800, minWidth: 0 }}>
                  Category
                  <span style={{ display: "block", color: "#5d6878", fontSize: 14, lineHeight: 1.4, fontWeight: 400, whiteSpace: "normal", overflowWrap: "anywhere" }}>
                    Choose an existing category from the suggestions, or type a new category.
                  </span>
                  <input
                    list="cle-goal-categories"
                    value={goalDraft.categoryName}
                    onChange={(event) => setGoalDraft({ ...goalDraft, categoryName: event.target.value })}
                    placeholder="Select or type a category"
                    style={inputStyle}
                  />
                </label>
                <label style={{ fontWeight: 800, minWidth: 0 }}>
                  Goal
                  <textarea
                    value={goalDraft.goalLabel}
                    onChange={(event) => setGoalDraft({ ...goalDraft, goalLabel: event.target.value })}
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </label>
              </div>

              {activeParticipantServices.length > 0 && (
                <fieldset style={{ margin: "0 0 14px", padding: 14, borderRadius: 9, border: "1px solid var(--dn-border)" }}>
                  <legend style={{ fontWeight: 800 }}>Services for this goal</legend>
                  <p style={{ color: "#5d6878", marginTop: 0 }}>
                    All services are selected by default. Uncheck any service where this goal should not appear.
                  </p>
                  <div style={{ display: "grid", gap: 8 }}>
                    {activeParticipantServices.map((service) => (
                      <label key={service.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <input
                          type="checkbox"
                          checked={goalDraft.serviceIds.includes(service.id)}
                          onChange={(event) => setGoalDraft({
                            ...goalDraft,
                            serviceIds: event.target.checked
                              ? [...goalDraft.serviceIds, service.id]
                              : goalDraft.serviceIds.filter((id) => id !== service.id),
                          })}
                        />
                        <span>{service.service_name}{SERVICE_CODES[service.service_name] ? ` · ${SERVICE_CODES[service.service_name]}` : ""}</span>
                      </label>
                    ))}
                  </div>
                  {!goalDraft.serviceIds.length && <p style={{ color: "#9b2c2c", fontWeight: 700, marginBottom: 0 }}>Choose at least one service.</p>}
                </fieldset>
              )}

              <label style={checkLabelStyle}>
                <input type="checkbox" checked={goalDraft.requiresPromptLevel} onChange={(event) => setGoalDraft({ ...goalDraft, requiresPromptLevel: event.target.checked })} />
                Ask the worker to select a prompt level
              </label>
              <label style={checkLabelStyle}>
                <input type="checkbox" checked={goalDraft.requiresDetail} onChange={(event) => setGoalDraft({ ...goalDraft, requiresDetail: event.target.checked })} />
                Ask the worker for written details
              </label>
              {goalDraft.requiresDetail && (
                <label style={{ display: "block", fontWeight: 800, marginBottom: 14 }}>
                  Detail question
                  <input
                    value={goalDraft.detailPrompt}
                    onChange={(event) => setGoalDraft({ ...goalDraft, detailPrompt: event.target.value })}
                    placeholder="What should the worker describe?"
                    style={inputStyle}
                  />
                </label>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="submit" disabled={savingGoal} style={{ ...primaryButtonStyle, opacity: savingGoal ? 0.6 : 1 }}>
                  {savingGoal ? "Saving..." : editingGoalId ? "Save Changes" : "Add Goal"}
                </button>
                {editingGoalId && <button type="button" onClick={clearGoalDraft} style={secondaryButtonStyle}>Cancel</button>}
              </div>
            </form>
          </section>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, marginBottom: 8 }}>Assigned Workers</h2>
            <p style={{ marginTop: 0, color: "#4b5563" }}>
              These workers can currently open notes for {participant.name}. Removing access here only removes this participant assignment; it does not delete the worker or past notes.
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
                      background: "var(--dn-blue-pale)",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <strong>{worker.name}</strong>
                      <div style={{ color: "#4b5563", fontSize: 14 }}>
                        {worker.email ? `${worker.email} · ` : ""}Last submitted note: {formatDate(worker.last_note_date)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveWorkerAccess(worker)}
                      disabled={removingWorkerId === worker.id}
                      style={{
                        ...secondaryButtonStyle,
                        borderColor: "#fecaca",
                        color: "#991b1b",
                      }}
                    >
                      {removingWorkerId === worker.id ? "Removing..." : "Remove Access"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#fffbeb", color: "#92400e" }}>
              Need to add a worker? Email Bradley at bradley@supportsbroker.com for now.
            </div>
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
                    background: deliveryPreferences.includes(option.value) ? "var(--dn-pink-pale)" : "#ffffff",
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
                      border: "2px solid var(--dn-blue)",
                      borderRadius: 14,
                      background: "var(--dn-blue-pale)",
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
