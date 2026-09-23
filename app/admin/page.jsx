"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const C = { ink: "#1f2937", muted: "#5d6878", teal: "#149f91", blue: "#2e6eae", pink: "#eb88a5", yellow: "#ffd95a", pale: "#eaf3fb", border: "#d4e2ee" };
const SERVICE_CATALOG = [
  { name: "In-Home and Community Supports", code: "W7060" },
  { name: "In-Home and Community Supports Enhanced", code: "W7061" },
  { name: "Companion", code: "W1726" },
  { name: "Day Respite", code: "W9798" },
  { name: "15-Minute Respite", code: "W9862" },
];
const SERVICE_CODES = Object.fromEntries(SERVICE_CATALOG.map((service) => [service.name, service.code]));
const HIDDEN_LEGACY_SERVICES = new Set(["respite"]);
const DEFAULT_PROMPT_LEVELS = [
  "Independent",
  "Verbal Prompt",
  "Gesture Prompt",
  "Modeling",
  "Partial Physical Prompt",
  "Hand Over Hand",
  "Full Physical Prompt",
];
const PROMPT_ALIASES = {
  independent: "Independent",
  verbal: "Verbal Prompt",
  "verbal prompt": "Verbal Prompt",
  gesture: "Gesture Prompt",
  gestural: "Gesture Prompt",
  "gesture prompt": "Gesture Prompt",
  model: "Modeling",
  modeling: "Modeling",
  pp: "Partial Physical Prompt",
  "partial physical": "Partial Physical Prompt",
  "partial physical prompt": "Partial Physical Prompt",
  hoh: "Hand Over Hand",
  "hand over hand": "Hand Over Hand",
  "hand over hand prompt": "Hand Over Hand",
  fp: "Full Physical Prompt",
  "full physical": "Full Physical Prompt",
  "full physical prompt": "Full Physical Prompt",
};
const button = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 42, padding: "9px 15px", borderRadius: 8, border: `1px solid ${C.teal}`, background: C.teal, color: "white", fontWeight: 700, textDecoration: "none", cursor: "pointer" };
const secondary = { ...button, background: "white", color: C.blue, borderColor: C.border };
const input = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "white", fontSize: 16, boxSizing: "border-box" };
const card = { padding: 22, borderRadius: 14, border: `1px solid ${C.border}`, background: "white" };
const normalize = (value) => String(value || "").toLowerCase().trim();
function normalizePromptLevel(value) {
  const cleaned = String(value || "").trim().replace(/[–—-]/g, " ").replace(/\s+/g, " ");
  return PROMPT_ALIASES[cleaned.toLowerCase()] || cleaned;
}
function participantPromptLevels(participant) {
  const stored = Array.isArray(participant?.prompt_levels) && participant.prompt_levels.length
    ? participant.prompt_levels
    : DEFAULT_PROMPT_LEVELS;
  const normalized = stored.map(normalizePromptLevel).filter(Boolean);
  return [...new Set(normalized)];
}

export default function AdminDashboard() {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [workspaceId, setWorkspaceId] = useState("");
  const [participants, setParticipants] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [participantSearch, setParticipantSearch] = useState("");
  const [workerSearch, setWorkerSearch] = useState("");
  const [tab, setTab] = useState("participants");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingWorker, setSavingWorker] = useState(false);
  const [resettingId, setResettingId] = useState("");
  const [newWorker, setNewWorker] = useState({ name: "", email: "", participantId: "" });
  const [setupLink, setSetupLink] = useState("");
  const [selectedServiceNames, setSelectedServiceNames] = useState([]);
  const [savingServices, setSavingServices] = useState(false);
  const [selectedPromptLevels, setSelectedPromptLevels] = useState(DEFAULT_PROMPT_LEVELS);
  const [savingPrompts, setSavingPrompts] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState({
    categoryName: "",
    goalLabel: "",
    serviceIds: [],
    requiresDetail: false,
    requiresPromptLevel: false,
    detailPrompt: "",
  });

  useEffect(() => {
    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setChecking(false);
      const { data: membership } = await supabase.from("workspace_memberships")
        .select("workspace_id, role").eq("user_id", user.id).eq("active", true)
        .in("role", ["owner", "admin"]).limit(1).maybeSingle();
      if (membership) { setWorkspaceId(membership.workspace_id); setAuthorized(true); }
      setChecking(false);
    }
    checkAccess();
  }, []);

  useEffect(() => { if (authorized && workspaceId) loadData(); }, [authorized, workspaceId]);

  async function loadData() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const participantResponse = await fetch("/api/admin/participant-config", {
      headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      cache: "no-store",
    });
    const participantResult = await participantResponse.json();
    if (!participantResponse.ok) {
      setMessage(`Could not load participants: ${participantResult.error || "Unknown error"}`);
      setLoading(false);
      return;
    }
    const participantRows = participantResult.participants || [];
    const ids = (participantRows || []).map((row) => row.id);
    const { data: assignmentRows } = ids.length ? await supabase.from("worker_participants").select("worker_id, participant_id").in("participant_id", ids) : { data: [] };
    const { data: workerRows } = await supabase.from("workers")
      .select("id, name, email, auth_user_id, active")
      .eq("active", true)
      .order("name");
    setParticipants(participantRows || []); setAssignments(assignmentRows || []); setWorkers(workerRows || []);
    setSelectedId((current) => current || participantRows?.[0]?.id || "");
    setNewWorker((current) => ({ ...current, participantId: current.participantId || participantRows?.[0]?.id || "" }));
    setLoading(false);
  }

  const filteredParticipants = useMemo(() => participants.filter((p) => !normalize(participantSearch) || normalize(p.name).includes(normalize(participantSearch))), [participants, participantSearch]);
  const filteredWorkers = useMemo(() => workers.filter((w) => !normalize(workerSearch) || normalize(`${w.name} ${w.email}`).includes(normalize(workerSearch))), [workers, workerSearch]);
  const participant = participants.find((p) => p.id === selectedId);
  const assignedWorkerIds = assignments.filter((a) => a.participant_id === selectedId).map((a) => a.worker_id);
  const assignedWorkers = workers.filter((w) => assignedWorkerIds.includes(w.id));
  const participantNames = (workerId) => { const ids = assignments.filter((a) => a.worker_id === workerId).map((a) => a.participant_id); return participants.filter((p) => ids.includes(p.id)).map((p) => p.name); };
  const activeParticipantServices = (participant?.participant_services || []).filter((service) => service.active && !HIDDEN_LEGACY_SERVICES.has(normalize(service.service_name)));
  const hasActiveLegacyService = (participant?.participant_services || []).some((service) => service.active && HIDDEN_LEGACY_SERVICES.has(normalize(service.service_name)));
  const savedServiceNames = activeParticipantServices.map((service) => service.service_name).sort();
  const servicesDirty = hasActiveLegacyService || JSON.stringify([...selectedServiceNames].sort()) !== JSON.stringify(savedServiceNames);

  useEffect(() => {
    setSelectedServiceNames(activeParticipantServices.map((service) => service.service_name));
    if (!editingGoalId) {
      setGoalDraft((current) => ({ ...current, serviceIds: activeParticipantServices.map((service) => service.id) }));
    }
  }, [selectedId, participant?.participant_services]);

  function toggleParticipantService(serviceName) {
    setSelectedServiceNames((current) =>
      current.includes(serviceName) ? current.filter((name) => name !== serviceName) : [...current, serviceName]
    );
  }

  async function callParticipantConfig(payload) {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch("/api/admin/participant-config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token || ""}`,
      },
      body: JSON.stringify({ participantId: participant?.id, ...payload }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The change could not be saved.");
    return result;
  }

  async function saveParticipantServices() {
    if (!participant) return;
    if (!selectedServiceNames.length) return setMessage("Choose at least one service for this participant.");
    setSavingServices(true); setMessage("");
    try {
      const result = await callParticipantConfig({ action: "save_services", serviceNames: selectedServiceNames });
      setMessage(result.message);
      await loadData();
    } catch (error) {
      setMessage(`Could not save services: ${error.message}`);
    } finally {
      setSavingServices(false);
    }
  }
  const availablePromptLevels = useMemo(() => {
    const custom = participantPromptLevels(participant).filter((level) => !DEFAULT_PROMPT_LEVELS.includes(level));
    return [...DEFAULT_PROMPT_LEVELS, ...custom];
  }, [participant]);

  useEffect(() => {
    setSelectedPromptLevels(participantPromptLevels(participant));
  }, [selectedId, participant?.prompt_levels]);

  function togglePromptLevel(level) {
    setSelectedPromptLevels((current) =>
      current.includes(level) ? current.filter((item) => item !== level) : [...current, level]
    );
  }

  async function savePromptLevels() {
    if (!participant) return;
    if (!selectedPromptLevels.length) return setMessage("Choose at least one prompt level.");
    setSavingPrompts(true); setMessage("");
    const ordered = availablePromptLevels.filter((level) => selectedPromptLevels.includes(level));
    const { error } = await supabase.from("participants").update({ prompt_levels: ordered }).eq("id", participant.id);
    setSavingPrompts(false);
    if (error) return setMessage(`Could not save prompt levels: ${error.message}`);
    setMessage(`Prompt levels saved for ${participant.name}.`);
    await loadData();
  }

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
          first.goal_label.localeCompare(second.goal_label)
        ),
      }));
  }, [participant]);

  function clearGoalDraft() {
    setEditingGoalId("");
    setGoalDraft({ categoryName: "", goalLabel: "", serviceIds: activeParticipantServices.map((service) => service.id), requiresDetail: false, requiresPromptLevel: false, detailPrompt: "" });
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
    document.getElementById("goal-editor")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function saveGoal(event) {
    event.preventDefault();
    const categoryName = goalDraft.categoryName.trim() || "Goals";
    const goalLabel = goalDraft.goalLabel.trim();
    if (!participant || !goalLabel) return setMessage("Enter the goal description.");
    if (activeParticipantServices.length && !goalDraft.serviceIds.length) {
      return setMessage("Choose at least one service for this goal.");
    }
    setSavingGoal(true); setMessage("");

    try {
      const result = await callParticipantConfig({
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
      setMessage(result.message);
      clearGoalDraft();
      await loadData();
      window.setTimeout(() => document.getElementById("goals")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (error) {
      setMessage(`Could not save goal: ${error.message}`);
    } finally {
      setSavingGoal(false);
    }
  }

  async function archiveGoal(goal) {
    if (!window.confirm(`Remove “${goal.goal_label}” from the active note template?`)) return;
    try {
      const result = await callParticipantConfig({ action: "archive_goal", goalId: goal.id });
      if (editingGoalId === goal.id) clearGoalDraft();
      setMessage(result.message); await loadData();
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
      await callParticipantConfig({ action: "reorder_goals", goalIds: reordered.map((goal) => goal.id) });
      await loadData();
    } catch (error) {
      setMessage(`Could not reorder goals: ${error.message}`);
    }
  }

  async function addAndInvite(event) {
    event.preventDefault(); setMessage(""); setSetupLink("");
    if (!newWorker.name.trim() || !newWorker.email.trim() || !newWorker.participantId) return setMessage("Enter the worker's name and email, then choose a participant.");
    setSavingWorker(true);
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch("/api/admin/invite-worker", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` }, body: JSON.stringify(newWorker) });
    const result = await response.json(); setSavingWorker(false);
    if (!response.ok) return setMessage(result.error || "The worker could not be added.");
    setMessage(result.warning ? `${result.message} (${result.warning})` : result.message); setSetupLink(result.setupLink || "");
    setNewWorker({ name: "", email: "", participantId: newWorker.participantId }); await loadData();
  }

  async function resetPassword(worker) {
    setMessage(""); setSetupLink(""); setResettingId(worker.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/admin/reset-worker-password", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` }, body: JSON.stringify({ workerId: worker.id }) });
      const result = await response.json();
      setMessage(response.ok ? (result.warning ? `${result.message} (${result.warning})` : result.message) : result.error || "Password help failed.");
      if (response.ok) setSetupLink(result.resetLink || "");
    } catch {
      setMessage("Password help could not be sent. Please try again.");
    } finally {
      setResettingId("");
    }
  }

  async function resendSetup(worker) {
    if (!worker.email) return setMessage(`${worker.name} does not have an email address saved yet.`);
    setMessage(""); setSetupLink(""); setResettingId(worker.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/admin/invite-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ workerId: worker.id, participantId: selectedId, email: worker.email }),
      });
      const result = await response.json();
      setMessage(response.ok ? (result.warning ? `${result.message} (${result.warning})` : result.message) : result.error || "Setup help failed.");
      if (response.ok) { setSetupLink(result.setupLink || ""); await loadData(); }
    } catch {
      setMessage("Setup help could not be sent. Please try again.");
    } finally {
      setResettingId("");
    }
  }

  async function signOut() { await supabase.auth.signOut(); window.location.href = "/login"; }

  if (checking) return <main style={{ padding: 30 }}>Checking access…</main>;
  if (!authorized) return <main style={{ maxWidth: 620, margin: "70px auto", padding: 24 }}><h1>Administrator access required</h1><p>Please sign in with your DreamNote administrator account.</p><Link href="/login" style={button}>Go to sign in</Link></main>;

  return <main style={{ maxWidth: 1180, margin: "0 auto", padding: "34px 20px 70px", color: C.ink }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, marginBottom: 26 }}><div><h1 style={{ fontSize: "clamp(34px,5vw,54px)", margin: 0 }}>DreamNote Admin</h1><p style={{ color: C.muted, fontSize: 18 }}>Manage one participant at a time, with a separate worker directory.</p></div><button onClick={signOut} style={secondary}>Sign Out</button></header>
    {message && <div role="status" style={{ padding: 14, marginBottom: 18, borderRadius: 9, background: "#fff8df", border: "1px solid #ead58a" }}>{message}</div>}
    {setupLink && <div style={{ ...card, marginBottom: 18, background: "var(--dn-yellow-pale)", borderColor: C.yellow }}><strong>Backup access link</strong><p style={{ color: C.muted, margin: "6px 0 10px" }}>Copy this link and send it directly if the email is filtered or its button is not clickable.</p><textarea readOnly value={setupLink} rows={3} style={{ ...input, resize: "vertical" }} /><button type="button" onClick={() => navigator.clipboard.writeText(setupLink)} style={{ ...secondary, marginTop: 8 }}>Copy Link</button></div>}
    <nav style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
      <button onClick={() => setTab("participants")} style={{ ...secondary, ...(tab === "participants" ? { background: C.teal, color: "white" } : {}) }}>Participants</button>
      <button onClick={() => setTab("workers")} style={{ ...secondary, ...(tab === "workers" ? { background: C.teal, color: "white" } : {}) }}>Workers</button>
      <Link href="/admin/tools" style={secondary}>Advanced Tools</Link>
    </nav>

    {tab === "participants" && <section className="admin-grid">
      <aside style={{ ...card, padding: 16 }}><h2 style={{ marginTop: 0 }}>Participants</h2><input value={participantSearch} onChange={(e) => setParticipantSearch(e.target.value)} placeholder="Search participants" style={input} /><div style={{ marginTop: 12, maxHeight: 570, overflowY: "auto", display: "grid", gap: 7 }}>{filteredParticipants.map((p) => <button key={p.id} onClick={() => { setSelectedId(p.id); clearGoalDraft(); }} style={{ textAlign: "left", padding: 12, borderRadius: 8, cursor: "pointer", fontWeight: 700, border: `1px solid ${p.id === selectedId ? C.teal : C.border}`, color: C.ink, background: p.id === selectedId ? C.pale : "white" }}>{p.name}</button>)}{!filteredParticipants.length && <p style={{ color: C.muted }}>No participants found.</p>}</div></aside>
      <div>{loading ? <p>Loading participant…</p> : participant ? <>
        <section style={card}><h2 style={{ fontSize: 30, margin: "0 0 4px" }}>{participant.name}</h2><p style={{ color: C.muted, marginTop: 0 }}>CLE: {participant.cle_email || "Not assigned"}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 10, margin: "20px 0" }}><Summary value={assignedWorkers.length} label="Assigned workers" /><Summary value={(participant.participant_goals || []).filter((g) => g.active).length} label="Active goals" /><Summary value={(participant.participant_services || []).filter((s) => s.active).length || (participant.service_name ? 1 : 0)} label="Services" /></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}><Link href="#goals" style={button}>Manage Goals</Link><Link href={`/admin/cle-preview/${participant.id}`} style={secondary}>Preview CLE Portal</Link><Link href={`/note-template/${participant.id}`} target="_blank" style={secondary}>View Blank Note</Link></div>
        </section>
        <section style={{ ...card, marginTop: 18 }}>
          <h2 style={{ margin: "0 0 5px" }}>Services</h2>
          <p style={{ color: C.muted, marginTop: 0 }}>Choose the services {participant.name} receives. Workers will select one of these when starting a note.</p>
          <div style={{ display: "grid", gap: 8, maxWidth: 650 }}>
            {[...new Set([...SERVICE_CATALOG.map((service) => service.name), ...(participant.participant_services || []).map((service) => service.service_name)])].filter((serviceName) => !HIDDEN_LEGACY_SERVICES.has(normalize(serviceName))).map((serviceName) => <label key={serviceName} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 9, border: `1px solid ${selectedServiceNames.includes(serviceName) ? C.blue : C.border}`, background: selectedServiceNames.includes(serviceName) ? "var(--dn-blue-pale)" : "white", cursor: "pointer" }}>
              <input type="checkbox" checked={selectedServiceNames.includes(serviceName)} onChange={() => toggleParticipantService(serviceName)} />
              <strong>{serviceName}</strong>
              {SERVICE_CODES[serviceName] && <span style={{ marginLeft: "auto", color: C.muted, fontWeight: 700 }}>{SERVICE_CODES[serviceName]}</span>}
            </label>)}
          </div>
          <button onClick={saveParticipantServices} disabled={savingServices || !selectedServiceNames.length || !servicesDirty} style={{ ...button, marginTop: 14, opacity: savingServices || !selectedServiceNames.length || !servicesDirty ? .55 : 1 }}>{savingServices ? "Saving…" : servicesDirty ? "Save Services" : "Services Saved"}</button>
          {!selectedServiceNames.length && <p style={{ color: "#9b2c2c", fontWeight: 700 }}>At least one service is required.</p>}
          {servicesDirty && selectedServiceNames.length > 0 && <p style={{ padding: 10, borderRadius: 8, background: "var(--dn-yellow-pale)", color: C.ink, fontWeight: 700 }}>Save these service changes before adding or editing goals.</p>}
        </section>
        <section id="goals" style={{ ...card, marginTop: 18, scrollMarginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}><div><h2 style={{ margin: 0 }}>Goals</h2><p style={{ color: C.muted, margin: "5px 0 0" }}>Goals are grouped by category. Use the arrows to change their order inside a category.</p></div><button disabled={servicesDirty} onClick={() => { clearGoalDraft(); document.getElementById("goal-editor")?.scrollIntoView({ behavior: "smooth", block: "center" }); }} style={{ ...button, opacity: servicesDirty ? .5 : 1 }}>Add Goal</button></div>
          {servicesDirty && <p style={{ padding: 10, borderRadius: 8, background: "var(--dn-yellow-pale)", fontWeight: 700 }}>Save the Services section above before changing goals.</p>}
          <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
            {groupedGoals.map((group) => <section key={group.category} style={{ border: `1px solid ${C.border}`, borderRadius: 11, overflow: "hidden" }}>
              <h3 style={{ margin: 0, padding: "11px 14px", background: "#fff7cf", color: C.blue, borderLeft: `6px solid ${C.pink}` }}>{group.category}</h3>
              {group.goals.map((goal, index) => {
                const applicableIds = Array.isArray(goal.applicable_service_ids) && goal.applicable_service_ids.length
                  ? goal.applicable_service_ids
                  : goal.participant_service_id
                    ? [goal.participant_service_id]
                    : [];
                const applicableNames = applicableIds.length
                  ? (participant.participant_services || []).filter((service) => applicableIds.includes(service.id)).map((service) => service.service_name)
                  : [];
                return <article key={goal.id} style={{ padding: 14, borderTop: index ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}><div><strong>{goal.goal_label}</strong><div style={{ color: C.blue, fontSize: 13, fontWeight: 700, marginTop: 4 }}>{applicableIds.length ? applicableNames.join(" · ") || "No active services" : "All services"}</div>{goal.requires_prompt_level && <span style={tag}>Prompt level</span>}{goal.requires_detail && <span style={tag}>Written detail</span>}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}><button aria-label={`Move ${goal.goal_label} up`} disabled={index === 0 || servicesDirty} onClick={() => moveGoal(group.category, goal.id, -1)} style={{ ...smallButton, opacity: index === 0 || servicesDirty ? .4 : 1 }}>↑</button><button aria-label={`Move ${goal.goal_label} down`} disabled={index === group.goals.length - 1 || servicesDirty} onClick={() => moveGoal(group.category, goal.id, 1)} style={{ ...smallButton, opacity: index === group.goals.length - 1 || servicesDirty ? .4 : 1 }}>↓</button><button disabled={servicesDirty} onClick={() => editGoal(goal)} style={{ ...smallButton, opacity: servicesDirty ? .4 : 1 }}>Edit</button><button disabled={servicesDirty} onClick={() => archiveGoal(goal)} style={{ ...smallButton, color: "#9b2c2c", opacity: servicesDirty ? .4 : 1 }}>Remove</button></div>
                  </div>
                </article>;
              })}
            </section>)}
            {!groupedGoals.length && <p style={{ padding: 16, borderRadius: 9, background: C.pale, color: C.muted }}>No active goals yet.</p>}
          </div>

          <form id="goal-editor" onSubmit={saveGoal} style={{ marginTop: 20, padding: 18, borderRadius: 11, background: C.pale, scrollMarginTop: 20 }}>
            <h3 style={{ marginTop: 0 }}>{editingGoalId ? "Edit Goal" : "Add Goal"}</h3>
            <div className="goal-fields"><Field label="Category"><input value={goalDraft.categoryName} onChange={(e) => setGoalDraft({ ...goalDraft, categoryName: e.target.value })} placeholder="Example: Community Activities" style={input} /></Field><Field label="Goal"><textarea value={goalDraft.goalLabel} onChange={(e) => setGoalDraft({ ...goalDraft, goalLabel: e.target.value })} rows={3} style={{ ...input, resize: "vertical" }} /></Field></div>
            {activeParticipantServices.length > 0 && <fieldset style={{ margin: "0 0 14px", padding: 14, borderRadius: 9, border: `1px solid ${C.border}` }}><legend style={{ fontWeight: 800 }}>Services for this goal</legend><p style={{ color: C.muted, marginTop: 0 }}>All services are selected by default. Uncheck any service where this goal should not appear.</p><div style={{ display: "grid", gap: 8 }}>{activeParticipantServices.map((service) => <label key={service.id} style={{ display: "flex", alignItems: "center", gap: 9 }}><input type="checkbox" checked={goalDraft.serviceIds.includes(service.id)} onChange={(e) => setGoalDraft({ ...goalDraft, serviceIds: e.target.checked ? [...goalDraft.serviceIds, service.id] : goalDraft.serviceIds.filter((id) => id !== service.id) })} /><span>{service.service_name}{SERVICE_CODES[service.service_name] ? ` · ${SERVICE_CODES[service.service_name]}` : ""}</span></label>)}</div>{!goalDraft.serviceIds.length && <p style={{ color: "#9b2c2c", fontWeight: 700, marginBottom: 0 }}>Choose at least one service.</p>}</fieldset>}
            <label style={checkLabel}><input type="checkbox" checked={goalDraft.requiresPromptLevel} onChange={(e) => setGoalDraft({ ...goalDraft, requiresPromptLevel: e.target.checked })} /> Ask the worker to select a prompt level</label>
            <label style={checkLabel}><input type="checkbox" checked={goalDraft.requiresDetail} onChange={(e) => setGoalDraft({ ...goalDraft, requiresDetail: e.target.checked })} /> Ask the worker for written details</label>
            {goalDraft.requiresDetail && <Field label="Detail question"><input value={goalDraft.detailPrompt} onChange={(e) => setGoalDraft({ ...goalDraft, detailPrompt: e.target.value })} placeholder="What should the worker describe?" style={input} /></Field>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button type="submit" disabled={savingGoal || servicesDirty} style={{ ...button, opacity: savingGoal || servicesDirty ? .6 : 1 }}>{savingGoal ? "Saving…" : editingGoalId ? "Save Changes" : "Add Goal"}</button>{editingGoalId && <button type="button" onClick={clearGoalDraft} style={secondary}>Cancel</button>}</div>
          </form>
        </section>
        <section style={{ ...card, marginTop: 18 }}>
          <h2 style={{ margin: "0 0 5px" }}>Prompt Levels</h2>
          <p style={{ color: C.muted, marginTop: 0 }}>Choose which prompt levels workers can select for {participant.name}. They appear in this hierarchy whenever a goal requires a prompt level.</p>
          <div style={{ display: "grid", gap: 8, maxWidth: 620 }}>
            {availablePromptLevels.map((level, index) => <label key={level} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 9, border: `1px solid ${selectedPromptLevels.includes(level) ? C.pink : C.border}`, background: selectedPromptLevels.includes(level) ? "var(--dn-pink-pale)" : "white", cursor: "pointer" }}>
              <input type="checkbox" checked={selectedPromptLevels.includes(level)} onChange={() => togglePromptLevel(level)} />
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 27, height: 27, borderRadius: 14, background: selectedPromptLevels.includes(level) ? C.yellow : C.pale, color: C.ink, fontSize: 13, fontWeight: 800 }}>{index + 1}</span>
              <strong>{level}</strong>
            </label>)}
          </div>
          <button onClick={savePromptLevels} disabled={savingPrompts || !selectedPromptLevels.length} style={{ ...button, marginTop: 14, opacity: savingPrompts || !selectedPromptLevels.length ? .55 : 1 }}>{savingPrompts ? "Saving…" : "Save Prompt Levels"}</button>
          {!selectedPromptLevels.length && <p style={{ color: "#9b2c2c", fontWeight: 700 }}>At least one prompt level is required.</p>}
        </section>
        <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Assigned Workers</h2>{assignedWorkers.length ? assignedWorkers.map((w) => <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, padding: "13px 0", borderBottom: `1px solid ${C.border}` }}><div><strong>{w.name}</strong><div style={{ color: C.muted }}>{w.email || "No email account linked"}</div><div style={{ color: w.auth_user_id ? C.teal : "#9b6500", fontSize: 13, fontWeight: 700, marginTop: 3 }}>{w.auth_user_id ? "Email/password account linked" : "Setup not completed"}</div></div>{w.email && <button onClick={() => w.auth_user_id ? resetPassword(w) : resendSetup(w)} disabled={resettingId === w.id} style={secondary}>{resettingId === w.id ? "Preparing link…" : w.auth_user_id ? "Send Password Help" : "Send Setup Link"}</button>}</div>) : <p style={{ color: C.muted }}>No workers assigned.</p>}<button onClick={() => { setTab("workers"); setNewWorker((current) => ({ ...current, participantId: participant.id })); }} style={{ ...button, marginTop: 14 }}>Add a Worker</button></section>
      </> : <p>Select a participant.</p>}</div>
    </section>}

    {tab === "workers" && <section className="worker-grid">
      <form onSubmit={addAndInvite} style={{ ...card, alignSelf: "start", background: C.pale }}><h2 style={{ marginTop: 0 }}>Add & Invite Worker</h2><p style={{ color: C.muted }}>Create the account, assign the participant, and send one setup link.</p>
        <Field label="Worker name"><input value={newWorker.name} onChange={(e) => setNewWorker({ ...newWorker, name: e.target.value })} style={input} /></Field>
        <Field label="Email"><input type="email" value={newWorker.email} onChange={(e) => setNewWorker({ ...newWorker, email: e.target.value })} style={input} /></Field>
        <Field label="Participant"><select value={newWorker.participantId} onChange={(e) => setNewWorker({ ...newWorker, participantId: e.target.value })} style={input}><option value="">Choose participant</option>{participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <button type="submit" disabled={savingWorker} style={{ ...button, width: "100%", opacity: savingWorker ? .6 : 1 }}>{savingWorker ? "Creating access…" : "Create Access & Send Link"}</button>
        {setupLink && <div style={{ marginTop: 16 }}><strong>Backup setup link</strong><p style={{ color: C.muted, fontSize: 14 }}>Copy this if the email is filtered or its button is not clickable.</p><textarea readOnly value={setupLink} rows={4} style={{ ...input, resize: "vertical" }} /><button type="button" onClick={() => navigator.clipboard.writeText(setupLink)} style={{ ...secondary, marginTop: 8 }}>Copy Link</button></div>}
      </form>
      <div style={card}><h2 style={{ marginTop: 0 }}>Worker Directory</h2><input value={workerSearch} onChange={(e) => setWorkerSearch(e.target.value)} placeholder="Search workers by name or email" style={input} /><div style={{ marginTop: 12, maxHeight: 650, overflowY: "auto" }}>{filteredWorkers.map((w) => <article key={w.id} style={{ padding: "14px 4px", borderBottom: `1px solid ${C.border}` }}><strong style={{ fontSize: 18 }}>{w.name}</strong><div style={{ color: C.muted }}>{w.email || "No email account linked"}</div><div style={{ margin: "5px 0 10px", fontSize: 14 }}>Participants: {participantNames(w.id).join(", ") || "None"}</div>{w.auth_user_id && w.email && <button onClick={() => resetPassword(w)} disabled={resettingId === w.id} style={secondary}>{resettingId === w.id ? "Sending…" : "Send Password Reset"}</button>}</article>)}{!filteredWorkers.length && <p style={{ color: C.muted }}>No workers found.</p>}</div></div>
    </section>}
    <style jsx global>{`.admin-grid{display:grid;grid-template-columns:minmax(230px,320px) minmax(0,1fr);gap:20px}.worker-grid{display:grid;grid-template-columns:minmax(280px,420px) minmax(0,1fr);gap:20px}.goal-fields{display:grid;grid-template-columns:minmax(180px,.7fr) minmax(260px,1.3fr);gap:12px}@media(max-width:760px){.admin-grid,.worker-grid,.goal-fields{grid-template-columns:1fr}main header{align-items:stretch!important;flex-direction:column}main header button{align-self:flex-start}}`}</style>
  </main>;
}

function Summary({ value, label }) { return <div style={{ background: C.pale, border: `1px solid ${C.border}`, borderRadius: 10, padding: 15 }}><strong style={{ display: "block", color: C.teal, fontSize: 28 }}>{value}</strong><span style={{ color: C.muted }}>{label}</span></div>; }
function Field({ label, children }) { return <label style={{ display: "grid", gap: 6, marginBottom: 13 }}><strong>{label}</strong>{children}</label>; }

const smallButton = { minHeight: 34, padding: "5px 9px", borderRadius: 7, border: `1px solid ${C.border}`, background: "white", color: C.ink, fontWeight: 700, cursor: "pointer" };
const tag = { display: "inline-block", margin: "7px 6px 0 0", padding: "3px 7px", borderRadius: 12, background: C.pale, color: C.muted, fontSize: 12, border: `1px solid ${C.border}` };
const checkLabel = { display: "flex", alignItems: "center", gap: 9, margin: "12px 0", fontWeight: 600 };
