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

// Native frames are JPEGs, often larger than the ~256 KB SCTP message limit, so
// each frame is split into chunks: [u32 frameId][u16 index][u16 count][bytes].
const FRAME_HEADER = 8;
const FRAME_CHUNK = 16 * 1024 - FRAME_HEADER;
// Skip capture frames while this much is still queued, so latency stays low.
const FRAME_BACKLOG_LIMIT = 1024 * 1024;

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
  private pendingIce: IcePayload[] = [];
  private nextFrameId = 0;
  private rxFrameId = -1;
  private rxChunks: Uint8Array[] = [];
  private decoding = false;

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
    dc.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        this.callbacks.onDataMessage(ev.data);
        return;
      }
      if (ev.data instanceof ArrayBuffer) this.receiveFrameChunk(ev.data);
    };
  }

  private receiveFrameChunk(buf: ArrayBuffer): void {
    if (!this.callbacks.onFrame || buf.byteLength < FRAME_HEADER) return;
    const view = new DataView(buf);
    const frameId = view.getUint32(0);
    const index = view.getUint16(4);
    const count = view.getUint16(6);
    if (index === 0) {
      this.rxFrameId = frameId;
      this.rxChunks = [];
    }
    if (frameId !== this.rxFrameId || index !== this.rxChunks.length) return;
    this.rxChunks.push(new Uint8Array(buf, FRAME_HEADER));
    if (this.rxChunks.length !== count) return;

    const parts = this.rxChunks;
    this.rxChunks = [];
    // Drop frames that arrive while the previous one is still decoding.
    if (this.decoding) return;
    this.decoding = true;
    createImageBitmap(new Blob(parts as BlobPart[], { type: "image/jpeg" }))
      .then((bmp) => this.callbacks.onFrame?.(bmp))
      .catch(() => undefined)
      .finally(() => {
        this.decoding = false;
      });
  }

  private sendFrame(jpeg: Uint8Array): void {
    const dc = this.frameDc;
    if (!dc || dc.readyState !== "open" || dc.bufferedAmount > FRAME_BACKLOG_LIMIT) return;
    const frameId = this.nextFrameId++ >>> 0;
    const count = Math.max(1, Math.ceil(jpeg.byteLength / FRAME_CHUNK));
    try {
      for (let i = 0; i < count; i++) {
        const body = jpeg.subarray(i * FRAME_CHUNK, (i + 1) * FRAME_CHUNK);
        const chunk = new Uint8Array(FRAME_HEADER + body.byteLength);
        const view = new DataView(chunk.buffer);
        view.setUint32(0, frameId);
        view.setUint16(4, i);
        view.setUint16(6, count);
        chunk.set(body, FRAME_HEADER);
        dc.send(chunk);
      }
    } catch {
      /* channel closing */
    }
  }

  private async flushPendingIce(): Promise<void> {
    const queued = this.pendingIce;
    this.pendingIce = [];
    for (const ice of queued) await this.addIce(ice);
  }

  async startAsController(): Promise<void> {
    this.controlDc = this.pc.createDataChannel("control", { ordered: true });
    // Reliable and ordered so a frame's chunks arrive complete and in sequence;
    // the sender skips frames instead when the channel backs up.
    this.frameDc = this.pc.createDataChannel("frames", { ordered: true });
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
    this.unlistenCapture = await listen<string>("capture://frame", (event) => {
      const bin = atob(event.payload);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      this.sendFrame(bytes);
    });
    await invoke("capture_start", { monitorIndex: 0, maxFps: 20, quality: 60 });
    this.captureMode = "native-frames";
  }

  async acceptOffer(sdp: string): Promise<void> {
    await this.pc.setRemoteDescription({ type: "offer", sdp });
    await this.flushPendingIce();
    if (this.role === "host") {
      await this.startAsHost();
    }
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.callbacks.onLocalDescription("answer", answer.sdp ?? "");
  }

  async acceptAnswer(sdp: string): Promise<void> {
    await this.pc.setRemoteDescription({ type: "answer", sdp });
    await this.flushPendingIce();
  }

  async addIce(ice: IcePayload): Promise<void> {
    // Candidates can arrive before the description they belong to is applied.
    if (!this.pc.remoteDescription) {
      this.pendingIce.push(ice);
      return;
    }
    try {
      await this.pc.addIceCandidate({
        candidate: ice.candidate,
        sdpMid: ice.sdpMid ?? undefined,
        sdpMLineIndex: ice.sdpMLineIndex ?? undefined,
      });
    } catch (e) {
      // One unusable candidate is normal; others usually still connect.
      console.warn("ICE candidate rejected", e);
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
