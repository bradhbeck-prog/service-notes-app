"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Page() {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");

  async function handleLogin() {
    const { data } = await supabase
      .from("workers")
      .select("*")
      .eq("pin", pin)
      .eq("active", true)
      .single();

    if (data) {
      setMessage("Login successful");
    } else {
      setMessage("Invalid PIN");
    }
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
