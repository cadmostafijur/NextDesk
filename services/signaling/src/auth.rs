use std::sync::Arc;

use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use axum::extract::State;
use axum::http::StatusCode;
use axum::{Json, Router};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use nexdesk_protocol::DeviceId;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::state::{AppState, DeviceRecord, UserRecord};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub device_id: Option<String>,
    pub exp: i64,
    pub iat: i64,
    pub kind: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub user_id: Uuid,
    pub email: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisterDeviceRequest {
    pub device_name: String,
    pub device_secret: String,
    /// Optional account token; omit for account-free local registration.
    pub access_token: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RegisterDeviceResponse {
    pub device_id: String,
    pub device_token: String,
}

#[derive(Debug, Deserialize)]
pub struct RevokeDeviceRequest {
    pub access_token: String,
}

fn hash_password(password: &str) -> Result<String, StatusCode> {
    let salt = SaltString::generate(&mut rand::thread_rng());
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn verify_password(password: &str, hash: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

pub fn issue_token(state: &AppState, sub: &str, device_id: Option<&str>, kind: &str) -> Result<String, StatusCode> {
    let now = Utc::now();
    let claims = Claims {
        sub: sub.into(),
        device_id: device_id.map(|s| s.into()),
        iat: now.timestamp(),
        exp: (now + Duration::hours(12)).timestamp(),
        kind: kind.into(),
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.cfg.jwt_secret.as_bytes()),
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub fn verify_token(state: &AppState, token: &str) -> Result<Claims, StatusCode> {
    // Dev convenience: devices may authenticate with "dev:<device_id>:<secret>"
    if state.cfg.allow_dev_tokens {
        if let Some(rest) = token.strip_prefix("dev:") {
            let mut parts = rest.splitn(2, ':');
            if let (Some(device_id), Some(_secret)) = (parts.next(), parts.next()) {
                return Ok(Claims {
                    sub: format!("dev:{device_id}"),
                    device_id: Some(device_id.into()),
                    iat: Utc::now().timestamp(),
                    exp: (Utc::now() + Duration::hours(12)).timestamp(),
                    kind: "device".into(),
                });
            }
        }
    }

    decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.cfg.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map(|d| d.claims)
    .map_err(|_| StatusCode::UNAUTHORIZED)
}

pub async fn register(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, StatusCode> {
    let email = body.email.trim().to_lowercase();
    if email.is_empty() || body.password.len() < 10 {
        return Err(StatusCode::BAD_REQUEST);
    }
    if state.users.contains_key(&email) {
        return Err(StatusCode::CONFLICT);
    }
    let id = Uuid::new_v4();
    let password_hash = hash_password(&body.password)?;
    state.users.insert(
        email.clone(),
        UserRecord {
            id,
            email: email.clone(),
            password_hash,
            created_at: Utc::now(),
        },
    );
    let access_token = issue_token(&state, &id.to_string(), None, "user")?;
    state.audit("user_register", &email, &id.to_string());
    Ok(Json(AuthResponse {
        access_token,
        user_id: id,
        email,
    }))
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, StatusCode> {
    let email = body.email.trim().to_lowercase();
    let Some(user) = state.users.get(&email) else {
        return Err(StatusCode::UNAUTHORIZED);
    };
    if !verify_password(&body.password, &user.password_hash) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let access_token = issue_token(&state, &user.id.to_string(), None, "user")?;
    state.audit("user_login", &email, &user.id.to_string());
    Ok(Json(AuthResponse {
        access_token,
        user_id: user.id,
        email,
    }))
}

/// Generate NXD-XXXX-XXXX-XXXX style ID (not a secret).
pub fn generate_device_id() -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    let mut parts = Vec::new();
    for _ in 0..3 {
        let mut chunk = String::new();
        for _ in 0..4 {
            chunk.push(ALPHABET[rng.gen_range(0..ALPHABET.len())] as char);
        }
        parts.push(chunk);
    }
    format!("NXD-{}", parts.join("-"))
}

pub async fn register_device(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RegisterDeviceRequest>,
) -> Result<Json<RegisterDeviceResponse>, StatusCode> {
    if body.device_name.trim().is_empty() || body.device_secret.len() < 16 {
        return Err(StatusCode::BAD_REQUEST);
    }

    let owner = if let Some(tok) = &body.access_token {
        let claims = verify_token(&state, tok)?;
        Some(Uuid::parse_str(&claims.sub).map_err(|_| StatusCode::UNAUTHORIZED)?)
    } else {
        None
    };

    // Collision-safe allocation
    let mut device_id = generate_device_id();
    for _ in 0..8 {
        if !state.devices.contains_key(&device_id) {
            break;
        }
        device_id = generate_device_id();
    }
    if state.devices.contains_key(&device_id) {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    let secret_hash = hash_password(&body.device_secret)?;
    let mut hasher = Sha256::new();
    hasher.update(body.device_secret.as_bytes());
    let public_key_hint = hex::encode(&hasher.finalize()[..8]);

    state.devices.insert(
        device_id.clone(),
        DeviceRecord {
            device_id: DeviceId(device_id.clone()),
            device_name: body.device_name.trim().to_string(),
            public_key_hint,
            owner_user_id: owner,
            revoked: false,
            created_at: Utc::now(),
            secret_hash,
        },
    );

    let device_token = issue_token(&state, &format!("device:{device_id}"), Some(&device_id), "device")?;
    state.audit("device_register", &device_id, &body.device_name);
    Ok(Json(RegisterDeviceResponse {
        device_id,
        device_token,
    }))
}

pub async fn revoke_device(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(body): Json<RevokeDeviceRequest>,
) -> Result<StatusCode, StatusCode> {
    let claims = verify_token(&state, &body.access_token)?;
    let Some(mut rec) = state.devices.get_mut(&id) else {
        return Err(StatusCode::NOT_FOUND);
    };
    // Owner or the device itself may revoke
    let allowed = claims.device_id.as_deref() == Some(id.as_str())
        || rec
            .owner_user_id
            .map(|u| u.to_string() == claims.sub)
            .unwrap_or(false);
    if !allowed {
        return Err(StatusCode::FORBIDDEN);
    }
    rec.revoked = true;
    drop(rec);
    state.disconnect_device(&id, "revoked");
    state.audit("device_revoke", &claims.sub, &id);
    Ok(StatusCode::NO_CONTENT)
}

/// Authenticate a device WebSocket hello token against registered secret or JWT.
pub fn authenticate_device_hello(
    state: &AppState,
    device_id: &str,
    auth_token: &str,
) -> Result<String, &'static str> {
    if let Some(rec) = state.devices.get(device_id) {
        if rec.revoked {
            return Err("device revoked");
        }
        if verify_password(auth_token, &rec.secret_hash) {
            return Ok(format!("device:{device_id}"));
        }
    }

    match verify_token(state, auth_token) {
        Ok(claims) => {
            if let Some(did) = &claims.device_id {
                if did != device_id {
                    return Err("token device mismatch");
                }
            }
            // Allow first-seen local devices in dev when token binds to device
            if state.cfg.allow_dev_tokens && !state.devices.contains_key(device_id) {
                let secret_hash = hash_password(auth_token).unwrap_or_default();
                state.devices.insert(
                    device_id.to_string(),
                    DeviceRecord {
                        device_id: DeviceId(device_id.to_string()),
                        device_name: "Unregistered".into(),
                        public_key_hint: String::new(),
                        owner_user_id: None,
                        revoked: false,
                        created_at: Utc::now(),
                        secret_hash,
                    },
                );
            }
            if let Some(rec) = state.devices.get(device_id) {
                if rec.revoked {
                    return Err("device revoked");
                }
            }
            Ok(claims.sub)
        }
        Err(_) => Err("unauthorized"),
    }
}

#[allow(dead_code)]
pub fn router() -> Router<Arc<AppState>> {
    Router::new()
}
