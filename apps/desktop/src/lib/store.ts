import { create } from "zustand";
import type { PermissionSet, SessionRole, DevicePresence } from "./protocol";
import { FULL_ATTENDED } from "./protocol";

export interface IncomingRequest {
  sessionId: string;
  from: string;
  fromName: string;
  requested: PermissionSet;
  message?: string | null;
}

export interface ActiveSession {
  sessionId: string;
  role: SessionRole;
  peer: string;
  granted: PermissionSet;
  startedAt: number;
  connectionState: string;
  captureMode?: string;
}

export interface RecentSession {
  id: string;
  peer: string;
  peerName?: string;
  role: SessionRole;
  endedAt: number;
  durationSec: number;
}

export interface AppState {
  onboarded: boolean;
  deviceId: string;
  deviceName: string;
  deviceSecret: string;
  deviceToken: string;
  theme: "light" | "dark" | "system";
  signalingUrl: string;
  signalingConnected: boolean;
  presence: DevicePresence;
  connectTarget: string;
  lookupStatus: string | null;
  incoming: IncomingRequest | null;
  activeSession: ActiveSession | null;
  recent: RecentSession[];
  savedDevices: { id: string; name: string }[];
  statusMessage: string | null;
  error: string | null;
  set: (partial: Partial<AppState>) => void;
}

export const APP_VERSION = "0.1.3";

const defaultSignaling =
  import.meta.env.VITE_SIGNALING_URL ?? "wss://nextdesk-4ecs.onrender.com/ws";

export const useAppStore = create<AppState>((set) => ({
  onboarded: false,
  deviceId: "",
  deviceName: "",
  deviceSecret: "",
  deviceToken: "",
  theme: "light",
  signalingUrl: defaultSignaling,
  signalingConnected: false,
  presence: "offline",
  connectTarget: "",
  lookupStatus: null,
  incoming: null,
  activeSession: null,
  recent: [],
  savedDevices: [],
  statusMessage: null,
  error: null,
  set: (partial) => set(partial),
}));

export { FULL_ATTENDED };
