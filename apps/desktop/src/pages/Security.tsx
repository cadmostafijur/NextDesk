import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../lib/store";

export function Security() {
  const deviceId = useAppStore((s) => s.deviceId);
  const [unattended, setUnattended] = useState(false);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function saveUnattended() {
    if (unattended && password.length < 12) {
      setMsg("Unattended password must be at least 12 characters.");
      return;
    }
    await invoke("set_unattended", { enabled: unattended, password: unattended ? password : null });
    setMsg(
      unattended
        ? "Unattended access enabled locally. Revoke anytime from this screen."
        : "Unattended access disabled.",
    );
    setPassword("");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="nd-page-title">Security & access</h1>
        <p className="nd-page-lede">
          Device <span className="font-mono text-ink">{deviceId}</span> is an identifier only.
          Authentication uses device secrets, account tokens, and explicit session consent.
        </p>
      </div>

      <section className="nd-panel p-6">
        <h2 className="text-base font-semibold text-ink">Unattended access</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Off by default. Enabling stores a credential via the OS secret store / local encrypted
          preference and requires that credential for auto-accept. Active sessions remain visible.
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={unattended}
            onChange={(e) => setUnattended(e.target.checked)}
          />
          Allow unattended access with password
        </label>
        {unattended && (
          <input
            className="nd-input mt-3"
            type="password"
            placeholder="Strong unattended password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        <button className="nd-btn-primary mt-4" type="button" onClick={() => void saveUnattended()}>
          Save
        </button>
        {msg && <p className="mt-3 text-sm text-accent-strong">{msg}</p>}
      </section>

      <section className="nd-panel p-6">
        <h2 className="text-base font-semibold text-ink">Session safety</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>Reject unexpected connection requests.</li>
          <li>Prefer view-only when control is not needed.</li>
          <li>Disconnect ends input injection and capture immediately.</li>
          <li>Revoke device tokens from your account when a machine is lost.</li>
        </ul>
      </section>
    </div>
  );
}
