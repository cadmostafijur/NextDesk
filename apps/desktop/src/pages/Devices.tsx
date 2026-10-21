import { useAppStore } from "../lib/store";

export function Devices() {
  const saved = useAppStore((s) => s.savedDevices);
  const connectTarget = useAppStore((s) => s.connectTarget);
  const set = useAppStore((s) => s.set);

  function saveCurrent() {
    const id = connectTarget.trim().toUpperCase();
    if (!id) return;
    if (saved.some((d) => d.id === id)) return;
    set({ savedDevices: [...saved, { id, name: id }] });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold text-ink">Saved devices</h1>
      <p className="mt-2 text-ink-muted">
        Bookmarks for devices you connect to often. Saving an ID does not grant access.
      </p>
      <div className="mt-4">
        <button className="nd-btn-primary" type="button" onClick={saveCurrent}>
          Save ID from Connect field
        </button>
      </div>
      <div className="nd-panel mt-6 divide-y divide-line">
        {saved.length === 0 && <p className="p-5 text-ink-muted">No saved devices.</p>}
        {saved.map((d) => (
          <button
            key={d.id}
            type="button"
            className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-surface-sunken"
            onClick={() => set({ connectTarget: d.id })}
          >
            <span className="font-medium text-ink">{d.name}</span>
            <span className="font-mono text-sm text-ink-muted">{d.id}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
