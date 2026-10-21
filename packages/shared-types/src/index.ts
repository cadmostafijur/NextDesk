/** Shared TypeScript protocol mirrors for NexDesk (v1). */

export const PROTOCOL_VERSION = 1;

export type DevicePresence = "online" | "offline" | "busy";
export type SessionRole = "controller" | "host";

export interface PermissionSet {
  view: boolean;
  control: boolean;
  clipboard: boolean;
  file_transfer: boolean;
  audio: boolean;
  chat: boolean;
}

export const VIEW_ONLY: PermissionSet = {
  view: true,
  control: false,
  clipboard: false,
  file_transfer: false,
  audio: false,
  chat: true,
};

export const FULL_ATTENDED: PermissionSet = {
  view: true,
  control: true,
  clipboard: true,
  file_transfer: true,
  audio: false,
  chat: true,
};

export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "offline"
  | "rate_limited"
  | "invalid_message"
  | "session_expired"
  | "conflict"
  | "internal";

export interface TurnConfig {
  urls: string[];
  username: string;
  credential: string;
  ttl_seconds: number;
}

export type SignalMessage =
  | { type: "hello"; device_id: string; device_name: string; auth_token: string; client_version: string }
  | { type: "hello_ack"; device_id: string; server_time: string; turn?: TurnConfig | null }
  | { type: "heartbeat"; seq: number }
  | { type: "heartbeat_ack"; seq: number }
  | { type: "presence_update"; device_id: string; presence: DevicePresence }
  | { type: "lookup_device"; target_id: string }
  | {
      type: "lookup_device_result";
      target_id: string;
      found: boolean;
      presence?: DevicePresence | null;
      display_name?: string | null;
    }
  | {
      type: "connect_request";
      session_id: string;
      to: string;
      from_name: string;
      requested: PermissionSet;
      message?: string | null;
    }
  | {
      type: "connect_incoming";
      session_id: string;
      from: string;
      from_name: string;
      requested: PermissionSet;
      message?: string | null;
    }
  | { type: "connect_accept"; session_id: string; granted: PermissionSet }
  | { type: "connect_reject"; session_id: string; reason: string }
  | { type: "connect_cancel"; session_id: string }
  | {
      type: "session_ready";
      session_id: string;
      role: SessionRole;
      peer: string;
      granted: PermissionSet;
    }
  | { type: "sdp_offer"; session_id: string; sdp: string }
  | { type: "sdp_answer"; session_id: string; sdp: string }
  | {
      type: "ice_candidate";
      session_id: string;
      candidate: string;
      sdp_mid?: string | null;
      sdp_mline_index?: number | null;
    }
  | { type: "session_end"; session_id: string; reason: string }
  | { type: "error"; code: ErrorCode; message: string; related_id?: string | null };

export interface Envelope {
  v: number;
  id: string;
  ts: string;
  type: string;
  [key: string]: unknown;
}

export function envelope(body: SignalMessage): Envelope {
  return {
    v: PROTOCOL_VERSION,
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    ...body,
  };
}
