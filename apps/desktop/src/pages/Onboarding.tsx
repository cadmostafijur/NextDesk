import { useState } from "react";
import { completeOnboarding } from "../lib/sessionController";

export function Onboarding() {
  const [name, setName] = useState(
    () => `${navigator.platform || "PC"}`.replace(/[^\w\s-]/g, "").slice(0, 40) || "My Computer",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await completeOnboarding(name.trim() || "My Computer");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <form onSubmit={submit} className="nd-panel w-full max-w-lg p-8 shadow-panel animate-fadeUp">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Welcome</div>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-ink">NexDesk</h1>
        <p className="mt-3 text-ink-muted">
          Secure remote desktop for your machines. Your device gets a unique ID for discovery —
          access still requires an explicit accept or configured unattended credentials.
        </p>
        <label className="mt-8 block">
          <span className="nd-label">Device name</span>
          <input
            className="nd-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            autoFocus
            required
          />
        </label>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <button className="nd-btn-primary mt-6 w-full" disabled={busy} type="submit">
          {busy ? "Setting up…" : "Create my device ID"}
        </button>
      </form>
    </div>
  );
}
