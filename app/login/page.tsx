"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError("Wrong password.");
        return;
      }
      const params = new URLSearchParams(window.location.search);
      window.location.href = params.get("next") || "/";
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-panel/80 p-6 backdrop-blur">
        <div className="mb-1 text-2xl font-semibold tracking-tight">OneChat</div>
        <p className="mb-5 text-sm text-muted">Enter the app password to continue.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="mb-3 w-full rounded-xl border border-line bg-panel2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
        {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="w-full rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-[#04231f] hover:brightness-110"
        >
          {busy ? "Checking..." : "Unlock"}
        </button>
      </form>
    </main>
  );
}
