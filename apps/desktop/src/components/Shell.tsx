import { NavLink } from "react-router-dom";
import {
  Home,
  Link2,
  FolderOpen,
  Clock3,
  MonitorSmartphone,
  Shield,
  Settings,
  Info,
} from "lucide-react";
import { useAppStore } from "../lib/store";
import clsx from "clsx";
import type { ReactNode } from "react";

const nav = [
  { to: "/", label: "Home", icon: Home },
  { to: "/connect", label: "Connect", icon: Link2 },
  { to: "/files", label: "Files", icon: FolderOpen },
  { to: "/recent", label: "Recent", icon: Clock3 },
  { to: "/devices", label: "Devices", icon: MonitorSmartphone },
  { to: "/security", label: "Security", icon: Shield },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/about", label: "About", icon: Info },
];

export function Shell({ children }: { children: ReactNode }) {
  const presence = useAppStore((s) => s.presence);
  const signalingConnected = useAppStore((s) => s.signalingConnected);
  const error = useAppStore((s) => s.error);
  const statusMessage = useAppStore((s) => s.statusMessage);
  const set = useAppStore((s) => s.set);

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface-raised/70 px-3 py-4">
        <div className="mb-6 px-2">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">NexDesk</div>
          <div className="mt-1 text-lg font-bold text-ink">Remote Desktop</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition",
                  isActive
                    ? "bg-accent/15 text-accent-strong"
                    : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
                )
              }
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 rounded-xl border border-line bg-surface-sunken/60 px-3 py-2.5 text-xs">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <span
              className={clsx(
                "inline-block h-2 w-2 rounded-full",
                signalingConnected ? "bg-success animate-pulseDot" : "bg-ink-faint",
              )}
            />
            {signalingConnected ? "Online" : "Offline"}
          </div>
          <div className="mt-1 text-ink-muted capitalize">Presence: {presence}</div>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        {(error || statusMessage) && (
          <div
            className={clsx(
              "flex items-center justify-between border-b px-5 py-2 text-sm",
              error
                ? "border-danger/30 bg-danger/10 text-danger"
                : "border-accent/20 bg-accent/10 text-accent-strong",
            )}
          >
            <span>{error ?? statusMessage}</span>
            <button
              className="text-xs font-semibold opacity-70 hover:opacity-100"
              onClick={() => set({ error: null, statusMessage: null })}
            >
              Dismiss
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto p-6 animate-fadeUp">{children}</div>
      </main>
    </div>
  );
}
