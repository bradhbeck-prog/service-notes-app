"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const C = { ink: "#1f2937", muted: "#5d6878", teal: "#149f91", blue: "#2e6eae", pink: "#eb88a5", yellow: "#ffd95a", pale: "#eaf3fb", border: "#d4e2ee" };
const SERVICE_CODES = { "In-Home and Community Supports": "W7060", "In-Home and Community Supports Enhanced": "W7061", Companion: "W1726", "Day Respite": "W9798", "15-Minute Respite": "W9862" };
const button = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 42, padding: "9px 15px", borderRadius: 8, border: `1px solid ${C.teal}`, background: C.teal, color: "white", fontWeight: 700, textDecoration: "none", cursor: "pointer" };
const secondary = { ...button, background: "white", color: C.blue, borderColor: C.border };
const input = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "white", fontSize: 16, boxSizing: "border-box" };
const card = { padding: 22, borderRadius: 14, border: `1px solid ${C.border}`, background: "white" };
const normalize = (value) => String(value || "").toLowerCase().trim();

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
  const [editingGoalId, setEditingGoalId] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState({
    categoryName: "",
    goalLabel: "",
    serviceId: "",
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
    const { data: participantRows, error } = await supabase.from("participants").select(`
      id, name, cle_email, active, service_name, workspace_id,
      participant_services (id, service_name, active),
      participant_goals (
        id, participant_id, participant_service_id, goal_label, category_name,
        sort_order, active, requires_detail, requires_prompt_level, detail_prompt
      )
    `).eq("workspace_id", workspaceId).eq("active", true).order("name");
    if (error) { setMessage(`Could not load participants: ${error.message}`); setLoading(false); return; }
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
    setGoalDraft({ categoryName: "", goalLabel: "", serviceId: "", requiresDetail: false, requiresPromptLevel: false, detailPrompt: "" });
  }

  function editGoal(goal) {
    setEditingGoalId(goal.id);
    setGoalDraft({
      categoryName: goal.category_name || "Goals",
      goalLabel: goal.goal_label || "",
      serviceId: goal.participant_service_id || "",
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
    setSavingGoal(true); setMessage("");

    const existing = participant.participant_goals?.find((goal) => goal.id === editingGoalId);
    const categoryChanged = existing && (existing.category_name || "Goals") !== categoryName;
    const categoryGoals = (participant.participant_goals || []).filter((goal) =>
      goal.active && goal.id !== editingGoalId && (goal.category_name || "Goals") === categoryName
    );
    const nextOrder = Math.max(0, ...categoryGoals.map((goal) => Number(goal.sort_order) || 0)) + 1;
    const values = {
      participant_id: participant.id,
      participant_service_id: goalDraft.serviceId || null,
      category_name: categoryName,
      goal_label: goalLabel,
      requires_detail: goalDraft.requiresDetail,
      requires_prompt_level: goalDraft.requiresPromptLevel,
      detail_prompt: goalDraft.requiresDetail ? goalDraft.detailPrompt.trim() || null : null,
      active: true,
      sort_order: !existing || categoryChanged ? nextOrder : existing.sort_order || nextOrder,
    };

    const { error } = editingGoalId
      ? await supabase.from("participant_goals").update(values).eq("id", editingGoalId)
      : await supabase.from("participant_goals").insert(values);
    setSavingGoal(false);
    if (error) return setMessage(`Could not save goal: ${error.message}`);
    setMessage(editingGoalId ? "Goal updated." : "Goal added.");
    clearGoalDraft(); await loadData();
  }

  async function archiveGoal(goal) {
    if (!window.confirm(`Remove “${goal.goal_label}” from the active note template?`)) return;
    const { error } = await supabase.from("participant_goals").update({ active: false }).eq("id", goal.id);
    if (error) return setMessage(`Could not remove goal: ${error.message}`);
    if (editingGoalId === goal.id) clearGoalDraft();
    setMessage("Goal removed from the active template."); await loadData();
  }

  async function moveGoal(category, goalId, direction) {
    const group = groupedGoals.find((item) => item.category === category);
    if (!group) return;
    const currentIndex = group.goals.findIndex((goal) => goal.id === goalId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= group.goals.length) return;
    const reordered = [...group.goals];
    [reordered[currentIndex], reordered[nextIndex]] = [reordered[nextIndex], reordered[currentIndex]];
    const results = await Promise.all(reordered.map((goal, index) =>
      supabase.from("participant_goals").update({ sort_order: index + 1 }).eq("id", goal.id)
    ));
    const failed = results.find((result) => result.error);
    if (failed) return setMessage(`Could not reorder goals: ${failed.error.message}`);
    await loadData();
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
    setMessage(""); setResettingId(worker.id);
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch("/api/admin/reset-worker-password", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` }, body: JSON.stringify({ workerId: worker.id }) });
    const result = await response.json(); setResettingId(""); setMessage(response.ok ? result.message : result.error || "Password reset failed.");
  }

  async function signOut() { await supabase.auth.signOut(); window.location.href = "/login"; }

  if (checking) return <main style={{ padding: 30 }}>Checking access…</main>;
  if (!authorized) return <main style={{ maxWidth: 620, margin: "70px auto", padding: 24 }}><h1>Administrator access required</h1><p>Please sign in with your DreamNote administrator account.</p><Link href="/login" style={button}>Go to sign in</Link></main>;

  return <main style={{ maxWidth: 1180, margin: "0 auto", padding: "34px 20px 70px", color: C.ink }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, marginBottom: 26 }}><div><h1 style={{ fontSize: "clamp(34px,5vw,54px)", margin: 0 }}>DreamNote Admin</h1><p style={{ color: C.muted, fontSize: 18 }}>Manage one participant at a time, with a separate worker directory.</p></div><button onClick={signOut} style={secondary}>Sign Out</button></header>
    {message && <div role="status" style={{ padding: 14, marginBottom: 18, borderRadius: 9, background: "#fff8df", border: "1px solid #ead58a" }}>{message}</div>}
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
        <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Services</h2><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{(participant.participant_services || []).filter((s) => s.active).map((s) => <span key={s.id} style={{ padding: "8px 11px", borderRadius: 20, background: C.pale, border: `1px solid ${C.border}` }}>{s.service_name}{SERVICE_CODES[s.service_name] ? ` · ${SERVICE_CODES[s.service_name]}` : ""}</span>)}{!participant.participant_services?.some((s) => s.active) && <span style={{ color: C.muted }}>{participant.service_name || "No service selected"}</span>}</div></section>
        <section id="goals" style={{ ...card, marginTop: 18, scrollMarginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}><div><h2 style={{ margin: 0 }}>Goals</h2><p style={{ color: C.muted, margin: "5px 0 0" }}>Goals are grouped by category. Use the arrows to change their order inside a category.</p></div><button onClick={() => { clearGoalDraft(); document.getElementById("goal-editor")?.scrollIntoView({ behavior: "smooth", block: "center" }); }} style={button}>Add Goal</button></div>
          <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
            {groupedGoals.map((group) => <section key={group.category} style={{ border: `1px solid ${C.border}`, borderRadius: 11, overflow: "hidden" }}>
              <h3 style={{ margin: 0, padding: "11px 14px", background: "#fff7cf", color: C.blue, borderLeft: `6px solid ${C.pink}` }}>{group.category}</h3>
              {group.goals.map((goal, index) => {
                const service = participant.participant_services?.find((item) => item.id === goal.participant_service_id);
                return <article key={goal.id} style={{ padding: 14, borderTop: index ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}><div><strong>{goal.goal_label}</strong>{service && <div style={{ color: C.muted, fontSize: 14, marginTop: 3 }}>{service.service_name}</div>}{goal.requires_prompt_level && <span style={tag}>Prompt level</span>}{goal.requires_detail && <span style={tag}>Written detail</span>}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}><button aria-label={`Move ${goal.goal_label} up`} disabled={index === 0} onClick={() => moveGoal(group.category, goal.id, -1)} style={{ ...smallButton, opacity: index === 0 ? .4 : 1 }}>↑</button><button aria-label={`Move ${goal.goal_label} down`} disabled={index === group.goals.length - 1} onClick={() => moveGoal(group.category, goal.id, 1)} style={{ ...smallButton, opacity: index === group.goals.length - 1 ? .4 : 1 }}>↓</button><button onClick={() => editGoal(goal)} style={smallButton}>Edit</button><button onClick={() => archiveGoal(goal)} style={{ ...smallButton, color: "#9b2c2c" }}>Remove</button></div>
                  </div>
                </article>;
              })}
            </section>)}
            {!groupedGoals.length && <p style={{ padding: 16, borderRadius: 9, background: C.pale, color: C.muted }}>No active goals yet.</p>}
          </div>

          <form id="goal-editor" onSubmit={saveGoal} style={{ marginTop: 20, padding: 18, borderRadius: 11, background: C.pale, scrollMarginTop: 20 }}>
            <h3 style={{ marginTop: 0 }}>{editingGoalId ? "Edit Goal" : "Add Goal"}</h3>
            <div className="goal-fields"><Field label="Category"><input value={goalDraft.categoryName} onChange={(e) => setGoalDraft({ ...goalDraft, categoryName: e.target.value })} placeholder="Example: Community Activities" style={input} /></Field><Field label="Goal"><textarea value={goalDraft.goalLabel} onChange={(e) => setGoalDraft({ ...goalDraft, goalLabel: e.target.value })} rows={3} style={{ ...input, resize: "vertical" }} /></Field></div>
            {(participant.participant_services || []).filter((service) => service.active).length > 1 && <Field label="Service"><select value={goalDraft.serviceId} onChange={(e) => setGoalDraft({ ...goalDraft, serviceId: e.target.value })} style={input}><option value="">All services</option>{participant.participant_services.filter((service) => service.active).map((service) => <option key={service.id} value={service.id}>{service.service_name}</option>)}</select></Field>}
            <label style={checkLabel}><input type="checkbox" checked={goalDraft.requiresPromptLevel} onChange={(e) => setGoalDraft({ ...goalDraft, requiresPromptLevel: e.target.checked })} /> Ask the worker to select a prompt level</label>
            <label style={checkLabel}><input type="checkbox" checked={goalDraft.requiresDetail} onChange={(e) => setGoalDraft({ ...goalDraft, requiresDetail: e.target.checked })} /> Ask the worker for written details</label>
            {goalDraft.requiresDetail && <Field label="Detail question"><input value={goalDraft.detailPrompt} onChange={(e) => setGoalDraft({ ...goalDraft, detailPrompt: e.target.value })} placeholder="What should the worker describe?" style={input} /></Field>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button type="submit" disabled={savingGoal} style={{ ...button, opacity: savingGoal ? .6 : 1 }}>{savingGoal ? "Saving…" : editingGoalId ? "Save Changes" : "Add Goal"}</button>{editingGoalId && <button type="button" onClick={clearGoalDraft} style={secondary}>Cancel</button>}</div>
          </form>
        </section>
        <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Assigned Workers</h2>{assignedWorkers.length ? assignedWorkers.map((w) => <div key={w.id} style={{ padding: "12px 0", borderBottom: `1px solid ${C.border}` }}><strong>{w.name}</strong><div style={{ color: C.muted }}>{w.email || "No email account linked"}</div></div>) : <p style={{ color: C.muted }}>No workers assigned.</p>}<button onClick={() => { setTab("workers"); setNewWorker((current) => ({ ...current, participantId: participant.id })); }} style={{ ...button, marginTop: 14 }}>Add a Worker</button></section>
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
