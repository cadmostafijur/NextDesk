import { useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import { completeOnboarding } from "../lib/sessionController";

export function Onboarding() {
  const [name, setName] = useState("My Computer");
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
    <div className="flex h-full items-center justify-center bg-surface-sunken p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-line bg-surface-raised p-8 shadow-panel animate-fadeUp"
      >
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-white">
          <MonitorSmartphone size={20} strokeWidth={2.1} />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">Welcome to NexDesk</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
          Name this computer. You’ll get an ID that others use to ask for a connection, and you
          approve every request.
        </p>
        <label className="mt-7 block">
          <span className="nd-label">Computer name</span>
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
        <button className="nd-btn-primary mt-6 w-full py-2.5" disabled={busy} type="submit">
          {busy ? "Setting up…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
