"use client";

import { useState } from "react";

export default function Page() {
  const [pin, setPin] = useState("");

  return (
    <main style={{ padding: 30, fontFamily: "Arial", maxWidth: 500 }}>
      <h1>Supports Broker Service Notes</h1>
      <p>Worker sign in</p>

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
        style={{
          padding: "10px 18px",
          fontSize: 16,
          cursor: "pointer"
        }}
      >
        Sign in
      </button>
    </main>
  );
}
