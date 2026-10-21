//! NexDesk wire protocol (signaling + session control).
//!
//! Versioned messages validated on both clients and the signaling server.
//! Device IDs identify endpoints; they are never authentication secrets.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

pub const PROTOCOL_VERSION: u16 = 1;

#[derive(Debug, Error)]
pub enum ProtocolError {
    #[error("unsupported protocol version: {0}")]
    UnsupportedVersion(u16),
    #[error("invalid message: {0}")]
    Invalid(String),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

/// Stable public device identifier (display form: NXD-XXXX-XXXX-XXXX).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct DeviceId(pub String);

impl DeviceId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DevicePresence {
    Online,
    Offline,
    Busy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionRole {
    Controller,
    Host,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionFlag {
    View,
    Control,
    Clipboard,
    FileTransfer,
    Audio,
    Chat,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PermissionSet {
    pub view: bool,
    pub control: bool,
    pub clipboard: bool,
    pub file_transfer: bool,
    pub audio: bool,
    pub chat: bool,
}

impl Default for PermissionSet {
    fn default() -> Self {
        Self {
            view: true,
            control: false,
            clipboard: false,
            file_transfer: false,
            audio: false,
            chat: true,
        }
    }
}

impl PermissionSet {
    pub fn view_only() -> Self {
        Self::default()
    }

    pub fn full_attended() -> Self {
        Self {
            view: true,
            control: true,
            clipboard: true,
            file_transfer: true,
            audio: false,
            chat: true,
        }
    }
}

/// Envelope for every WebSocket signaling message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Envelope {
    pub v: u16,
    pub id: Uuid,
    pub ts: DateTime<Utc>,
    #[serde(flatten)]
    pub body: SignalMessage,
}

impl Envelope {
    pub fn new(body: SignalMessage) -> Self {
        Self {
            v: PROTOCOL_VERSION,
            id: Uuid::new_v4(),
            ts: Utc::now(),
            body,
        }
    }

    pub fn validate(&self) -> Result<(), ProtocolError> {
        if self.v != PROTOCOL_VERSION {
            return Err(ProtocolError::UnsupportedVersion(self.v));
        }
        Ok(())
    }

    pub fn to_json(&self) -> Result<String, ProtocolError> {
        Ok(serde_json::to_string(self)?)
    }

    pub fn from_json(s: &str) -> Result<Self, ProtocolError> {
        let env: Self = serde_json::from_str(s)?;
        env.validate()?;
        Ok(env)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SignalMessage {
    Hello {
        device_id: DeviceId,
        device_name: String,
        auth_token: String,
        client_version: String,
    },
    HelloAck {
        device_id: DeviceId,
        server_time: DateTime<Utc>,
        turn: Option<TurnConfig>,
    },
    Heartbeat {
        seq: u64,
    },
    HeartbeatAck {
        seq: u64,
    },
    PresenceUpdate {
        device_id: DeviceId,
        presence: DevicePresence,
    },
    LookupDevice {
        target_id: DeviceId,
    },
    LookupDeviceResult {
        target_id: DeviceId,
        found: bool,
        presence: Option<DevicePresence>,
        display_name: Option<String>,
    },
    ConnectRequest {
        session_id: Uuid,
        to: DeviceId,
        from_name: String,
        requested: PermissionSet,
        message: Option<String>,
    },
    ConnectIncoming {
        session_id: Uuid,
        from: DeviceId,
        from_name: String,
        requested: PermissionSet,
        message: Option<String>,
    },
    ConnectAccept {
        session_id: Uuid,
        granted: PermissionSet,
    },
    ConnectReject {
        session_id: Uuid,
        reason: String,
    },
    ConnectCancel {
        session_id: Uuid,
    },
    SessionReady {
        session_id: Uuid,
        role: SessionRole,
        peer: DeviceId,
        granted: PermissionSet,
    },
    SdpOffer {
        session_id: Uuid,
        sdp: String,
    },
    SdpAnswer {
        session_id: Uuid,
        sdp: String,
    },
    IceCandidate {
        session_id: Uuid,
        candidate: String,
        sdp_mid: Option<String>,
        sdp_mline_index: Option<u16>,
    },
    SessionEnd {
        session_id: Uuid,
        reason: String,
    },
    Error {
        code: ErrorCode,
        message: String,
        related_id: Option<Uuid>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    Unauthorized,
    Forbidden,
    NotFound,
    Offline,
    RateLimited,
    InvalidMessage,
    SessionExpired,
    Conflict,
    Internal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnConfig {
    pub urls: Vec<String>,
    pub username: String,
    pub credential: String,
    pub ttl_seconds: u64,
}

/// Reliable data-channel application messages (not signaling).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DataChannelMessage {
    InputEvent {
        event: InputEvent,
    },
    Chat {
        text: String,
        sent_at: DateTime<Utc>,
    },
    Clipboard {
        mime: String,
        /// UTF-8 text only in MVP; binary clipboard is future work.
        text: String,
    },
    FileOffer {
        transfer_id: Uuid,
        name: String,
        size: u64,
        sha256: String,
    },
    FileAccept {
        transfer_id: Uuid,
    },
    FileReject {
        transfer_id: Uuid,
        reason: String,
    },
    FileChunk {
        transfer_id: Uuid,
        offset: u64,
        /// Base64 payload
        data: String,
    },
    FileComplete {
        transfer_id: Uuid,
        sha256: String,
    },
    FileCancel {
        transfer_id: Uuid,
    },
    Stats {
        fps: f32,
        bitrate_kbps: f32,
        rtt_ms: f32,
    },
    FrameMeta {
        width: u32,
        height: u32,
        monitor_index: u32,
        encode_ms: f32,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum InputEvent {
    MouseMove {
        x: f64,
        y: f64,
        /// Normalized 0..1 relative to remote framebuffer
        nx: f64,
        ny: f64,
    },
    MouseButton {
        button: MouseButton,
        pressed: bool,
        nx: f64,
        ny: f64,
    },
    MouseWheel {
        dx: f64,
        dy: f64,
        nx: f64,
        ny: f64,
    },
    Key {
        key: String,
        code: String,
        pressed: bool,
        modifiers: KeyModifiers,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct KeyModifiers {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub meta: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_hello() {
        let env = Envelope::new(SignalMessage::Hello {
            device_id: DeviceId("NXD-1234-5678-9ABC".into()),
            device_name: "Test PC".into(),
            auth_token: "tok".into(),
            client_version: "0.1.0".into(),
        });
        let json = env.to_json().unwrap();
        let parsed = Envelope::from_json(&json).unwrap();
        assert_eq!(parsed.v, PROTOCOL_VERSION);
    }

    #[test]
    fn rejects_bad_version() {
        let mut env = Envelope::new(SignalMessage::Heartbeat { seq: 1 });
        env.v = 99;
        let json = serde_json::to_string(&env).unwrap();
        let err = Envelope::from_json(&json).unwrap_err();
        assert!(matches!(err, ProtocolError::UnsupportedVersion(99)));
    }
}
