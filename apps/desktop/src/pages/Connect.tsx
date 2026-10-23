import { useState } from "react";
import clsx from "clsx";
import { Eye, MousePointer2 } from "lucide-react";
import { FULL_ATTENDED, VIEW_ONLY, type PermissionSet } from "../lib/protocol";
import { lookupDevice, requestConnect } from "../lib/sessionController";
import { useAppStore } from "../lib/store";

const modes = [
  { key: "control", label: "View and control", hint: "See their screen and use their mouse and keyboard.", icon: MousePointer2, perms: FULL_ATTENDED },
  { key: "view", label: "View only", hint: "Just watch their screen.", icon: Eye, perms: VIEW_ONLY },
] as const;

export function Connect() {
  const connectTarget = useAppStore((s) => s.connectTarget);
  const lookupStatus = useAppStore((s) => s.lookupStatus);
  const signalingConnected = useAppStore((s) => s.signalingConnected);
  const set = useAppStore((s) => s.set);
  const [perms, setPerms] = useState<PermissionSet>(FULL_ATTENDED);

  function normalize(v: string) {
    return v.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  }

  const ready = connectTarget.length >= 8 && signalingConnected;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="nd-page-title">Connect</h1>
      <p className="nd-page-lede">
        Enter the other PC’s ID. Its owner sees a request and must click Accept before anything is
        shared.
      </p>

      <div className="nd-panel mt-6 space-y-6 p-6">
        <label className="block">
          <span className="nd-label">Their NexDesk ID</span>
          <input
            className="nd-input font-mono tracking-wide"
            placeholder="NXD-XXXX-XXXX-XXXX"
            value={connectTarget}
            onChange={(e) => set({ connectTarget: normalize(e.target.value) })}
          />
          <span className="nd-hint block">It’s shown on the Home screen of the other computer.</span>
        </label>

        <fieldset>
          <legend className="nd-label">What do you need?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {modes.map((m) => {
              const active = m.key === "control" ? perms.control : !perms.control;
              return (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPerms(m.perms)}
                  className={clsx(
                    "rounded-lg border p-3.5 text-left transition-colors duration-150",
                    active
                      ? "border-accent bg-accent-soft/60 ring-1 ring-accent"
                      : "border-line hover:bg-surface-sunken",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-ink">
                    <m.icon size={15} className={active ? "text-accent" : "text-ink-muted"} />
                    {m.label}
                  </span>
                  <span className="mt-1 block text-[13px] text-ink-muted">{m.hint}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {lookupStatus && (
          <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink">{lookupStatus}</p>
        )}
        {!signalingConnected && (
          <p className="text-sm text-warn">
            You’re offline. Set the server address in Settings before connecting.
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            className="nd-btn-outline flex-1"
            onClick={() => lookupDevice(connectTarget)}
            disabled={!ready}
          >
            Check if online
          </button>
          <button
            type="button"
            className="nd-btn-primary flex-1"
            onClick={() => requestConnect(connectTarget, perms)}
            disabled={!ready}
          >
            Send request
          </button>
        </div>
      </div>
    </div>
  );
}
