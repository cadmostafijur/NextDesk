import { envelope, type Envelope, type SignalMessage, type TurnConfig } from "./protocol";

export type SignalHandler = (msg: SignalMessage & { id?: string }) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers = new Set<SignalHandler>();
  private heartbeatTimer: number | null = null;
  private seq = 0;
  private intentionalClose = false;
  private reconnectAttempt = 0;
  private helloPayload: Extract<SignalMessage, { type: "hello" }> | null = null;
  public turn: TurnConfig | null = null;
  public connected = false;

  constructor(url: string) {
    this.url = url;
  }

  onMessage(handler: SignalHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async connect(hello: Extract<SignalMessage, { type: "hello" }>): Promise<void> {
    this.helloPayload = hello;
    this.intentionalClose = false;
    await this.openSocket();
  }

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;

      ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempt = 0;
        if (this.helloPayload) {
          this.send(this.helloPayload);
        }
        this.startHeartbeat();
        resolve();
      };

      ws.onerror = () => {
        if (!this.connected) reject(new Error("Failed to connect to signaling server"));
      };

      ws.onclose = () => {
        this.connected = false;
        this.stopHeartbeat();
        if (!this.intentionalClose) {
          const delay = Math.min(10_000, 500 * 2 ** this.reconnectAttempt++);
          window.setTimeout(() => {
            if (this.helloPayload && !this.intentionalClose) {
              void this.openSocket().catch(() => undefined);
            }
          }, delay);
        }
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(String(ev.data)) as Envelope;
          const { v: _v, id: _id, ts: _ts, ...rest } = data;
          const msg = rest as unknown as SignalMessage;
          if (msg.type === "hello_ack" && msg.turn) {
            this.turn = msg.turn;
          }
          for (const h of this.handlers) h(msg);
        } catch {
          // ignore malformed
        }
      };
    });
  }

  send(body: SignalMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(envelope(body)));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      this.send({ type: "heartbeat", seq: ++this.seq });
    }, 15_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer != null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  close(): void {
    this.intentionalClose = true;
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }
}
