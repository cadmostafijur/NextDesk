import { useState } from "react";
import { FULL_ATTENDED, VIEW_ONLY, type PermissionSet } from "../lib/protocol";
import { lookupDevice, requestConnect } from "../lib/sessionController";
import { useAppStore } from "../lib/store";

export function Connect() {
  const connectTarget = useAppStore((s) => s.connectTarget);
  const lookupStatus = useAppStore((s) => s.lookupStatus);
  const set = useAppStore((s) => s.set);
  const [perms, setPerms] = useState<PermissionSet>(FULL_ATTENDED);

  function normalize(v: string) {
    return v.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-bold text-ink">Connect</h1>
      <p className="mt-2 text-ink-muted">
        Enter the remote device ID. The owner must accept before any screen or input access begins.
      </p>

      <div className="nd-panel mt-6 p-5">
        <label>
          <span className="nd-label">Remote device ID</span>
          <input
            className="nd-input font-mono tracking-wide"
            placeholder="NXD-XXXX-XXXX-XXXX"
            value={connectTarget}
            onChange={(e) => set({ connectTarget: normalize(e.target.value) })}
          />
        </label>

        <div className="mt-5">
          <div className="nd-label">Requested permissions</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`nd-btn border border-line ${perms.control ? "bg-accent/15 text-accent-strong" : ""}`}
              onClick={() => setPerms(FULL_ATTENDED)}
            >
              View + control
            </button>
            <button
              type="button"
              className={`nd-btn border border-line ${!perms.control ? "bg-accent/15 text-accent-strong" : ""}`}
              onClick={() => setPerms(VIEW_ONLY)}
            >
              View only
            </button>
          </div>
        </div>

        {lookupStatus && <p className="mt-4 text-sm text-ink-muted">{lookupStatus}</p>}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            className="nd-btn-ghost border border-line flex-1"
            onClick={() => lookupDevice(connectTarget)}
            disabled={connectTarget.length < 8}
          >
            Check availability
          </button>
          <button
            type="button"
            className="nd-btn-primary flex-1"
            onClick={() => requestConnect(connectTarget, perms)}
            disabled={connectTarget.length < 8}
          >
            Request connection
          </button>
        </div>
      </div>
    </div>
  );
}
