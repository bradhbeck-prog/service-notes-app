"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("password") === "updated") {
      setMessage("Password updated. Sign in with your new password.");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

async function handleLogin(e) {
  e.preventDefault();
  setMessage("");

  const normalizedEmail = email.trim().toLowerCase();

  const { data: loginData, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
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
    <main
      style={{
        minHeight: "100vh",
        padding: 30,
        fontFamily: "Arial",
        maxWidth: 500,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          border: "1px solid var(--dn-border)",
          borderRadius: 18,
          padding: 28,
          boxShadow: "0 12px 30px rgba(31, 41, 55, 0.08)",
        }}
      >
      <h1 style={{ marginTop: 0, marginBottom: 8, color: "var(--dn-primary)" }}>
        DreamNote
      </h1>
      <p style={{ marginTop: 0, color: "#4b5563" }}>
        Sign in with your email and password.
      </p>

      <form onSubmit={handleLogin}>
        <div>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            style={{
              width: "100%",
              padding: 12,
              fontSize: 16,
              boxSizing: "border-box",
              borderRadius: 10,
              border: "1px solid var(--dn-border)",
            }}
          />
        </div>

        <div style={{ marginTop: 10 }}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: 12,
              fontSize: 16,
              boxSizing: "border-box",
              borderRadius: 10,
              border: "1px solid var(--dn-border)",
            }}
          />
        </div>

        <button
          type="submit"
          style={{
            width: "100%",
            marginTop: 14,
            padding: "12px 18px",
            fontSize: 16,
            cursor: "pointer",
            borderRadius: 10,
            border: "1px solid var(--dn-primary)",
            background: "var(--dn-primary)",
            color: "#ffffff",
            fontWeight: 700,
          }}
        >
          Login
        </button>
      </form>

      {message ? <p>{message}</p> : null}

      <div
        style={{
          marginTop: 24,
          paddingTop: 18,
          borderTop: "1px solid var(--dn-border)",
          fontSize: 14,
          lineHeight: 1.5,
          color: "#4b5563",
        }}
      >
        <p style={{ margin: 0 }}>
          If you do not have a username and password yet, email Bradley at{" "}
          <a href="mailto:bradley@supportsbroker.com">bradley@supportsbroker.com</a>
          {" "}and he will send you a setup link.
        </p>
      </div>
      </div>
    </main>
  );
}
