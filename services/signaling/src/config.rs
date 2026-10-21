use anyhow::{bail, Context, Result};

#[derive(Debug, Clone)]
pub struct Config {
    pub bind_addr: String,
    pub jwt_secret: String,
    pub database_url: Option<String>,
    pub redis_url: Option<String>,
    pub turn_shared_secret: String,
    pub turn_urls: Vec<String>,
    pub turn_ttl_seconds: u64,
    pub heartbeat_timeout_secs: u64,
    pub session_timeout_secs: u64,
    pub max_connect_per_minute: u32,
    pub allow_dev_tokens: bool,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let jwt_secret = std::env::var("NEXDESK_JWT_SECRET")
            .unwrap_or_else(|_| "dev-only-change-me-nexdesk-jwt-secret-32b".into());
        if jwt_secret.len() < 32 {
            bail!("NEXDESK_JWT_SECRET must be at least 32 characters");
        }

        let turn_urls = std::env::var("NEXDESK_TURN_URLS")
            .unwrap_or_else(|_| "stun:stun.l.google.com:19302".into())
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        Ok(Self {
            bind_addr: std::env::var("NEXDESK_BIND")
                .unwrap_or_else(|_| "0.0.0.0:7800".into()),
            jwt_secret,
            database_url: std::env::var("DATABASE_URL").ok(),
            redis_url: std::env::var("REDIS_URL").ok(),
            turn_shared_secret: std::env::var("NEXDESK_TURN_SECRET")
                .unwrap_or_else(|_| "dev-only-turn-secret-change-me".into()),
            turn_urls,
            turn_ttl_seconds: std::env::var("NEXDESK_TURN_TTL")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3600),
            heartbeat_timeout_secs: 45,
            session_timeout_secs: 120,
            max_connect_per_minute: std::env::var("NEXDESK_MAX_CONNECT_PER_MIN")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(20),
            allow_dev_tokens: std::env::var("NEXDESK_ALLOW_DEV_TOKENS")
                .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
                .unwrap_or(true),
        }
        .validated()?)
    }

    fn validated(self) -> Result<Self> {
        if self.turn_shared_secret.len() < 16 {
            bail!("NEXDESK_TURN_SECRET must be at least 16 characters");
        }
        Ok(self)
    }
}

#[allow(dead_code)]
pub fn require_var(name: &str) -> Result<String> {
    std::env::var(name).with_context(|| format!("missing env {name}"))
}
