import type { PermissionSet, TurnConfig } from "./protocol";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type SessionRole = "controller" | "host";

export interface IcePayload {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

export interface RemoteSessionCallbacks {
  onLocalDescription: (type: "offer" | "answer", sdp: string) => void;
  onIceCandidate: (ice: IcePayload) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onDataMessage: (data: string) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  onFrame?: (bitmap: ImageBitmap) => void;
  onError: (err: Error) => void;
}

export class RemoteSession {
  readonly role: SessionRole;
  readonly sessionId: string;
  readonly permissions: PermissionSet;
  private pc: RTCPeerConnection;
  private controlDc: RTCDataChannel | null = null;
  private frameDc: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private unlistenCapture: UnlistenFn | null = null;
  private captureMode: "webrtc-track" | "native-frames" | "none" = "none";
  private callbacks: RemoteSessionCallbacks;
  private closed = false;

  constructor(
    role: SessionRole,
    sessionId: string,
    permissions: PermissionSet,
    turn: TurnConfig | null,
    callbacks: RemoteSessionCallbacks,
  ) {
    this.role = role;
    this.sessionId = sessionId;
    this.permissions = permissions;
    this.callbacks = callbacks;

    const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
    if (turn?.urls?.length) {
      iceServers.push({
        urls: turn.urls,
        username: turn.username,
        credential: turn.credential,
      });
    }

    this.pc = new RTCPeerConnection({ iceServers });
    this.pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.callbacks.onIceCandidate({
          candidate: ev.candidate.candidate,
          sdpMid: ev.candidate.sdpMid,
          sdpMLineIndex: ev.candidate.sdpMLineIndex,
        });
      }
    };
    this.pc.onconnectionstatechange = () => {
      this.callbacks.onConnectionState(this.pc.connectionState);
    };
    this.pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      this.callbacks.onRemoteStream(stream);
    };
    this.pc.ondatachannel = (ev) => {
      this.bindDataChannel(ev.channel);
    };
  }

  private bindDataChannel(dc: RTCDataChannel): void {
    if (dc.label === "control") this.controlDc = dc;
    if (dc.label === "frames") this.frameDc = dc;
    dc.binaryType = "arraybuffer";
    dc.onmessage = async (ev) => {
      if (typeof ev.data === "string") {
        this.callbacks.onDataMessage(ev.data);
        return;
      }
      if (ev.data instanceof ArrayBuffer && this.callbacks.onFrame) {
        try {
          const blob = new Blob([ev.data], { type: "image/jpeg" });
          const bmp = await createImageBitmap(blob);
          this.callbacks.onFrame(bmp);
        } catch (e) {
          this.callbacks.onError(e instanceof Error ? e : new Error(String(e)));
        }
      }
    };
  }

  async startAsController(): Promise<void> {
    this.controlDc = this.pc.createDataChannel("control", { ordered: true });
    this.frameDc = this.pc.createDataChannel("frames", { ordered: false, maxRetransmits: 0 });
    this.bindDataChannel(this.controlDc);
    this.bindDataChannel(this.frameDc);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.callbacks.onLocalDescription("offer", offer.sdp ?? "");
  }

  async startAsHost(): Promise<void> {
    // Prefer native capture for unattended-ready path; fall back to display media.
    try {
      await this.startNativeCapture();
    } catch {
      try {
        await this.startDisplayMedia();
      } catch (e) {
        this.callbacks.onError(
          e instanceof Error
            ? e
            : new Error("Screen capture unavailable. Grant screen permission and retry."),
        );
      }
    }
  }

  private async startDisplayMedia(): Promise<void> {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 30, max: 60 },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    this.localStream = stream;
    for (const track of stream.getTracks()) {
      this.pc.addTrack(track, stream);
    }
    this.captureMode = "webrtc-track";
  }

  private async startNativeCapture(): Promise<void> {
    await invoke("capture_start", { monitorIndex: 0, maxFps: 20, quality: 55 });
    this.unlistenCapture = await listen<number[]>("capture://frame", (event) => {
      if (!this.frameDc || this.frameDc.readyState !== "open") return;
      const bytes = Uint8Array.from(event.payload);
      try {
        this.frameDc.send(bytes);
      } catch {
        /* channel congested */
      }
    });
    this.captureMode = "native-frames";
  }

  async acceptOffer(sdp: string): Promise<void> {
    await this.pc.setRemoteDescription({ type: "offer", sdp });
    if (this.role === "host") {
      await this.startAsHost();
    }
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.callbacks.onLocalDescription("answer", answer.sdp ?? "");
  }

  async acceptAnswer(sdp: string): Promise<void> {
    await this.pc.setRemoteDescription({ type: "answer", sdp });
  }

  async addIce(ice: IcePayload): Promise<void> {
    try {
      await this.pc.addIceCandidate({
        candidate: ice.candidate,
        sdpMid: ice.sdpMid ?? undefined,
        sdpMLineIndex: ice.sdpMLineIndex ?? undefined,
      });
    } catch (e) {
      this.callbacks.onError(e instanceof Error ? e : new Error(String(e)));
    }
  }

  sendControl(payload: unknown): void {
    if (!this.controlDc || this.controlDc.readyState !== "open") return;
    this.controlDc.send(JSON.stringify(payload));
  }

  getCaptureMode(): string {
    return this.captureMode;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.controlDc?.close();
    this.frameDc?.close();
    this.pc.close();
    if (this.unlistenCapture) {
      this.unlistenCapture();
      this.unlistenCapture = null;
    }
    if (this.captureMode === "native-frames") {
      try {
        await invoke("capture_stop");
      } catch {
        /* ignore */
      }
    }
  }
}
