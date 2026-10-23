import { MonitorSmartphone } from "lucide-react";
import { acceptIncoming, rejectIncoming } from "../lib/sessionController";
import { useAppStore } from "../lib/store";

export function IncomingModal() {
  const incoming = useAppStore((s) => s.incoming);
  if (!incoming) return null;

  const perms = Object.entries(incoming.requested)
    .filter(([, v]) => v)
    .map(([k]) => k.replace("_", " "))
    .join(", ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 p-4">
      <div
        role="alertdialog"
        aria-labelledby="incoming-title"
        className="w-full max-w-sm rounded-2xl border border-line bg-surface-raised p-6 shadow-panel animate-fadeUp"
      >
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
          <MonitorSmartphone size={20} />
        </div>
        <h2 id="incoming-title" className="mt-4 text-lg font-semibold text-ink">
          {incoming.fromName} wants to connect
        </h2>
        <p className="mt-0.5 font-mono text-[13px] text-ink-muted">{incoming.from}</p>
        {incoming.message && <p className="mt-3 text-sm text-ink">{incoming.message}</p>}
        <dl className="mt-4 rounded-lg bg-surface-sunken px-3 py-2.5 text-sm">
          <dt className="text-[13px] text-ink-muted">They’re asking for</dt>
          <dd className="mt-0.5 font-medium capitalize text-ink">{perms || "view"}</dd>
        </dl>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
          Only accept if you know this person. They will see your screen.
        </p>
        <div className="mt-6 flex gap-2.5">
          <button className="nd-btn-outline flex-1" onClick={() => rejectIncoming()}>
            Decline
          </button>
          <button className="nd-btn-primary flex-1" onClick={() => acceptIncoming()} autoFocus>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
