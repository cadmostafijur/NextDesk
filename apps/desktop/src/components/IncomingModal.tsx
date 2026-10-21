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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="nd-panel w-full max-w-md p-6 shadow-panel animate-fadeUp">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Incoming connection
        </div>
        <h2 className="mt-2 text-2xl font-bold text-ink">{incoming.fromName}</h2>
        <p className="mt-1 font-mono text-sm text-ink-muted">{incoming.from}</p>
        {incoming.message && (
          <p className="mt-3 text-sm text-ink">{incoming.message}</p>
        )}
        <p className="mt-4 text-sm text-ink-muted">
          Requested permissions: <span className="text-ink">{perms || "view"}</span>
        </p>
        <p className="mt-2 text-xs text-ink-faint">
          Device IDs are not passwords. Only accept connections from people you trust.
        </p>
        <div className="mt-6 flex gap-3">
          <button className="nd-btn-danger flex-1" onClick={() => rejectIncoming()}>
            Reject
          </button>
          <button className="nd-btn-primary flex-1" onClick={() => acceptIncoming()}>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
