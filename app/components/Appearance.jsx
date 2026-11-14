"use client";

import { useEffect, useState } from "react";

const key = "dreamnote-appearance";
const query = "(prefers-color-scheme: dark)";
const options = ["light", "dark", "device"];

export default function Appearance() {
  const [choice, setChoice] = useState("light");
  const [dark, setDark] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (options.includes(saved)) setChoice(saved);
    } catch {}
  }, []);

  useEffect(() => {
    const device = window.matchMedia(query);
    function apply() {
      const isDark = choice === "dark" || (choice === "device" && device.matches);
      document.documentElement.dataset.dnTheme = isDark ? "dark" : "light";
      setDark(isDark);
    }
    apply();
    if (device.addEventListener) {
      device.addEventListener("change", apply);
      return () => device.removeEventListener("change", apply);
    }
    device.addListener?.(apply);
    return () => device.removeListener?.(apply);
  }, [choice]);

  function choose(next) {
    setChoice(next);
    try { localStorage.setItem(key, next); } catch {}
  }

  const toggleLabel = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <header className="dn-brandbar">
      <button className="dn-brand-toggle" type="button" aria-label={toggleLabel} title={toggleLabel}
        onClick={() => choose(dark ? "light" : "dark")}>
        <img src="/dreamnote-d-transparent.png" alt="" width="86" height="86" />
      </button>
      <span className="dn-brand-name"><span className="dn-visually-hidden">D</span>reamNote</span>
      <details className="dn-appearance">
        <summary>Appearance</summary>
        <div className="dn-appearance-options" role="group" aria-label="Color scheme">
          {options.map((option) => (
            <label key={option}>
              <input type="radio" name="dreamnote-appearance" checked={choice === option}
                aria-label={option === "light" ? "Light" : option === "dark" ? "Dark" : "Use device setting"}
                onChange={() => choose(option)} />
              {option === "light" ? "Light" : option === "dark" ? "Dark" : "Use device setting"}
            </label>
          ))}
        </div>
      </details>
    </header>
  );
}
