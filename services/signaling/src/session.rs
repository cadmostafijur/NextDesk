use chrono::{DateTime, Utc};
use nexdesk_protocol::{DeviceId, PermissionSet};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionStatus {
    Active,
    Ending,
}

#[derive(Debug, Clone)]
pub struct SessionRecord {
    pub id: Uuid,
    pub controller: DeviceId,
    pub host: DeviceId,
    pub granted: PermissionSet,
    pub status: SessionStatus,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct PendingConnect {
    pub session_id: Uuid,
    pub from: DeviceId,
    pub to: DeviceId,
    pub from_name: String,
    pub requested: PermissionSet,
    pub message: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl PendingConnect {
    pub fn participant(&self, device_id: &str) -> bool {
        self.from.0 == device_id || self.to.0 == device_id
    }
}
