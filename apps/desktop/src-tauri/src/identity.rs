use anyhow::{anyhow, Result};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::db::LocalDb;

const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Identity {
    pub device_id: String,
    pub device_name: String,
    pub device_secret: String,
    pub device_token: String,
    pub onboarded: bool,
    pub signaling_url: String,
    pub theme: String,
}

pub fn generate_device_id() -> String {
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

pub fn generate_secret() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    hex::encode(bytes)
}

pub fn load_or_init(db: &LocalDb) -> Result<Identity> {
    let device_id = match db.get_meta("device_id")? {
        Some(id) => id,
        None => {
            let id = generate_device_id();
            db.set_meta("device_id", &id)?;
            id
        }
    };
    let device_secret = match db.get_meta("device_secret")? {
        Some(s) => s,
        None => {
            let s = generate_secret();
            db.set_meta("device_secret", &s)?;
            let _ = store_secret_keyring(&device_id, &s);
            s
        }
    };
    let device_name = db
        .get_meta("device_name")?
        .unwrap_or_else(|| "My Computer".into());
    let device_token = db.get_meta("device_token")?.unwrap_or_default();
    let onboarded = db
        .get_meta("onboarded")?
        .map(|v| v == "1")
        .unwrap_or(false);
    let signaling_url = db
        .get_meta("signaling_url")?
        .unwrap_or_else(|| "ws://127.0.0.1:7800/ws".into());
    let theme = db.get_meta("theme")?.unwrap_or_else(|| "light".into());

    Ok(Identity {
        device_id,
        device_name,
        device_secret,
        device_token,
        onboarded,
        signaling_url,
        theme,
    })
}

pub fn update_settings(
    db: &LocalDb,
    theme: &str,
    signaling_url: &str,
    device_name: &str,
) -> Result<()> {
    if device_name.trim().is_empty() {
        return Err(anyhow!("device name required"));
    }
    db.set_meta("theme", theme)?;
    db.set_meta("signaling_url", signaling_url)?;
    db.set_meta("device_name", device_name.trim())?;
    Ok(())
}

fn store_secret_keyring(device_id: &str, secret: &str) -> Result<()> {
    let entry = keyring::Entry::new("nexdesk", device_id)?;
    entry.set_password(secret)?;
    Ok(())
}

#[allow(dead_code)]
pub fn secret_fingerprint(secret: &str) -> String {
    let mut h = Sha256::new();
    h.update(secret.as_bytes());
    hex::encode(&h.finalize()[..8])
}
