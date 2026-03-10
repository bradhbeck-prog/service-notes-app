"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Page() {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [worker, setWorker] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);

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
      .select("*")
      .in("id", participantIds)
      .eq("active", true);

    setParticipants(participantRows || []);
    setMessage("");
  }

  async function handleSubmitNote() {
    if (!worker || !selectedParticipant || !noteText.trim()) {
      setMessage("Please enter a note");
      return;
    }

    setSaving(true);
    setMessage("");

    const { error } = await supabase.from("service_notes").insert([
      {
        worker_id: worker.id,
        participant_id: selectedParticipant.id,
        note_text: noteText.trim(),
      },
    ]);

    setSaving(false);

    if (error) {
      setMessage("Error saving note");
      return;
    }

    setMessage("Note saved");
    setNoteText("");
  }

  if (selectedParticipant) {
    return (
      <main style={{ padding: 30, fontFamily: "Arial", maxWidth: 700 }}>
        <h1>Supports Broker Service Notes</h1>

        <p>Worker: {worker.name}</p>
        <p>Participant: {selectedParticipant.name}</p>

        <textarea
          placeholder="Write service note..."
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          style={{
            width: "100%",
            height: 200,
            marginTop: 20,
            padding: 12,
            fontSize: 16,
            boxSizing: "border-box"
          }}
        />

        <div style={{ marginTop: 15, display: "flex", gap: 10 }}>
          <button
            onClick={handleSubmitNote}
            disabled={saving}
            style={{
              padding: "10px 18px",
              fontSize: 16,
              cursor: "pointer"
            }}
          >
            {saving ? "Saving..." : "Submit Note"}
          </button>

          <button
            onClick={() => {
              setSelectedParticipant(null);
              setNoteText("");
              setMessage("");
            }}
            style={{
              padding: "10px 18px",
              fontSize: 16,
              cursor: "pointer"
            }}
          >
            Back
          </button>
        </div>

        <p style={{ marginTop: 10 }}>{message}</p>
      </main>
    );
  }

  if (worker) {
    return (
      <main style={{ padding: 30, fontFamily: "Arial", maxWidth: 700 }}>
        <h1>Supports Broker Service Notes</h1>
        <p>Welcome, {worker.name}</p>
        <h2>Assigned Participants</h2>

        {participants.length === 0 ? (
          <p>No participants assigned.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {participants.map((participant) => (
              <button
                key={participant.id}
                onClick={() => setSelectedParticipant(participant)}
                style={{
                  padding: 12,
                  fontSize: 16,
                  textAlign: "left",
                  cursor: "pointer"
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
    <main style={{ padding: 30, fontFamily: "Arial", maxWidth: 500 }}>
      <h1>Supports Broker Service Notes</h1>

      <input
        type="password"
        placeholder="Enter worker PIN"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
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
        onClick={handleLogin}
        style={{
          padding: "10px 18px",
          fontSize: 16,
          cursor: "pointer"
        }}
      >
        Sign in
      </button>

      <p>{message}</p>
    </main>
  );
}
