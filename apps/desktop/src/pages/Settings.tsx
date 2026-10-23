import { invoke } from "@tauri-apps/api/core";
import { connectSignaling } from "../lib/sessionController";
import { useAppStore } from "../lib/store";

const CLOUD_URL = "wss://nextdesk-4ecs.onrender.com/ws";
const LOCAL_URL = "ws://127.0.0.1:7800/ws";

export function Settings() {
  const theme = useAppStore((s) => s.theme);
  const signalingUrl = useAppStore((s) => s.signalingUrl);
  const signalingConnected = useAppStore((s) => s.signalingConnected);
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
      set({ statusMessage: "Saved. Connected to the NexDesk server." });
    } catch (e) {
      set({
        error:
          e instanceof Error
            ? `Saved, but couldn’t reach the server: ${e.message}`
            : "Saved, but couldn’t reach the server. Check the address and that the server is running.",
      });
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="nd-page-title">Settings</h1>

      <section className="nd-panel mt-6 p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-ink">Server connection</h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              signalingConnected ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${signalingConnected ? "bg-success" : "bg-danger"}`} />
            {signalingConnected ? "Connected" : "Not connected"}
          </span>
        </div>
        <label className="mt-5 block">
          <span className="nd-label">Server address</span>
          <input
            className="nd-input font-mono"
            value={signalingUrl}
            spellCheck={false}
            onChange={(e) => set({ signalingUrl: e.target.value.trim() })}
          />
        </label>
        <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-ink-muted">
          <li>
            Both computers must use the <span className="font-medium text-ink">same</span> server.
          </li>
          <li>
            NexDesk cloud (default):{" "}
            <button
              type="button"
              className="font-mono text-accent underline underline-offset-2"
              onClick={() => set({ signalingUrl: CLOUD_URL })}
            >
              {CLOUD_URL}
            </button>
          </li>
          <li>
            Your own server on this PC:{" "}
            <button
              type="button"
              className="font-mono text-accent underline underline-offset-2"
              onClick={() => set({ signalingUrl: LOCAL_URL })}
            >
              {LOCAL_URL}
            </button>
            . Other PCs then use <code className="font-mono text-ink">ws://THIS-PC-IP:7800/ws</code>.
          </li>
        </ul>
      </section>

      <section className="nd-panel mt-4 space-y-5 p-6">
        <h2 className="text-base font-semibold text-ink">This computer</h2>
        <label className="block">
          <span className="nd-label">Device name</span>
          <input
            className="nd-input"
            value={deviceName}
            onChange={(e) => set({ deviceName: e.target.value })}
          />
          <span className="nd-hint block">Shown to the other person when you connect.</span>
        </label>
        <label className="block">
          <span className="nd-label">Appearance</span>
          <select
            className="nd-input"
            value={theme}
            onChange={(e) => set({ theme: e.target.value as "light" | "dark" | "system" })}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">Match Windows</option>
          </select>
        </label>
      </section>

      <div className="mt-6 flex justify-end">
        <button className="nd-btn-primary" type="button" onClick={() => void persist()}>
          Save and reconnect
        </button>
      </div>
    </div>
  );
}
