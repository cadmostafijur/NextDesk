import { useAppStore } from "../lib/store";

export function FileTransfer() {
  const active = useAppStore((s) => s.activeSession);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold text-ink">File transfer</h1>
      <p className="mt-2 text-ink-muted">
        Transfers require an active session with the file_transfer permission. Paths are sanitized;
        SHA-256 verifies integrity after each completed transfer.
      </p>
      <div className="nd-panel mt-6 p-6">
        {!active ? (
          <p className="text-ink-muted">No active session. Connect to a device first.</p>
        ) : !active.granted.file_transfer ? (
          <p className="text-warn">File transfer was not granted for this session.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              Select a file to send to <span className="font-mono text-ink">{active.peer}</span>.
            </p>
            <input
              type="file"
              className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
              onChange={() => {
                // Wired to native transfer commands in Phase 5 hardening.
                useAppStore.getState().set({
                  statusMessage:
                    "File selected — transfer pipeline uses the session data channel (see docs/FEATURE_MATRIX.md).",
                });
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
