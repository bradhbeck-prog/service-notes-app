"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AdminPage() {
  const [adminPin, setAdminPin] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [message, setMessage] = useState("");

  const [workerName, setWorkerName] = useState("");
  const [workerPin, setWorkerPin] = useState("");

  const [participantName, setParticipantName] = useState("");
  const [participantCleEmail, setParticipantCleEmail] = useState("");
  const [participantServiceName, setParticipantServiceName] = useState("");
  const [participantOutcomePhrase, setParticipantOutcomePhrase] = useState("");
  const [participantOutcomeStatement, setParticipantOutcomeStatement] = useState("");
  const [participantOutcomeActionPlan, setParticipantOutcomeActionPlan] = useState("");

  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [selectedParticipantId, setSelectedParticipantId] = useState("");

  const [goalParticipantId, setGoalParticipantId] = useState("");
const [goalCategoryName, setGoalCategoryName] = useState("");
const [goalLabel, setGoalLabel] = useState("");
const [goalSortOrder, setGoalSortOrder] = useState("1");

const [editingGoalId, setEditingGoalId] = useState("");
const [editGoalCategoryName, setEditGoalCategoryName] = useState("");
const [editGoalLabel, setEditGoalLabel] = useState("");
const [editGoalSortOrder, setEditGoalSortOrder] = useState("1");

  const [serviceParticipantId, setServiceParticipantId] = useState("");
  const [serviceName, setServiceName] = useState("");

  const [outcomeParticipantId, setOutcomeParticipantId] = useState("");
  const [outcomePhrase, setOutcomePhrase] = useState("");
  const [outcomeStatement, setOutcomeStatement] = useState("");
  const [outcomeActionPlan, setOutcomeActionPlan] = useState("");

  const [editingParticipantId, setEditingParticipantId] = useState("");
  const [editingParticipantName, setEditingParticipantName] = useState("");
  const [editingParticipantCleEmail, setEditingParticipantCleEmail] = useState("");

  const [pinEditWorkerId, setPinEditWorkerId] = useState("");
  const [newWorkerPin, setNewWorkerPin] = useState("");

  const [deleteWorkerId, setDeleteWorkerId] = useState("");
  const [deleteParticipantId, setDeleteParticipantId] = useState("");
  const [removeAssignmentWorkerId, setRemoveAssignmentWorkerId] = useState("");
  const [removeAssignmentParticipantId, setRemoveAssignmentParticipantId] = useState("");

  useEffect(() => {
    if (!authorized) return;
    loadData();
  }, [authorized]);

  async function loadData() {
    setMessage("");

    const { data: workerRows } = await supabase
      .from("workers")
      .select("*")
      .order("name");

    const { data: participantRows } = await supabase
      .from("participants")
      .select(`
        *,
        participant_goals (
          id,
          goal_label,
          category_name,
          sort_order,
          active
        ),
        participant_services (
          id,
          service_name,
          active
        ),
        participant_outcomes (
          id,
          outcome_phrase,
          outcome_statement,
          outcome_action_plan
        )
      `)
      .order("name");

    const { data: assignmentRows } = await supabase
      .from("worker_participants")
      .select("*");

    setWorkers(workerRows || []);
    setParticipants(participantRows || []);
    setAssignments(assignmentRows || []);
  }

  async function handleAddWorker() {
    setMessage("");

    if (!workerName.trim() || !workerPin.trim()) {
      setMessage("Enter worker name and PIN.");
      return;
    }

    if (workerPin.trim() === process.env.NEXT_PUBLIC_ADMIN_PIN) {
      setMessage("That PIN is reserved for admin. Please choose a different PIN.");
      return;
    }

    const { error } = await supabase.from("workers").insert([
      {
        name: workerName.trim(),
        pin: workerPin.trim(),
        active: true,
      },
    ]);

    if (error) {
      if (error.code === "23505") {
        setMessage("That PIN is already in use. Please choose a different PIN.");
      } else {
        setMessage(`Error adding worker: ${error.message}`);
      }
      return;
    }

    setWorkerName("");
    setWorkerPin("");
    setMessage("Worker added.");
    loadData();
  }

  async function handleUpdateWorkerPin() {
    setMessage("");

    if (!pinEditWorkerId || !newWorkerPin.trim()) {
      setMessage("Select a worker and enter a new PIN.");
      return;
    }

    if (newWorkerPin.trim() === process.env.NEXT_PUBLIC_ADMIN_PIN) {
      setMessage("That PIN is reserved for admin. Please choose a different PIN.");
      return;
    }

    const { error } = await supabase
      .from("workers")
      .update({ pin: newWorkerPin.trim() })
      .eq("id", pinEditWorkerId);

    if (error) {
      if (error.code === "23505") {
        setMessage("That PIN is already in use. Please choose a different PIN.");
      } else {
        setMessage(`Error updating worker PIN: ${error.message}`);
      }
      return;
    }

    setPinEditWorkerId("");
    setNewWorkerPin("");
    setMessage("Worker PIN updated.");
    loadData();
  }

  async function handleDeleteWorker() {
    setMessage("");

    if (!deleteWorkerId) {
      setMessage("Select a worker to remove.");
      return;
    }

    const worker = workers.find((w) => w.id === deleteWorkerId);
    const confirmed = window.confirm(
      `Remove worker${worker ? ` "${worker.name}"` : ""}? This will also remove their participant assignments.`
    );

    if (!confirmed) return;

    const { error: assignmentError } = await supabase
      .from("worker_participants")
      .delete()
      .eq("worker_id", deleteWorkerId);

    if (assignmentError) {
      setMessage(`Error removing worker assignments: ${assignmentError.message}`);
      return;
    }

    const { error: workerError } = await supabase
      .from("workers")
      .delete()
      .eq("id", deleteWorkerId);

    if (workerError) {
      setMessage(`Error removing worker: ${workerError.message}`);
      return;
    }

    setDeleteWorkerId("");
    setMessage("Worker removed.");
    loadData();
  }

  async function handleAddParticipant() {
    setMessage("");

    if (!participantName.trim()) {
      setMessage("Enter participant name.");
      return;
    }

    const { data: participantInsert, error: participantError } = await supabase
      .from("participants")
      .insert([
        {
          name: participantName.trim(),
          cle_email: participantCleEmail.trim() || null,
          service_name: participantServiceName.trim() || null,
          outcome_phrase: participantOutcomePhrase.trim() || null,
          active: true,
        },
      ])
      .select()
      .single();

    if (participantError) {
      setMessage(`Error adding participant: ${participantError.message}`);
      return;
    }

    if (
      participantOutcomePhrase.trim() ||
      participantOutcomeStatement.trim() ||
      participantOutcomeActionPlan.trim()
    ) {
      const { error: outcomeError } = await supabase
        .from("participant_outcomes")
        .insert([
          {
            participant_id: participantInsert.id,
            outcome_phrase: participantOutcomePhrase.trim() || "",
            outcome_statement: participantOutcomeStatement.trim() || "",
            outcome_action_plan: participantOutcomeActionPlan.trim() || "",
          },
        ]);

      if (outcomeError) {
        setMessage(`Participant added, but outcome failed: ${outcomeError.message}`);
        loadData();
        return;
      }
    }

    if (participantServiceName.trim()) {
      const { error: serviceError } = await supabase
        .from("participant_services")
        .insert([
          {
            participant_id: participantInsert.id,
            service_name: participantServiceName.trim(),
            active: true,
          },
        ]);

      if (serviceError) {
        setMessage(`Participant added, but service failed: ${serviceError.message}`);
        loadData();
        return;
      }
    }

    setParticipantName("");
    setParticipantCleEmail("");
    setParticipantServiceName("");
    setParticipantOutcomePhrase("");
    setParticipantOutcomeStatement("");
    setParticipantOutcomeActionPlan("");
    setMessage("Participant added.");
    loadData();
  }

  async function handleDeleteParticipant() {
    setMessage("");

    if (!deleteParticipantId) {
      setMessage("Select a participant to remove.");
      return;
    }

    const participant = participants.find((p) => p.id === deleteParticipantId);
    const confirmed = window.confirm(
      `Remove participant${participant ? ` "${participant.name}"` : ""}? This will also remove assignments, goals, services, and outcomes tied to that participant.`
    );

    if (!confirmed) return;

    const { error: assignmentError } = await supabase
      .from("worker_participants")
      .delete()
      .eq("participant_id", deleteParticipantId);

    if (assignmentError) {
      setMessage(`Error removing participant assignments: ${assignmentError.message}`);
      return;
    }

    const { error: goalError } = await supabase
      .from("participant_goals")
      .delete()
      .eq("participant_id", deleteParticipantId);

    if (goalError) {
      setMessage(`Error removing participant goals: ${goalError.message}`);
      return;
    }

    const { error: serviceError } = await supabase
      .from("participant_services")
      .delete()
      .eq("participant_id", deleteParticipantId);

    if (serviceError) {
      setMessage(`Error removing participant services: ${serviceError.message}`);
      return;
    }

    const { error: outcomeError } = await supabase
      .from("participant_outcomes")
      .delete()
      .eq("participant_id", deleteParticipantId);

    if (outcomeError) {
      setMessage(`Error removing participant outcomes: ${outcomeError.message}`);
      return;
    }

    const { error: participantError } = await supabase
      .from("participants")
      .delete()
      .eq("id", deleteParticipantId);

    if (participantError) {
      setMessage(`Error removing participant: ${participantError.message}`);
      return;
    }

    setDeleteParticipantId("");
    setMessage("Participant removed.");
    loadData();
  }

  async function handleAssignWorker() {
    setMessage("");

    if (!selectedWorkerId || !selectedParticipantId) {
      setMessage("Select a worker and participant.");
      return;
    }

    const alreadyAssigned = assignments.some(
      (a) =>
        a.worker_id === selectedWorkerId &&
        a.participant_id === selectedParticipantId
    );

    if (alreadyAssigned) {
      setMessage("That assignment already exists.");
      return;
    }

    const { error } = await supabase.from("worker_participants").insert([
      {
        worker_id: selectedWorkerId,
        participant_id: selectedParticipantId,
      },
    ]);

    if (error) {
      setMessage(`Error creating assignment: ${error.message}`);
      return;
    }

    setMessage("Assignment added.");
    loadData();
  }

  async function handleRemoveAssignment() {
    setMessage("");

    if (!removeAssignmentWorkerId || !removeAssignmentParticipantId) {
      setMessage("Select a worker and participant assignment to remove.");
      return;
    }

    const { error } = await supabase
      .from("worker_participants")
      .delete()
      .eq("worker_id", removeAssignmentWorkerId)
      .eq("participant_id", removeAssignmentParticipantId);

    if (error) {
      setMessage(`Error removing assignment: ${error.message}`);
      return;
    }

    setRemoveAssignmentWorkerId("");
    setRemoveAssignmentParticipantId("");
    setMessage("Assignment removed.");
    loadData();
  }

  async function handleAddGoal() {
    setMessage("");

    if (!goalParticipantId || !goalLabel.trim()) {
      setMessage("Select a participant and enter a goal.");
      return;
    }

    const { error } = await supabase.from("participant_goals").insert([
      {
        participant_id: goalParticipantId,
        category_name: goalCategoryName.trim() || "Goals",
        goal_label: goalLabel.trim(),
        sort_order: Number(goalSortOrder) || 1,
        active: true,
      },
    ]);

    if (error) {
      setMessage(`Error adding goal: ${error.message}`);
      return;
    }

    setGoalParticipantId("");
    setGoalCategoryName("");
    setGoalLabel("");
    setGoalSortOrder("1");
    setMessage("Goal added.");
    loadData();
  }

async function handleDeleteGoal(goalId) {
  setMessage("");

  const { error } = await supabase
    .from("participant_goals")
    .delete()
    .eq("id", goalId);

  if (error) {
    setMessage(`Error deleting goal: ${error.message}`);
    return;
  }

  setMessage("Goal removed.");
  loadData();
}
async function handleUpdateGoal() {
  setMessage("");

  if (!editingGoalId || !editGoalLabel.trim()) {
    setMessage("Enter a goal to update.");
    return;
  }

  const { error } = await supabase
    .from("participant_goals")
    .update({
      category_name: editGoalCategoryName.trim() || "Goals",
      goal_label: editGoalLabel.trim(),
      sort_order: Number(editGoalSortOrder) || 1
    })
    .eq("id", editingGoalId);

  if (error) {
    setMessage(`Error updating goal: ${error.message}`);
    return;
  }

  setEditingGoalId("");
  setEditGoalCategoryName("");
  setEditGoalLabel("");
  setEditGoalSortOrder("1");

  setMessage("Goal updated.");
  loadData();
}
  async function handleAddService() {
    setMessage("");

    if (!serviceParticipantId || !serviceName.trim()) {
      setMessage("Select a participant and enter a service.");
      return;
    }

    const { error } = await supabase.from("participant_services").insert([
      {
        participant_id: serviceParticipantId,
        service_name: serviceName.trim(),
        active: true,
      },
    ]);

    if (error) {
      setMessage(`Error adding service: ${error.message}`);
      return;
    }

    setServiceParticipantId("");
    setServiceName("");
    setMessage("Service added.");
    loadData();
  }

  async function handleSaveOutcome() {
    setMessage("");

    if (!outcomeParticipantId) {
      setMessage("Select a participant.");
      return;
    }

    const participant = participants.find((p) => p.id === outcomeParticipantId);
    const existing = participant?.participant_outcomes?.[0];

    if (existing) {
      const { error } = await supabase
        .from("participant_outcomes")
        .update({
          outcome_phrase: outcomePhrase.trim(),
          outcome_statement: outcomeStatement.trim(),
          outcome_action_plan: outcomeActionPlan.trim(),
        })
        .eq("id", existing.id);

      if (error) {
        setMessage(`Error updating outcome: ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase
        .from("participant_outcomes")
        .insert([
          {
            participant_id: outcomeParticipantId,
            outcome_phrase: outcomePhrase.trim(),
            outcome_statement: outcomeStatement.trim(),
            outcome_action_plan: outcomeActionPlan.trim(),
          },
        ]);

      if (error) {
        setMessage(`Error creating outcome: ${error.message}`);
        return;
      }
    }

    setOutcomeParticipantId("");
    setOutcomePhrase("");
    setOutcomeStatement("");
    setOutcomeActionPlan("");
    setMessage("Outcome saved.");
    loadData();
  }

  async function handleUpdateParticipant() {
    setMessage("");

    if (!editingParticipantId || !editingParticipantName.trim()) {
      setMessage("Select a participant and enter a name.");
      return;
    }

    const { error } = await supabase
      .from("participants")
      .update({
        name: editingParticipantName.trim(),
        cle_email: editingParticipantCleEmail.trim() || null,
      })
      .eq("id", editingParticipantId);

    if (error) {
      setMessage(`Error updating participant: ${error.message}`);
      return;
    }

    setEditingParticipantId("");
    setEditingParticipantName("");
    setEditingParticipantCleEmail("");
    setMessage("Participant updated.");
    loadData();
  }

  function getAssignedParticipantNames(workerId) {
    const participantIdsForWorker = assignments
      .filter((assignment) => assignment.worker_id === workerId)
      .map((assignment) => assignment.participant_id);

    return participants
      .filter((participant) => participantIdsForWorker.includes(participant.id))
      .map((participant) => participant.name)
      .join(", ");
  }

  if (!authorized) {
    function handleAdminLogin(e) {
      e.preventDefault();

      if (adminPin === process.env.NEXT_PUBLIC_ADMIN_PIN) {
        setAuthorized(true);
        setMessage("");
      } else {
        setMessage("Incorrect admin PIN");
      }
    }

    return (
      <main style={{ padding: 30, fontFamily: "Arial", maxWidth: 500, margin: "0 auto" }}>
        <h1>DreamNote Admin</h1>

        <form onSubmit={handleAdminLogin}>
          <input
            type="password"
            placeholder="Enter Admin PIN"
            value={adminPin}
            onChange={(e) => setAdminPin(e.target.value)}
            style={{
              width: "100%",
              padding: 12,
              fontSize: 16,
              marginTop: 10,
              marginBottom: 12,
              boxSizing: "border-box"
            }}
          />

          <button
            type="submit"
            style={{
              padding: "10px 18px",
              fontSize: 16,
              cursor: "pointer"
            }}
          >
            Enter
          </button>
        </form>

        <p style={{ marginTop: 12 }}>{message}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 30, fontFamily: "Arial", maxWidth: 900, margin: "0 auto" }}>
      <h1>DreamNote Admin</h1>
      <p style={{ color: "#444" }}>
        Use this page to manage workers, participants, CLE emails, assignments, goals, services, and outcomes.
      </p>

      {message && (
        <p style={{ marginTop: 10, color: "#0a5" }}>{message}</p>
      )}

      <section style={{ marginTop: 30, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
        <h2>Add Worker</h2>
        <div style={{ display: "grid", gap: 10, maxWidth: 400 }}>
          <input
            placeholder="Worker name"
            value={workerName}
            onChange={(e) => setWorkerName(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          />
          <input
            placeholder="PIN"
            value={workerPin}
            onChange={(e) => setWorkerPin(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          />
          <button onClick={handleAddWorker} style={{ padding: 10, fontSize: 16 }}>
            Add Worker
          </button>
        </div>
      </section>

      <section style={{ marginTop: 20, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
        <h2>Change Worker PIN</h2>
        <div style={{ display: "grid", gap: 10, maxWidth: 400 }}>
          <select
            value={pinEditWorkerId}
            onChange={(e) => setPinEditWorkerId(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          >
            <option value="">Select worker</option>
            {workers.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.name}
              </option>
            ))}
          </select>

          <input
            placeholder="New PIN"
            value={newWorkerPin}
            onChange={(e) => setNewWorkerPin(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          />

          <button onClick={handleUpdateWorkerPin} style={{ padding: 10, fontSize: 16 }}>
            Update Worker PIN
          </button>
        </div>
      </section>

      <section style={{ marginTop: 20, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
        <h2>Remove Worker</h2>
        <div style={{ display: "grid", gap: 10, maxWidth: 400 }}>
          <select
            value={deleteWorkerId}
            onChange={(e) => setDeleteWorkerId(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          >
            <option value="">Select worker</option>
            {workers.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.name}
              </option>
            ))}
          </select>

          <button onClick={handleDeleteWorker} style={{ padding: 10, fontSize: 16 }}>
            Remove Worker
          </button>
        </div>
      </section>

      <section style={{ marginTop: 20, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
        <h2>Add Participant</h2>
        <div style={{ display: "grid", gap: 10, maxWidth: 500 }}>
          <input
            placeholder="Participant name"
            value={participantName}
            onChange={(e) => setParticipantName(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          />
          <input
            placeholder="CLE email"
            value={participantCleEmail}
            onChange={(e) => setParticipantCleEmail(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          />
          <input
            placeholder="Initial service (optional)"
            value={participantServiceName}
            onChange={(e) => setParticipantServiceName(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          />
          <input
            placeholder="Outcome phrase (optional)"
            value={participantOutcomePhrase}
            onChange={(e) => setParticipantOutcomePhrase(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          />
          <textarea
            placeholder="Outcome statement (optional)"
            value={participantOutcomeStatement}
            onChange={(e) => setParticipantOutcomeStatement(e.target.value)}
            style={{ padding: 10, fontSize: 16, minHeight: 80 }}
          />
          <textarea
            placeholder="Outcome action plan (optional)"
            value={participantOutcomeActionPlan}
            onChange={(e) => setParticipantOutcomeActionPlan(e.target.value)}
            style={{ padding: 10, fontSize: 16, minHeight: 80 }}
          />
          <button onClick={handleAddParticipant} style={{ padding: 10, fontSize: 16 }}>
            Add Participant
          </button>
        </div>
      </section>

      <section style={{ marginTop: 20, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
        <h2>Edit Participant</h2>
        <div style={{ display: "grid", gap: 10, maxWidth: 500 }}>
          <select
            value={editingParticipantId}
            onChange={(e) => {
              const id = e.target.value;
              setEditingParticipantId(id);
              const participant = participants.find((p) => p.id === id);
              setEditingParticipantName(participant?.name || "");
              setEditingParticipantCleEmail(participant?.cle_email || "");
            }}
            style={{ padding: 10, fontSize: 16 }}
          >
            <option value="">Select participant</option>
            {participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.name}
              </option>
            ))}
          </select>

          <input
            placeholder="Participant name"
            value={editingParticipantName}
            onChange={(e) => setEditingParticipantName(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          />

          <input
            placeholder="CLE email"
            value={editingParticipantCleEmail}
            onChange={(e) => setEditingParticipantCleEmail(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          />

          <button onClick={handleUpdateParticipant} style={{ padding: 10, fontSize: 16 }}>
            Save Participant Changes
          </button>
        </div>
      </section>

      <section style={{ marginTop: 20, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
        <h2>Remove Participant</h2>
        <div style={{ display: "grid", gap: 10, maxWidth: 500 }}>
          <select
            value={deleteParticipantId}
            onChange={(e) => setDeleteParticipantId(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          >
            <option value="">Select participant</option>
            {participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.name}
              </option>
            ))}
          </select>

          <button onClick={handleDeleteParticipant} style={{ padding: 10, fontSize: 16 }}>
            Remove Participant
          </button>
        </div>
      </section>

      <section style={{ marginTop: 20, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
        <h2>Assign Worker to Participant</h2>
        <div style={{ display: "grid", gap: 10, maxWidth: 500 }}>
          <select
            value={selectedWorkerId}
            onChange={(e) => setSelectedWorkerId(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          >
            <option value="">Select worker</option>
            {workers.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.name}
              </option>
            ))}
          </select>

          <select
            value={selectedParticipantId}
            onChange={(e) => setSelectedParticipantId(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          >
            <option value="">Select participant</option>
            {participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.name}
              </option>
            ))}
          </select>

          <button onClick={handleAssignWorker} style={{ padding: 10, fontSize: 16 }}>
            Add Assignment
          </button>
        </div>
      </section>

      <section style={{ marginTop: 20, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
        <h2>Remove Worker from Participant</h2>
        <div style={{ display: "grid", gap: 10, maxWidth: 500 }}>
          <select
            value={removeAssignmentWorkerId}
            onChange={(e) => setRemoveAssignmentWorkerId(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          >
            <option value="">Select worker</option>
            {workers.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.name}
              </option>
            ))}
          </select>

          <select
            value={removeAssignmentParticipantId}
            onChange={(e) => setRemoveAssignmentParticipantId(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          >
            <option value="">Select participant</option>
            {participants
              .filter((participant) =>
                removeAssignmentWorkerId
                  ? assignments.some(
                      (assignment) =>
                        assignment.worker_id === removeAssignmentWorkerId &&
                        assignment.participant_id === participant.id
                    )
                  : true
              )
              .map((participant) => (
                <option key={participant.id} value={participant.id}>
                  {participant.name}
                </option>
              ))}
          </select>

          <button onClick={handleRemoveAssignment} style={{ padding: 10, fontSize: 16 }}>
            Remove Assignment
          </button>
        </div>
      </section>

      <section style={{ marginTop: 20, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
        <h2>Add Goal</h2>
        <div style={{ display: "grid", gap: 10, maxWidth: 500 }}>
          <select
            value={goalParticipantId}
            onChange={(e) => setGoalParticipantId(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          >
            <option value="">Select participant</option>
            {participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.name}
              </option>
            ))}
          </select>

          <input
            placeholder="Category name"
            value={goalCategoryName}
            onChange={(e) => setGoalCategoryName(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          />

          <input
            placeholder="Goal label"
            value={goalLabel}
            onChange={(e) => setGoalLabel(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          />

          <input
            placeholder="Sort order"
            value={goalSortOrder}
            onChange={(e) => setGoalSortOrder(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          />

          <button onClick={handleAddGoal} style={{ padding: 10, fontSize: 16 }}>
            Add Goal
          </button>
        </div>
      </section>
{editingGoalId && (
  <section style={{ marginTop: 12, padding: 12, border: "1px solid #ccc", borderRadius: 8 }}>
    <h3>Edit Goal</h3>

    <input
      type="text"
      placeholder="Category name"
      value={editGoalCategoryName}
      onChange={(e) => setEditGoalCategoryName(e.target.value)}
      style={{ display: "block", marginBottom: 8, width: "100%" }}
    />

    <input
      type="text"
      placeholder="Goal label"
      value={editGoalLabel}
      onChange={(e) => setEditGoalLabel(e.target.value)}
      style={{ display: "block", marginBottom: 8, width: "100%" }}
    />

    <input
      type="number"
      placeholder="Sort order"
      value={editGoalSortOrder}
      onChange={(e) => setEditGoalSortOrder(e.target.value)}
      style={{ display: "block", marginBottom: 8, width: 120 }}
    />

    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={handleUpdateGoal}>Save Goal</button>
      <button
        onClick={() => {
          setEditingGoalId("");
          setEditGoalCategoryName("");
          setEditGoalLabel("");
          setEditGoalSortOrder("1");
        }}
      >
        Cancel
      </button>
    </div>
  </section>
)}
      <section style={{ marginTop: 20, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
        <h2>Add Service</h2>
        <div style={{ display: "grid", gap: 10, maxWidth: 500 }}>
          <select
            value={serviceParticipantId}
            onChange={(e) => setServiceParticipantId(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          >
            <option value="">Select participant</option>
            {participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.name}
              </option>
            ))}
          </select>

          <input
            placeholder="Service name"
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          />

          <button onClick={handleAddService} style={{ padding: 10, fontSize: 16 }}>
            Add Service
          </button>
        </div>
      </section>

      <section style={{ marginTop: 20, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
        <h2>Edit Outcome</h2>
        <div style={{ display: "grid", gap: 10, maxWidth: 600 }}>
          <select
            value={outcomeParticipantId}
            onChange={(e) => {
              const id = e.target.value;
              setOutcomeParticipantId(id);
              const participant = participants.find((p) => p.id === id);
              const outcome = participant?.participant_outcomes?.[0];
              setOutcomePhrase(outcome?.outcome_phrase || "");
              setOutcomeStatement(outcome?.outcome_statement || "");
              setOutcomeActionPlan(outcome?.outcome_action_plan || "");
            }}
            style={{ padding: 10, fontSize: 16 }}
          >
            <option value="">Select participant</option>
            {participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.name}
              </option>
            ))}
          </select>

          <input
            placeholder="Outcome phrase"
            value={outcomePhrase}
            onChange={(e) => setOutcomePhrase(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          />

          <textarea
            placeholder="Outcome statement"
            value={outcomeStatement}
            onChange={(e) => setOutcomeStatement(e.target.value)}
            style={{ padding: 10, fontSize: 16, minHeight: 80 }}
          />

          <textarea
            placeholder="Outcome action plan"
            value={outcomeActionPlan}
            onChange={(e) => setOutcomeActionPlan(e.target.value)}
            style={{ padding: 10, fontSize: 16, minHeight: 80 }}
          />

          <button onClick={handleSaveOutcome} style={{ padding: 10, fontSize: 16 }}>
            Save Outcome
          </button>
        </div>
      </section>

      <section style={{ marginTop: 20, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
        <h2>Current Workers</h2>
        <div style={{ display: "grid", gap: 14 }}>
          {workers.map((worker) => (
            <div
              key={worker.id}
              style={{ padding: 12, border: "1px solid #e5e5e5", borderRadius: 6 }}
            >
              <div><strong>{worker.name}</strong></div>
              <div>PIN: {worker.pin}</div>
              <div style={{ marginTop: 8 }}>
                <strong>Assigned Participants:</strong>{" "}
                {getAssignedParticipantNames(worker.id) || "None"}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 20, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
        <h2>Current Participants</h2>
        <div style={{ display: "grid", gap: 14 }}>
          {participants.map((participant) => (
            <div
              key={participant.id}
              style={{ padding: 12, border: "1px solid #e5e5e5", borderRadius: 6 }}
            >
              <div><strong>{participant.name}</strong></div>
              <div>CLE Email: {participant.cle_email || "Not set"}</div>
              <div style={{ marginTop: 8 }}>
                <strong>Services:</strong>{" "}
                {participant.participant_services?.length
                  ? participant.participant_services
                      .filter((s) => s.active)
                      .map((s) => s.service_name)
                      .join(", ")
                  : "None"}
              </div>
              <div style={{ marginTop: 8 }}>
                <strong>Goals:</strong>
                <ul style={{ marginTop: 6 }}>
                  {(participant.participant_goals || [])
                    .filter((g) => g.active)
                    .sort((a, b) => a.sort_order - b.sort_order)
.map((goal) => (
  <li
    key={goal.id}
    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}
  >
    <span>
      {goal.sort_order}. {goal.category_name || "Goals"}: {goal.goal_label}
    </span>

    <div style={{ display: "flex", gap: 8 }}>
      <button
        onClick={() => {
          setEditingGoalId(goal.id);
          setEditGoalCategoryName(goal.category_name || "Goals");
          setEditGoalLabel(goal.goal_label || "");
          setEditGoalSortOrder(String(goal.sort_order || 1));
        }}
      >
        Edit
      </button>

      <button onClick={() => handleDeleteGoal(goal.id)}>
        Delete
      </button>
    </div>
  </li>
))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}