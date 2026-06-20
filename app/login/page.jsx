"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

async function handleLogin(e) {
  e.preventDefault();
  setMessage("");

  const { data: loginData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    setMessage(error.message);
    return;
  }

  const user = loginData.user;

  const { data: adminMembership, error: membershipError } = await supabase
    .from("workspace_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("active", true)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    setMessage(membershipError.message);
    return;
  }

  if (adminMembership) {
    window.location.href = "/admin";
    return;
  }

  const { data: worker, error: workerError } = await supabase
    .from("workers")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (workerError) {
    setMessage(workerError.message);
    return;
  }

  if (worker) {
    window.location.href = "/worker";
    return;
  }

  await supabase.auth.signOut();
  setMessage("This login does not have an active DreamNote role yet.");
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
