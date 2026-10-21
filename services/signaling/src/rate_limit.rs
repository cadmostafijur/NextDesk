use chrono::{Duration, Utc};

use crate::state::AppState;

/// Returns true if the action is allowed under the per-device connect quota.
pub fn allow_connect(state: &AppState, device_id: &str) -> bool {
    let now = Utc::now();
    let window = Duration::minutes(1);
    let mut entry = state.connect_rate.entry(device_id.to_string()).or_default();
    entry.retain(|t| now - *t < window);
    if entry.len() as u32 >= state.cfg.max_connect_per_minute {
        return false;
    }
    entry.push(now);
    true
}
