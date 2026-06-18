"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function handleReset(e) {
    e.preventDefault();

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Password updated. You can now log in.");
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Reset Password</h1>

      <form onSubmit={handleReset}>
        <input
          type="password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit" style={{ marginLeft: 10 }}>
          Update Password
        </button>
      </form>

      <p>{message}</p>
    </div>
  );
}
