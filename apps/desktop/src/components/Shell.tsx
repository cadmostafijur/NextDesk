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
  X,
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
];

const navSecondary = [
  { to: "/security", label: "Security", icon: Shield },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/about", label: "About", icon: Info },
];

function NavItem({ to, label, icon: Icon }: (typeof nav)[number]) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        clsx(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-sm transition-colors duration-150",
          isActive
            ? "bg-surface-raised font-medium text-ink shadow-[0_1px_2px_rgb(17_24_39/0.06)] ring-1 ring-line"
            : "text-ink-muted hover:bg-black/[0.04] hover:text-ink",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} className={isActive ? "text-accent" : ""} />
          {label}
        </>
      )}
    </NavLink>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const signalingConnected = useAppStore((s) => s.signalingConnected);
  const error = useAppStore((s) => s.error);
  const statusMessage = useAppStore((s) => s.statusMessage);
  const set = useAppStore((s) => s.set);

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface-sunken px-3 pb-3 pt-5">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-white">
            <MonitorSmartphone size={15} strokeWidth={2.2} />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-ink">NexDesk</span>
        </div>
        <nav className="flex flex-col gap-0.5">
          {nav.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>
        <div className="my-3 h-px bg-line" />
        <nav className="flex flex-col gap-0.5">
          {navSecondary.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>
        <NavLink
          to="/settings"
          className="mt-auto flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-ink-muted hover:bg-black/[0.04]"
          title={signalingConnected ? "Connected to the NexDesk server" : "Not connected — open Settings"}
        >
          <span
            className={clsx(
              "inline-block h-2 w-2 rounded-full",
              signalingConnected ? "bg-success" : "bg-danger",
            )}
          />
          {signalingConnected ? "Online" : "Offline — check server"}
        </NavLink>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col bg-surface">
        {(error || statusMessage) && (
          <div
            role={error ? "alert" : "status"}
            className={clsx(
              "flex items-center justify-between gap-4 border-b px-8 py-2.5 text-sm",
              error
                ? "border-danger/20 bg-danger/[0.06] text-danger"
                : "border-accent/15 bg-accent-soft text-accent-strong",
            )}
          >
            <span>{error ?? statusMessage}</span>
            <button
              className="rounded p-1 opacity-70 hover:opacity-100"
              aria-label="Dismiss"
              onClick={() => set({ error: null, statusMessage: null })}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto px-8 py-8 animate-fadeUp">{children}</div>
      </main>
    </div>
  );
}
