"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const DELIVERY_LABELS = {
  immediate: "Email each note when submitted",
  weekly: "Weekly digest",
  monthly: "Monthly digest only",
};

function formatDate(value) {
  if (!value) return "Not set";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (year && month && day) return `${Number(month)}/${Number(day)}/${year}`;
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
  const [preference, setPreference] = useState("immediate");

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
    setPreference(result.participant?.note_delivery_preference || "immediate");
    setNotes(result.notes || []);
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
      body: JSON.stringify({ noteDeliveryPreference: preference }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || "Preference could not be saved.");
    } else {
      setMessage(result.message || "Preference saved.");
      setParticipant((current) =>
        current ? { ...current, note_delivery_preference: preference } : current
      );
    }

    setSavingPreference(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <main style={{ padding: 30, fontFamily: "Arial", maxWidth: 900, margin: "0 auto" }}>
        <h1>DreamNote CLE Portal</h1>
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 30, fontFamily: "Arial", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>DreamNote CLE Portal</h1>
          <p style={{ marginTop: 0, color: "#4b5563" }}>
            Review service notes and delivery preferences for your participant.
          </p>
        </div>
        <button onClick={handleSignOut} style={{ padding: "8px 12px" }}>
          Sign Out
        </button>
      </div>

      {message ? <p style={{ color: message.includes("saved") ? "#059669" : "#b45309" }}>{message}</p> : null}

      {!participant ? (
        <section style={{ marginTop: 20, padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
          <p>No participant is linked to this CLE login yet.</p>
        </section>
      ) : (
        <>
          <section style={{ marginTop: 20, padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
            <h2 style={{ marginTop: 0 }}>{participant.name}</h2>
            <p style={{ marginBottom: 0 }}>
              CLE email: {participant.cle_email || "Not set"}
            </p>
          </section>

          <section style={{ marginTop: 20, padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
            <h2 style={{ marginTop: 0 }}>Note Delivery Preference</h2>
            <p style={{ color: "#4b5563" }}>
              This sets how service notes should be delivered once digest delivery is enabled.
            </p>
            <select
              value={preference}
              onChange={(e) => setPreference(e.target.value)}
              style={{ width: "100%", maxWidth: 420, padding: 10, fontSize: 16 }}
            >
              {Object.entries(DELIVERY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 12 }}>
              <button
                onClick={handleSavePreference}
                disabled={savingPreference}
                style={{ padding: "10px 14px", fontSize: 15 }}
              >
                {savingPreference ? "Saving..." : "Save Preference"}
              </button>
            </div>
          </section>

          <section style={{ marginTop: 20, padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
            <h2 style={{ marginTop: 0 }}>Submitted Service Notes</h2>
            {notes.length === 0 ? (
              <p>No submitted notes yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {notes.map((note) => (
                  <div
                    key={note.id}
                    style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 8 }}
                  >
                    <strong>{note.title}</strong>
                    <div style={{ marginTop: 6, color: "#4b5563", fontSize: 14 }}>
                      Date of service: {formatDate(note.shift_date)} · Completed: {formatDate(note.date_completed)}
                    </div>
                    <div style={{ marginTop: 4, color: "#4b5563", fontSize: 14 }}>
                      Signed: {formatDateTime(note.signed_at)}
                    </div>
                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button disabled style={{ padding: "8px 10px" }}>
                        View PDF soon
                      </button>
                      <button disabled style={{ padding: "8px 10px" }}>
                        Download PDF soon
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
