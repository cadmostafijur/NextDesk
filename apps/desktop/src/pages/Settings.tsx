import { invoke } from "@tauri-apps/api/core";
import { connectSignaling } from "../lib/sessionController";
import { useAppStore } from "../lib/store";

export function Settings() {
  const theme = useAppStore((s) => s.theme);
  const signalingUrl = useAppStore((s) => s.signalingUrl);
  const deviceName = useAppStore((s) => s.deviceName);
  const set = useAppStore((s) => s.set);

  async function persist() {
    await invoke("update_settings", {
      theme,
      signalingUrl,
      deviceName,
    });
    try {
      await connectSignaling();
      set({ statusMessage: "Settings saved and signaling reconnected." });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Saved locally; signaling reconnect failed.",
      });
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-bold text-ink">Settings</h1>
      <div className="nd-panel mt-6 space-y-4 p-5">
        <label>
          <span className="nd-label">Device name</span>
          <input
            className="nd-input"
            value={deviceName}
            onChange={(e) => set({ deviceName: e.target.value })}
          />
        </label>
        <label>
          <span className="nd-label">Theme</span>
          <select
            className="nd-input"
            value={theme}
            onChange={(e) => set({ theme: e.target.value as "light" | "dark" | "system" })}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label>
          <span className="nd-label">Signaling WebSocket URL</span>
          <input
            className="nd-input font-mono"
            value={signalingUrl}
            onChange={(e) => set({ signalingUrl: e.target.value })}
          />
        </label>
        <button className="nd-btn-primary" type="button" onClick={() => void persist()}>
          Save settings
        </button>
      </div>
    </div>
  );
}
