//! Standalone REST API process.
//!
//! In the MVP, authentication and device registration are served by
//! `nexdesk-signaling` on the same port. This binary exposes health and
//! forwards documentation for a split deployment.

use axum::routing::get;
use axum::{Json, Router};
use tower_http::cors::{Any, CorsLayer};
use tracing::info;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .init();

    let bind = std::env::var("NEXDESK_API_BIND").unwrap_or_else(|_| "0.0.0.0:7801".into());

    let app = Router::new()
        .route("/health", get(|| async { Json(serde_json::json!({"status":"ok","service":"nexdesk-api"})) }))
        .route(
            "/v1/info",
            get(|| async {
                Json(serde_json::json!({
                    "name": "NexDesk API",
                    "note": "Auth/device routes are available on the signaling service in MVP. Split deployment: point clients at this service once migrated.",
                    "signaling_hint": "http://127.0.0.1:7800"
                }))
            }),
        )
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any));

    info!(%bind, "NexDesk API listening");
    let listener = tokio::net::TcpListener::bind(&bind).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
