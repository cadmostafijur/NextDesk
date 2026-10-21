mod auth;
mod config;
mod rate_limit;
mod session;
mod state;
mod turn;
mod ws;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::routing::{get, post};
use axum::{Json, Router};
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::{info, Level};
use tracing_subscriber::EnvFilter;

use crate::config::Config;
use crate::state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,nexdesk_signaling=debug")),
        )
        .with_target(true)
        .init();

    let cfg = Config::from_env()?;
    let state = Arc::new(AppState::new(cfg.clone()).await?);

    // Background cleanup of stale sockets / sessions
    {
        let st = Arc::clone(&state);
        tokio::spawn(async move {
            st.cleanup_loop().await;
        });
    }

    let app = Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
        .route("/metrics", get(metrics))
        .route("/v1/auth/register", post(auth::register))
        .route("/v1/auth/login", post(auth::login))
        .route("/v1/devices/register", post(auth::register_device))
        .route("/v1/devices/{id}/revoke", post(auth::revoke_device))
        .route("/v1/turn/credentials", get(turn::issue_credentials))
        .route("/ws", get(ws::ws_handler))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr: SocketAddr = cfg.bind_addr.parse()?;
    info!(%addr, "NexDesk signaling listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "service": "nexdesk-signaling",
        "protocol": nexdesk_protocol::PROTOCOL_VERSION,
    }))
}

async fn ready(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "ready": true,
        "online_devices": state.online_count(),
        "active_sessions": state.session_count(),
    }))
}

async fn metrics(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
) -> String {
    format!(
        "# HELP nexdesk_online_devices Currently connected devices\n\
         # TYPE nexdesk_online_devices gauge\n\
         nexdesk_online_devices {}\n\
         # HELP nexdesk_active_sessions Active remote sessions\n\
         # TYPE nexdesk_active_sessions gauge\n\
         nexdesk_active_sessions {}\n\
         # HELP nexdesk_ws_messages_total Signaling messages processed\n\
         # TYPE nexdesk_ws_messages_total counter\n\
         nexdesk_ws_messages_total {}\n",
        state.online_count(),
        state.session_count(),
        state.messages_total(),
    )
}

// silence unused Level import warning in some toolchains
#[allow(dead_code)]
fn _level() -> Level {
    Level::INFO
}
