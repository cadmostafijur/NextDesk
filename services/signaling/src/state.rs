use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use nexdesk_protocol::{DeviceId, DevicePresence, PermissionSet};
use parking_lot::RwLock;
use tokio::sync::mpsc;
use tracing::{info, warn};
use uuid::Uuid;

use crate::config::Config;
use crate::session::{PendingConnect, SessionRecord, SessionStatus};

pub type WsSender = mpsc::UnboundedSender<String>;

#[derive(Debug, Clone)]
pub struct ConnectedDevice {
    /// Identifies the WebSocket this entry belongs to, so a stale socket that
    /// closes after the device reconnected does not evict the newer one.
    pub conn_id: Uuid,
    pub device_id: DeviceId,
    pub device_name: String,
    pub presence: DevicePresence,
    pub auth_subject: String,
    pub connected_at: DateTime<Utc>,
    pub last_heartbeat: DateTime<Utc>,
    pub sender: WsSender,
}

#[derive(Debug, Clone)]
pub struct DeviceRecord {
    pub device_id: DeviceId,
    pub device_name: String,
    pub public_key_hint: String,
    pub owner_user_id: Option<Uuid>,
    pub revoked: bool,
    pub created_at: DateTime<Utc>,
    /// Argon2 hash of device auth secret (unattended / registration).
    pub secret_hash: String,
}

pub struct AppState {
    pub cfg: Config,
    pub devices: DashMap<String, DeviceRecord>,
    pub online: DashMap<String, ConnectedDevice>,
    pub sessions: DashMap<Uuid, SessionRecord>,
    pub pending: DashMap<Uuid, PendingConnect>,
    pub users: DashMap<String, UserRecord>,
    pub connect_rate: DashMap<String, Vec<DateTime<Utc>>>,
    messages: AtomicU64,
    /// In-memory audit ring (Postgres used when DATABASE_URL set).
    pub audit: RwLock<Vec<AuditEvent>>,
}

#[derive(Debug, Clone)]
pub struct UserRecord {
    pub id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AuditEvent {
    pub at: DateTime<Utc>,
    pub kind: String,
    pub actor: String,
    pub detail: String,
}

impl AppState {
    pub async fn new(cfg: Config) -> anyhow::Result<Self> {
        if cfg.database_url.is_some() {
            info!("DATABASE_URL set — SQL persistence will be used in future iterations; MVP uses in-memory + optional SQL migrate hook");
        }
        Ok(Self {
            cfg,
            devices: DashMap::new(),
            online: DashMap::new(),
            sessions: DashMap::new(),
            pending: DashMap::new(),
            users: DashMap::new(),
            connect_rate: DashMap::new(),
            messages: AtomicU64::new(0),
            audit: RwLock::new(Vec::new()),
        })
    }

    pub fn bump_messages(&self) {
        self.messages.fetch_add(1, Ordering::Relaxed);
    }

    pub fn messages_total(&self) -> u64 {
        self.messages.load(Ordering::Relaxed)
    }

    pub fn online_count(&self) -> usize {
        self.online.len()
    }

    pub fn session_count(&self) -> usize {
        self.sessions.len()
    }

    pub fn audit(&self, kind: &str, actor: &str, detail: &str) {
        let mut g = self.audit.write();
        g.push(AuditEvent {
            at: Utc::now(),
            kind: kind.into(),
            actor: actor.into(),
            detail: detail.into(),
        });
        if g.len() > 5000 {
            let drain = g.len() - 4000;
            g.drain(0..drain);
        }
    }

    pub fn send_to(&self, device_id: &str, json: String) -> bool {
        if let Some(dev) = self.online.get(device_id) {
            return dev.sender.send(json).is_ok();
        }
        false
    }

    pub fn set_presence(&self, device_id: &str, presence: DevicePresence) {
        if let Some(mut d) = self.online.get_mut(device_id) {
            d.presence = presence;
        }
    }

    pub async fn cleanup_loop(self: Arc<Self>) {
        let mut tick = tokio::time::interval(Duration::from_secs(10));
        loop {
            tick.tick().await;
            let now = Utc::now();
            let hb_timeout = chrono::Duration::seconds(self.cfg.heartbeat_timeout_secs as i64);
            let mut stale = Vec::new();
            for entry in self.online.iter() {
                if now - entry.last_heartbeat > hb_timeout {
                    stale.push(entry.device_id.0.clone());
                }
            }
            for id in stale {
                warn!(device = %id, "removing stale device connection");
                self.disconnect_device(&id, "heartbeat_timeout");
            }

            let sess_timeout = chrono::Duration::seconds(self.cfg.session_timeout_secs as i64);
            let mut expired_pending = Vec::new();
            for entry in self.pending.iter() {
                if now - entry.created_at > sess_timeout {
                    expired_pending.push(*entry.key());
                }
            }
            for sid in expired_pending {
                if let Some((_, p)) = self.pending.remove(&sid) {
                    self.audit("session_expired", &p.from.0, &sid.to_string());
                    let msg = nexdesk_protocol::Envelope::new(
                        nexdesk_protocol::SignalMessage::Error {
                            code: nexdesk_protocol::ErrorCode::SessionExpired,
                            message: "connection request expired".into(),
                            related_id: Some(sid),
                        },
                    );
                    if let Ok(j) = msg.to_json() {
                        self.send_to(&p.from.0, j.clone());
                        self.send_to(&p.to.0, j);
                    }
                }
            }

            let mut end_sessions = Vec::new();
            for entry in self.sessions.iter() {
                if entry.status == SessionStatus::Ending {
                    end_sessions.push(*entry.key());
                }
            }
            for sid in end_sessions {
                self.sessions.remove(&sid);
            }
        }
    }

    /// Disconnect only if `device_id` is still served by socket `conn_id`.
    pub fn disconnect_connection(&self, device_id: &str, conn_id: Uuid, reason: &str) {
        let current = self.online.get(device_id).map(|d| d.conn_id);
        if current == Some(conn_id) {
            self.disconnect_device(device_id, reason);
        }
    }

    pub fn disconnect_device(&self, device_id: &str, reason: &str) {
        self.online.remove(device_id);
        self.audit("device_disconnect", device_id, reason);

        // End related pending / active sessions
        let pending_ids: Vec<Uuid> = self
            .pending
            .iter()
            .filter(|e| e.from.0 == device_id || e.to.0 == device_id)
            .map(|e| *e.key())
            .collect();
        for sid in pending_ids {
            self.pending.remove(&sid);
        }

        let session_ids: Vec<(Uuid, String, String)> = self
            .sessions
            .iter()
            .filter(|e| e.controller.0 == device_id || e.host.0 == device_id)
            .map(|e| (*e.key(), e.controller.0.clone(), e.host.0.clone()))
            .collect();

        for (sid, a, b) in session_ids {
            if let Some(mut s) = self.sessions.get_mut(&sid) {
                s.status = SessionStatus::Ending;
            }
            let end = nexdesk_protocol::Envelope::new(nexdesk_protocol::SignalMessage::SessionEnd {
                session_id: sid,
                reason: reason.into(),
            });
            if let Ok(j) = end.to_json() {
                if a != device_id {
                    self.send_to(&a, j.clone());
                }
                if b != device_id {
                    self.send_to(&b, j);
                }
            }
            self.sessions.remove(&sid);
        }
    }

    pub fn begin_session(
        &self,
        session_id: Uuid,
        controller: DeviceId,
        host: DeviceId,
        granted: PermissionSet,
    ) {
        self.sessions.insert(
            session_id,
            SessionRecord {
                id: session_id,
                controller,
                host,
                granted,
                status: SessionStatus::Active,
                created_at: Utc::now(),
            },
        );
        self.set_presence(
            &self
                .sessions
                .get(&session_id)
                .map(|s| s.host.0.clone())
                .unwrap_or_default(),
            DevicePresence::Busy,
        );
    }
}
