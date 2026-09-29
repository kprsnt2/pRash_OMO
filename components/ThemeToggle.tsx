"use client";

import { useEffect, useState } from "react";

const KEY = "onechat.theme";
type Theme = "dark" | "light";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode: the theme lasts for this page only */
    }
  }

  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="flex items-center gap-2 rounded-xl border border-line bg-panel2 px-3 py-2 text-sm text-muted hover:text-ink"
    >
      <span aria-hidden>{theme === "dark" ? "\u2600" : "\u263E"}</span>
      <span className="hidden capitalize sm:inline">{next}</span>
    </button>
  );
}
