import { useAppStore } from "../lib/store";

export function Recent() {
  const recent = useAppStore((s) => s.recent);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="nd-page-title">Recent sessions</h1>
      <p className="nd-page-lede">Local history of completed connections on this device.</p>
      <div className="nd-panel mt-6 divide-y divide-line">
        {recent.length === 0 && (
          <p className="p-5 text-ink-muted">No sessions yet.</p>
        )}
        {recent.map((s) => (
          <div key={s.id} className="flex items-center justify-between px-5 py-3 text-sm">
            <div>
              <div className="font-mono font-medium text-ink">{s.peer}</div>
              <div className="text-ink-muted capitalize">{s.role}</div>
            </div>
            <div className="text-right text-ink-muted">
              <div>{Math.max(1, s.durationSec)}s</div>
              <div>{new Date(s.endedAt).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
