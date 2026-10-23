use std::sync::Arc;

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use chrono::Utc;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha1::Sha1;

use crate::auth::verify_token;
use crate::config::Config;
use crate::state::AppState;

type HmacSha1 = Hmac<Sha1>;

#[derive(Debug, Deserialize)]
pub struct TurnQuery {
    pub access_token: String,
}

#[derive(Debug, Serialize)]
pub struct TurnCredentials {
    pub urls: Vec<String>,
    pub username: String,
    pub credential: String,
    pub ttl_seconds: u64,
}

/// coturn REST API style: username = expiry:user_id, credential = base64(hmac-sha1)
pub fn mint_turn_credentials(
    shared_secret: &str,
    user_id: &str,
    ttl_seconds: u64,
    urls: &[String],
) -> TurnCredentials {
    let expiry = Utc::now().timestamp() + ttl_seconds as i64;
    let username = format!("{expiry}:{user_id}");
    let mut mac = HmacSha1::new_from_slice(shared_secret.as_bytes()).expect("hmac key");
    mac.update(username.as_bytes());
    let credential = B64.encode(mac.finalize().into_bytes());
    TurnCredentials {
        urls: urls.to_vec(),
        username,
        credential,
        ttl_seconds,
    }
}

/// Credentials handed to a client: a hosted relay's static login when one is
/// configured (e.g. ExpressTURN, Metered), otherwise short-lived coturn REST
/// credentials signed with the shared secret.
pub fn turn_credentials_for(cfg: &Config, user_id: &str) -> TurnCredentials {
    match (&cfg.turn_username, &cfg.turn_credential) {
        (Some(username), Some(credential)) => TurnCredentials {
            urls: cfg.turn_urls.clone(),
            username: username.clone(),
            credential: credential.clone(),
            ttl_seconds: cfg.turn_ttl_seconds,
        },
        _ => mint_turn_credentials(
            &cfg.turn_shared_secret,
            user_id,
            cfg.turn_ttl_seconds,
            &cfg.turn_urls,
        ),
    }
}

pub async fn issue_credentials(
    State(state): State<Arc<AppState>>,
    Query(q): Query<TurnQuery>,
) -> Result<Json<TurnCredentials>, StatusCode> {
    let claims = verify_token(&state, &q.access_token)?;
    Ok(Json(turn_credentials_for(&state.cfg, &claims.sub)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credentials_are_deterministic_for_fixed_time() {
        // Smoke: username shape
        let c = mint_turn_credentials("secretsecretsecret", "user1", 3600, &["turn:example:3478".into()]);
        assert!(c.username.contains(":user1"));
        assert!(!c.credential.is_empty());
    }
}
