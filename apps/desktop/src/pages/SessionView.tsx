import { useEffect, useRef, useState } from "react";
import { Maximize2, MessageSquare, PhoneOff, Gauge } from "lucide-react";
import { endSession, sendChat, sendInputEvent } from "../lib/sessionController";
import { useAppStore } from "../lib/store";

export function SessionView() {
  const active = useAppStore((s) => s.activeSession)!;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [useCanvas, setUseCanvas] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - active.startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(t);
  }, [active.startedAt]);

  useEffect(() => {
    const onStream = (ev: Event) => {
      const stream = (ev as CustomEvent<MediaStream>).detail;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => undefined);
        setUseCanvas(false);
      }
    };
    const onFrame = (ev: Event) => {
      const bmp = (ev as CustomEvent<ImageBitmap>).detail;
      const canvas = canvasRef.current;
      if (!canvas) return;
      setUseCanvas(true);
      if (canvas.width !== bmp.width || canvas.height !== bmp.height) {
        canvas.width = bmp.width;
        canvas.height = bmp.height;
      }
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(bmp, 0, 0);
      bmp.close();
    };
    const onChat = (ev: Event) => {
      const text = (ev as CustomEvent<string>).detail;
      setMessages((m) => [...m, `Peer: ${text}`]);
      setChatOpen(true);
    };
    window.addEventListener("nexdesk:remote-stream", onStream);
    window.addEventListener("nexdesk:remote-frame", onFrame);
    window.addEventListener("nexdesk:chat", onChat);
    return () => {
      window.removeEventListener("nexdesk:remote-stream", onStream);
      window.removeEventListener("nexdesk:remote-frame", onFrame);
      window.removeEventListener("nexdesk:chat", onChat);
    };
  }, []);

  function mapPointer(e: React.PointerEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    return { nx: clamp01(nx), ny: clamp01(ny) };
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (active.role !== "controller" || !active.granted.control) return;
    const { nx, ny } = mapPointer(e);
    sendInputEvent({ kind: "mouse_move", x: 0, y: 0, nx, ny });
  }

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (active.role !== "controller" || !active.granted.control) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { nx, ny } = mapPointer(e);
    const button = e.button === 2 ? "right" : e.button === 1 ? "middle" : "left";
    sendInputEvent({ kind: "mouse_button", button, pressed: true, nx, ny });
  }

  function onPointerUp(e: React.PointerEvent<HTMLElement>) {
    if (active.role !== "controller" || !active.granted.control) return;
    const { nx, ny } = mapPointer(e);
    const button = e.button === 2 ? "right" : e.button === 1 ? "middle" : "left";
    sendInputEvent({ kind: "mouse_button", button, pressed: false, nx, ny });
  }

  function onWheel(e: React.WheelEvent<HTMLElement>) {
    if (active.role !== "controller" || !active.granted.control) return;
    e.preventDefault();
    const { nx, ny } = mapPointer(e as unknown as React.PointerEvent<HTMLElement>);
    sendInputEvent({ kind: "mouse_wheel", dx: e.deltaX, dy: e.deltaY, nx, ny });
  }

  function onKey(e: React.KeyboardEvent, pressed: boolean) {
    if (active.role !== "controller" || !active.granted.control) return;
    e.preventDefault();
    sendInputEvent({
      kind: "key",
      key: e.key,
      code: e.code,
      pressed,
      modifiers: {
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey,
      },
    });
  }

  function submitChat(e: React.FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    sendChat(text);
    setMessages((m) => [...m, `You: ${text}`]);
    setChatInput("");
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-sunken">
      <header className="flex items-center justify-between border-b border-line bg-surface-raised px-4 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-ink">
            {active.role === "host" ? "Sharing with" : "Connected to"}
          </span>
          <span className="font-mono text-sm text-ink-muted">{active.peer}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <Gauge size={14} />
            {active.connectionState}
            {active.captureMode ? ` · ${active.captureMode}` : ""}
          </span>
          <span className="font-mono">{mm}:{ss}</span>
          {active.granted.control && active.role === "controller" && (
            <span className="rounded-md bg-warn/20 px-2 py-0.5 font-semibold text-warn">
              Remote control active
            </span>
          )}
          {active.role === "host" && (
            <span className="rounded-md bg-danger/15 px-2 py-0.5 font-semibold text-danger">
              Your screen is shared
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="nd-btn-ghost" type="button" onClick={() => setChatOpen((v) => !v)}>
            <MessageSquare size={16} /> Chat
          </button>
          <button
            className="nd-btn-ghost"
            type="button"
            onClick={() => {
              const el = useCanvas ? canvasRef.current : videoRef.current;
              void el?.requestFullscreen?.();
            }}
          >
            <Maximize2 size={16} />
          </button>
          <button className="nd-btn-danger" type="button" onClick={() => void endSession()}>
            <PhoneOff size={16} /> Disconnect
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          className="absolute inset-0 flex items-center justify-center bg-black outline-none"
          tabIndex={0}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
          onKeyDown={(e) => onKey(e, true)}
          onKeyUp={(e) => onKey(e, false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <video
            ref={videoRef}
            className={useCanvas ? "hidden" : "max-h-full max-w-full object-contain"}
            muted
            playsInline
          />
          <canvas
            ref={canvasRef}
            className={useCanvas ? "max-h-full max-w-full object-contain" : "hidden"}
          />
          {active.role === "host" && (
            <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-4 py-2 text-sm text-white">
              Waiting for controller media / streaming your display…
            </div>
          )}
        </div>

        {chatOpen && (
          <aside className="absolute bottom-4 right-4 flex h-72 w-80 flex-col rounded-xl border border-line bg-surface-raised shadow-panel">
            <div className="border-b border-line px-3 py-2 text-sm font-semibold">Session chat</div>
            <div className="flex-1 space-y-1 overflow-auto p-3 text-sm">
              {messages.length === 0 && (
                <p className="text-ink-faint">No messages yet.</p>
              )}
              {messages.map((m, i) => (
                <p key={i}>{m}</p>
              ))}
            </div>
            <form onSubmit={submitChat} className="flex gap-2 border-t border-line p-2">
              <input
                className="nd-input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Message…"
              />
              <button className="nd-btn-primary" type="submit">
                Send
              </button>
            </form>
          </aside>
        )}
      </div>
    </div>
  );
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}
