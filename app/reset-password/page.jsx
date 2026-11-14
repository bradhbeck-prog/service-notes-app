"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("Opening your secure link...");
  const [sessionReady, setSessionReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [isInvite, setIsInvite] = useState(false);

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
        const tokenHash = hash.get("token_hash");
        const verificationType = hash.get("type");
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        const hashError = hash.get("error_description") || hash.get("error");

        if (hashError) {
          if (active) setMessage(decodeURIComponent(hashError));
          return;
        }

        if (tokenHash && ["recovery", "invite"].includes(verificationType)) {
          if (active) {
            setPendingVerification({ tokenHash, type: verificationType });
            setIsInvite(verificationType === "invite");
            setMessage("Continue to set your password.");
          }
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

  async function handleContinue() {
    if (!pendingVerification || verifying) return;
    setVerifying(true);
    setMessage("Verifying your secure link...");

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: pendingVerification.tokenHash,
      type: pendingVerification.type,
    });

    if (error || !data.session) {
      setMessage(error?.message || "This reset link is invalid or expired. Request a new link.");
      setVerifying(false);
      return;
    }

    window.history.replaceState({}, document.title, "/reset-password");
    setPendingVerification(null);
    setSessionReady(true);
    setVerifying(false);
    setMessage("Enter your new password.");
  }

  async function handleReset(e) {
    e.preventDefault();

    if (!sessionReady || pendingVerification) {
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
    <main className="dn-reset-page" style={{ padding: 40 }}>
      <h1>{isInvite ? "Set Up Your DreamNote Account" : "Reset Password"}</h1>

      <p role="status">{message}</p>

      {pendingVerification ? (
        <button type="button" onClick={handleContinue} disabled={verifying}>
          {verifying ? "Opening..." : "Continue"}
        </button>
      ) : sessionReady ? (
        <form onSubmit={handleReset}>
          <label htmlFor="dreamnote-new-password">New password</label>
          <input
            id="dreamnote-new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            autoComplete="new-password"
            required
            disabled={saving}
          />
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : isInvite ? "Set Password" : "Update Password"}
          </button>
        </form>
      ) : null}
    </main>
  );
}
