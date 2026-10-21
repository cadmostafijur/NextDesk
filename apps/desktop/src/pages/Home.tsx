import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Check, Link2 } from "lucide-react";
import { useAppStore } from "../lib/store";

export function Home() {
  const deviceId = useAppStore((s) => s.deviceId);
  const deviceName = useAppStore((s) => s.deviceName);
  const signalingConnected = useAppStore((s) => s.signalingConnected);
  const [copied, setCopied] = useState(false);

  async function copyId() {
    await navigator.clipboard.writeText(deviceId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">This device</div>
        <h1 className="mt-1 text-3xl font-bold text-ink">{deviceName || "NexDesk"}</h1>
        <p className="mt-2 text-ink-muted">
          Share your ID so someone can request a session. You always choose whether to accept.
        </p>
      </header>

      <section className="nd-panel relative overflow-hidden p-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "linear-gradient(120deg, transparent 30%, rgb(var(--accent) / 0.08) 50%, transparent 70%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 3.5s linear infinite",
          }}
        />
        <div className="relative">
          <div className="nd-label">Your NexDesk ID</div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <code className="font-mono text-2xl font-semibold tracking-wide text-ink md:text-3xl">
              {deviceId || "—"}
            </code>
            <button className="nd-btn-ghost border border-line" onClick={copyId} type="button">
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copied" : "Copy ID"}
            </button>
          </div>
          <p className="mt-4 text-sm text-ink-muted">
            Status:{" "}
            <span className={signalingConnected ? "text-success" : "text-warn"}>
              {signalingConnected ? "Ready for connections" : "Signaling offline"}
            </span>
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Link to="/connect" className="nd-panel block p-5 transition hover:border-accent/40">
          <div className="flex items-center gap-2 text-accent">
            <Link2 size={18} />
            <span className="font-semibold">Connect to a device</span>
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            Enter a remote NexDesk ID to request view and control access.
          </p>
        </Link>
        <Link to="/security" className="nd-panel block p-5 transition hover:border-accent/40">
          <div className="font-semibold text-ink">Security & access</div>
          <p className="mt-2 text-sm text-ink-muted">
            Review permissions, unattended access, and revocation options.
          </p>
        </Link>
      </section>
    </div>
  );
}
