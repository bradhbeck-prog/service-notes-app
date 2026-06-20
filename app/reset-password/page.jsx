"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("Opening your secure reset link...");
  const [sessionReady, setSessionReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function prepareRecoverySession() {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const urlError =
        url.searchParams.get("error_description") ||
        url.searchParams.get("error");

      if (urlError) {
        if (active) setMessage(decodeURIComponent(urlError));
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          if (active) setMessage(error.message);
          return;
        }

        window.history.replaceState({}, document.title, "/reset-password");
      } else if (window.location.hash) {
        const hash = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        const hashError = hash.get("error_description") || hash.get("error");

        if (hashError) {
          if (active) setMessage(decodeURIComponent(hashError));
          return;
        }

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            if (active) setMessage(error.message);
            return;
          }

          window.history.replaceState({}, document.title, "/reset-password");
        }
      }

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (!active) return;

      if (error || !session) {
        setMessage(
          "This reset link is invalid or expired. Request one new password-reset email and open its newest link."
        );
        return;
      }

      setSessionReady(true);
      setMessage("Enter your new password.");
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === "PASSWORD_RECOVERY" && session) {
        setSessionReady(true);
        setMessage("Enter your new password.");
      }
    });

    prepareRecoverySession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleReset(e) {
    e.preventDefault();

    if (!sessionReady) {
      setMessage("Open a fresh password-reset link from your email first.");
      return;
    }

    if (password.length < 8) {
      setMessage("Use a password with at least 8 characters.");
      return;
    }

    setSaving(true);
    setMessage("");

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setMessage(error.message);
      setSaving(false);
    } else {
      await supabase.auth.signOut();
      window.location.href = "/login?password=updated";
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
          minLength={8}
          autoComplete="new-password"
          disabled={!sessionReady || saving}
        />

        <button
          type="submit"
          disabled={!sessionReady || saving}
          style={{ marginLeft: 10 }}
        >
          {saving ? "Updating..." : "Update Password"}
        </button>
      </form>

      <p>{message}</p>
    </div>
  );
}
