import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SignalingClient } from "./signaling";
import { RemoteSession, type IcePayload } from "./webrtc";
import { FULL_ATTENDED, type PermissionSet, type SignalMessage } from "./protocol";
import { APP_VERSION, useAppStore } from "./store";

let signaling: SignalingClient | null = null;
let remote: RemoteSession | null = null;
let pendingOffer: string | null = null;
// ICE that arrives before this side's RemoteSession exists.
let pendingIce: IcePayload[] = [];

export function getSignaling(): SignalingClient | null {
  return signaling;
}

export function getRemote(): RemoteSession | null {
  return remote;
}

export async function bootstrapIdentity(): Promise<void> {
  const identity = await invoke<{
    device_id: string;
    device_name: string;
    device_secret: string;
    device_token: string;
    onboarded: boolean;
    signaling_url: string;
    theme: "light" | "dark" | "system";
  }>("get_identity");

  useAppStore.getState().set({
    deviceId: identity.device_id,
    deviceName: identity.device_name,
    deviceSecret: identity.device_secret,
    deviceToken: identity.device_token,
    onboarded: identity.onboarded,
    signalingUrl: identity.signaling_url || useAppStore.getState().signalingUrl,
    theme: identity.theme,
  });
}

export async function completeOnboarding(deviceName: string): Promise<void> {
  const identity = await invoke<{
    device_id: string;
    device_name: string;
    device_secret: string;
    device_token: string;
    onboarded: boolean;
    signaling_url: string;
    theme: "light" | "dark" | "system";
  }>("complete_onboarding", { deviceName });

  useAppStore.getState().set({
    deviceId: identity.device_id,
    deviceName: identity.device_name,
    deviceSecret: identity.device_secret,
    deviceToken: identity.device_token,
    onboarded: true,
    signalingUrl: identity.signaling_url || useAppStore.getState().signalingUrl,
  });
  await connectSignaling();
}

export async function connectSignaling(): Promise<void> {
  const st = useAppStore.getState();
  if (!st.deviceId || !st.deviceSecret) return;

  signaling?.close();
  signaling = new SignalingClient(st.signalingUrl);
  signaling.onMessage(handleSignal);

  // The device secret never expires and lets the server re-bind this ID after
  // it restarts, unlike the 12-hour registration JWT.
  await signaling.connect({
    type: "hello",
    device_id: st.deviceId,
    device_name: st.deviceName || "NexDesk PC",
    auth_token: st.deviceSecret,
    client_version: APP_VERSION,
  });

  useAppStore.getState().set({
    signalingConnected: true,
    presence: "online",
    error: null,
    statusMessage: "Connected to NexDesk network",
  });
}

function handleSignal(msg: SignalMessage): void {
  const store = useAppStore.getState();

  switch (msg.type) {
    case "hello_ack":
      store.set({ signalingConnected: true, presence: "online" });
      break;
    case "lookup_device_result": {
      if (!msg.found) {
        store.set({ lookupStatus: "Device not found" });
      } else if (msg.presence === "offline" || !msg.presence) {
        store.set({
          lookupStatus: `${msg.display_name ?? msg.target_id} is offline`,
        });
      } else if (msg.presence === "busy") {
        store.set({ lookupStatus: `${msg.display_name ?? msg.target_id} is busy` });
      } else {
        store.set({
          lookupStatus: `${msg.display_name ?? msg.target_id} is online`,
        });
      }
      break;
    }
    case "connect_incoming":
      store.set({
        incoming: {
          sessionId: msg.session_id,
          from: msg.from,
          fromName: msg.from_name,
          requested: msg.requested,
          message: msg.message,
        },
      });
      break;
    case "connect_reject":
      store.set({
        error: `Connection rejected: ${msg.reason}`,
        statusMessage: null,
      });
      break;
    case "connect_cancel":
      if (store.incoming?.sessionId === msg.session_id) {
        store.set({ incoming: null, statusMessage: "Caller cancelled" });
      }
      break;
    case "session_ready":
      void beginMediaSession(msg.session_id, msg.role, msg.peer, msg.granted);
      break;
    case "sdp_offer":
      void (async () => {
        if (!remote) {
          pendingOffer = msg.sdp;
          return;
        }
        await remote.acceptOffer(msg.sdp);
      })();
      break;
    case "sdp_answer":
      void remote?.acceptAnswer(msg.sdp);
      break;
    case "ice_candidate": {
      const ice = {
        candidate: msg.candidate,
        sdpMid: msg.sdp_mid,
        sdpMLineIndex: msg.sdp_mline_index,
      };
      if (remote) void remote.addIce(ice);
      else pendingIce.push(ice);
      break;
    }
    case "session_end":
      void teardownSession(msg.reason);
      break;
    case "error":
      store.set({ error: `${msg.code}: ${msg.message}` });
      break;
    default:
      break;
  }
}

async function beginMediaSession(
  sessionId: string,
  role: "controller" | "host",
  peer: string,
  granted: PermissionSet,
): Promise<void> {
  const store = useAppStore.getState();
  await remote?.close();

  remote = new RemoteSession(role, sessionId, granted, signaling?.turn ?? null, {
    onLocalDescription: (type, sdp) => {
      if (type === "offer") {
        signaling?.send({ type: "sdp_offer", session_id: sessionId, sdp });
      } else {
        signaling?.send({ type: "sdp_answer", session_id: sessionId, sdp });
      }
    },
    onIceCandidate: (ice) => {
      signaling?.send({
        type: "ice_candidate",
        session_id: sessionId,
        candidate: ice.candidate,
        sdp_mid: ice.sdpMid,
        sdp_mline_index: ice.sdpMLineIndex ?? undefined,
      });
    },
    onRemoteStream: (stream) => {
      window.dispatchEvent(new CustomEvent("nexdesk:remote-stream", { detail: stream }));
    },
    onFrame: (bitmap) => {
      window.dispatchEvent(new CustomEvent("nexdesk:remote-frame", { detail: bitmap }));
    },
    onDataMessage: (data) => {
      window.dispatchEvent(new CustomEvent("nexdesk:control-message", { detail: data }));
      void handleHostControl(data, granted);
    },
    onConnectionState: (state) => {
      const cur = useAppStore.getState().activeSession;
      if (cur) {
        useAppStore.getState().set({
          activeSession: { ...cur, connectionState: state, captureMode: remote?.getCaptureMode() },
        });
      }
    },
    onError: (err) => {
      useAppStore.getState().set({ error: err.message });
    },
  });

  store.set({
    incoming: null,
    activeSession: {
      sessionId,
      role,
      peer,
      granted,
      startedAt: Date.now(),
      connectionState: "new",
    },
    statusMessage: role === "host" ? "Sharing your screen…" : "Connected to remote desktop",
  });

  const session = remote;
  for (const ice of pendingIce.splice(0)) void session.addIce(ice);

  // Get the NexDesk window out of the way so the controller sees the desktop.
  // The host brings it back from the taskbar to chat or disconnect.
  if (role === "host") void getCurrentWindow().minimize().catch(() => undefined);

  if (role === "controller") {
    await session.startAsController();
  } else if (pendingOffer) {
    const offer = pendingOffer;
    pendingOffer = null;
    await session.acceptOffer(offer);
  }
}

async function handleHostControl(raw: string, granted: PermissionSet): Promise<void> {
  let msg: { type?: string; event?: unknown; text?: string };
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.type === "input_event" && granted.control && msg.event) {
    // A single rejected event (e.g. an unmapped key) must not break the session.
    await invoke("inject_input", { event: msg.event }).catch((e) =>
      console.warn("input injection failed", e),
    );
  }
  if (msg.type === "chat" && granted.chat && typeof msg.text === "string") {
    window.dispatchEvent(new CustomEvent("nexdesk:chat", { detail: msg.text }));
  }
}

export function lookupDevice(targetId: string): void {
  useAppStore.getState().set({ lookupStatus: "Looking up…" });
  signaling?.send({ type: "lookup_device", target_id: targetId.trim().toUpperCase() });
}

export function requestConnect(targetId: string, requested: PermissionSet = FULL_ATTENDED): void {
  const st = useAppStore.getState();
  const sessionId = crypto.randomUUID();
  signaling?.send({
    type: "connect_request",
    session_id: sessionId,
    to: targetId.trim().toUpperCase(),
    from_name: st.deviceName || "NexDesk User",
    requested,
    message: null,
  });
  st.set({ statusMessage: "Waiting for the remote user to accept…" });
}

export function acceptIncoming(granted?: PermissionSet): void {
  const incoming = useAppStore.getState().incoming;
  if (!incoming) return;
  signaling?.send({
    type: "connect_accept",
    session_id: incoming.sessionId,
    granted: granted ?? incoming.requested,
  });
}

export function rejectIncoming(reason = "Rejected by user"): void {
  const incoming = useAppStore.getState().incoming;
  if (!incoming) return;
  signaling?.send({
    type: "connect_reject",
    session_id: incoming.sessionId,
    reason,
  });
  useAppStore.getState().set({ incoming: null });
}

export async function endSession(reason = "User disconnected"): Promise<void> {
  const active = useAppStore.getState().activeSession;
  if (active) {
    signaling?.send({
      type: "session_end",
      session_id: active.sessionId,
      reason,
    });
  }
  await teardownSession(reason);
}

async function teardownSession(reason: string): Promise<void> {
  const active = useAppStore.getState().activeSession;
  if (active) {
    const durationSec = Math.round((Date.now() - active.startedAt) / 1000);
    const recent = [
      {
        id: active.sessionId,
        peer: active.peer,
        role: active.role,
        endedAt: Date.now(),
        durationSec,
      },
      ...useAppStore.getState().recent,
    ].slice(0, 50);
    useAppStore.getState().set({ recent });
    await invoke("record_session", {
      peer: active.peer,
      role: active.role,
      durationSec,
      reason,
    }).catch(() => undefined);
  }
  await remote?.close();
  remote = null;
  pendingOffer = null;
  pendingIce = [];
  try {
    await invoke("input_reset");
  } catch {
    /* ignore */
  }
  if (active?.role === "host") {
    const win = getCurrentWindow();
    void win
      .unminimize()
      .then(() => win.setFocus())
      .catch(() => undefined);
  }
  useAppStore.getState().set({
    activeSession: null,
    statusMessage: `Session ended (${reason})`,
  });
}

export function sendChat(text: string): void {
  remote?.sendControl({ type: "chat", text });
}

export function sendInputEvent(event: unknown): void {
  const active = useAppStore.getState().activeSession;
  if (!active?.granted.control) return;
  remote?.sendControl({ type: "input_event", event });
}
