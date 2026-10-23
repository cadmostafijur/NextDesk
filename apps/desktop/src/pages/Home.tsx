import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Check, ArrowRight, Server, CircleAlert } from "lucide-react";
import { useAppStore } from "../lib/store";
import { FULL_ATTENDED } from "../lib/protocol";
import { requestConnect } from "../lib/sessionController";

const steps = [
  {
    title: "Run the NexDesk server on one PC",
    body: "Start nexdesk-signaling on any one computer. Both PCs talk to it to find each other.",
  },
  {
    title: "Point both PCs at that server",
    body: "In Settings, set the server address. Use the server PC’s network IP, e.g. ws://192.168.1.20:7800/ws.",
  },
  {
    title: "Enter the other PC’s ID and connect",
    body: "Type their NexDesk ID in the box above. They click Accept, and their screen appears.",
  },
];

export function Home() {
  const deviceId = useAppStore((s) => s.deviceId);
  const deviceName = useAppStore((s) => s.deviceName);
  const signalingConnected = useAppStore((s) => s.signalingConnected);
  const signalingUrl = useAppStore((s) => s.signalingUrl);
  const connectTarget = useAppStore((s) => s.connectTarget);
  const lookupStatus = useAppStore((s) => s.lookupStatus);
  const set = useAppStore((s) => s.set);
  const [copied, setCopied] = useState(false);

  async function copyId() {
    await navigator.clipboard.writeText(deviceId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (connectTarget.length >= 8) void requestConnect(connectTarget, FULL_ATTENDED);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header>
        <h1 className="nd-page-title">{deviceName || "This computer"}</h1>
        <p className="nd-page-lede">
          Share your ID so someone can ask to connect, or enter theirs to connect to them. Nothing
          happens until the other person clicks Accept.
        </p>
      </header>

      {!signalingConnected && (
        <div className="flex gap-3 rounded-xl border border-warn/25 bg-warn/[0.06] p-4">
          <CircleAlert size={18} className="mt-0.5 shrink-0 text-warn" />
          <div className="text-sm leading-relaxed text-ink">
            <p className="font-medium">Not connected to a NexDesk server</p>
            <p className="mt-0.5 text-ink-muted">
              This app is trying <code className="font-mono text-[13px] text-ink">{signalingUrl}</code>.
              Start the server, or change the address in{" "}
              <Link to="/settings" className="font-medium text-accent underline underline-offset-2">
                Settings
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      <section className="nd-panel grid md:grid-cols-2">
        <div className="border-b border-line p-6 md:border-b-0 md:border-r">
          <div className="text-sm font-medium text-ink-muted">Your ID</div>
          <code className="mt-2 block font-mono text-[26px] font-medium tracking-wide text-ink tabular-nums">
            {deviceId || "—"}
          </code>
          <button className="nd-btn-outline mt-5" onClick={copyId} type="button">
            {copied ? <Check size={15} className="text-success" /> : <Copy size={15} />}
            {copied ? "Copied" : "Copy ID"}
          </button>
        </div>

        <form className="p-6" onSubmit={submit}>
          <label htmlFor="home-target" className="text-sm font-medium text-ink-muted">
            Connect to another PC
          </label>
          <input
            id="home-target"
            className="nd-input mt-2 font-mono tracking-wide"
            placeholder="NXD-XXXX-XXXX-XXXX"
            value={connectTarget}
            onChange={(e) =>
              set({ connectTarget: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") })
            }
          />
          {lookupStatus && <p className="nd-hint">{lookupStatus}</p>}
          <button
            className="nd-btn-primary mt-3 w-full"
            type="submit"
            disabled={connectTarget.length < 8 || !signalingConnected}
          >
            Connect
            <ArrowRight size={15} />
          </button>
          <Link to="/connect" className="mt-2.5 block text-center text-[13px] text-ink-muted hover:text-ink">
            More options (view only, check if online)
          </Link>
        </form>
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Server size={16} className="text-ink-muted" />
          How connecting works
        </h2>
        <ol className="mt-4 grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="bg-surface-raised p-5">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong">
                {i + 1}
              </span>
              <p className="mt-3 text-sm font-medium text-ink">{s.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[13px] text-ink-muted">
          Testing on one PC? Leave the address as{" "}
          <code className="font-mono text-ink">ws://127.0.0.1:7800/ws</code> and open the app twice.
        </p>
      </section>
    </div>
  );
}
