"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

async function handleLogin(e) {
  e.preventDefault();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    setMessage(error.message);
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: workerError } = await supabase
      .from("workers")
      .update({
        auth_user_id: user.id,
      })
      .eq("email", user.email);

    if (workerError) {
      setMessage(workerError.message);
    } else {
      window.location.href = "/worker";
    }
  }
}
return (
    <div style={{ padding: 40 }}>
      <h1>DreamNote Login</h1>

      <form onSubmit={handleLogin}>
        <div>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div style={{ marginTop: 10 }}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" style={{ marginTop: 10 }}>
          Login
        </button>
      </form>

      <p>{message}</p>
    </div>
  );
}