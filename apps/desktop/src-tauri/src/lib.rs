mod capture;
mod db;
mod identity;
mod input;

use std::path::PathBuf;
use std::sync::Arc;

use argon2::password_hash::{PasswordHasher, SaltString};
use argon2::Argon2;
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{Manager, State};

use crate::capture::{list_monitors, CaptureState, MonitorInfo};
use crate::db::LocalDb;
use crate::identity::Identity;
use crate::input::{FrontInputEvent, InputInjector};

pub struct AppCtx {
    pub db: Mutex<LocalDb>,
    pub capture: Arc<CaptureState>,
    pub input: InputInjector,
}

fn data_dir() -> PathBuf {
    if let Ok(custom) = std::env::var("NEXDESK_DATA_DIR") {
        return PathBuf::from(custom);
    }
    dirs_next_path()
}

fn dirs_next_path() -> PathBuf {
    // Prefer OS app data without extra crate: %APPDATA%/NexDesk on Windows
    #[cfg(windows)]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return PathBuf::from(appdata).join("NexDesk");
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home).join(".nexdesk");
        }
    }
    std::env::temp_dir().join("nexdesk")
}

#[tauri::command]
fn get_identity(ctx: State<'_, AppCtx>) -> Result<Identity, String> {
    let db = ctx.db.lock();
    identity::load_or_init(&db).map_err(|e| e.to_string())
}

#[tauri::command]
async fn complete_onboarding(
    ctx: State<'_, AppCtx>,
    device_name: String,
) -> Result<Identity, String> {
    let (identity, reg_body) = {
        let db = ctx.db.lock();
        db.set_meta("device_name", device_name.trim())
            .map_err(|e| e.to_string())?;
        db.set_meta("onboarded", "1").map_err(|e| e.to_string())?;
        let identity = identity::load_or_init(&db).map_err(|e| e.to_string())?;
        let body = serde_json::json!({
            "device_name": identity.device_name,
            "device_secret": identity.device_secret,
            "device_id": identity.device_id,
        });
        let base = identity
            .signaling_url
            .replacen("ws://", "http://", 1)
            .replacen("wss://", "https://", 1)
            .trim_end_matches("/ws")
            .to_string();
        (identity, (base, body))
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("{}/v1/devices/register", reg_body.0);
    if let Ok(resp) = client.post(url).json(&reg_body.1).send().await {
        if resp.status().is_success() {
            if let Ok(v) = resp.json::<serde_json::Value>().await {
                if let Some(token) = v.get("device_token").and_then(|t| t.as_str()) {
                    let db = ctx.db.lock();
                    let _ = db.set_meta("device_token", token);
                }
            }
        }
    }

    let db = ctx.db.lock();
    identity::load_or_init(&db).map_err(|e| e.to_string()).map(|mut id| {
        id.onboarded = true;
        // keep local fields if network failed
        let _ = identity;
        id
    })
}

#[tauri::command]
fn update_settings(
    ctx: State<'_, AppCtx>,
    theme: String,
    signaling_url: String,
    device_name: String,
) -> Result<(), String> {
    let db = ctx.db.lock();
    identity::update_settings(&db, &theme, &signaling_url, &device_name).map_err(|e| e.to_string())
}

#[tauri::command]
fn capture_start(
    app: tauri::AppHandle,
    ctx: State<'_, AppCtx>,
    monitor_index: usize,
    max_fps: u32,
    quality: u8,
) -> Result<(), String> {
    // Refresh framebuffer size for input mapping
    if let Ok(monitors) = list_monitors() {
        if let Some(m) = monitors.get(monitor_index) {
            ctx.input.set_framebuffer(m.width, m.height);
        }
    }
    ctx.capture
        .start(app, monitor_index, max_fps, quality)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn capture_stop(ctx: State<'_, AppCtx>) -> Result<(), String> {
    ctx.capture.stop();
    Ok(())
}

#[tauri::command]
fn list_displays() -> Result<Vec<MonitorInfo>, String> {
    list_monitors().map_err(|e| e.to_string())
}

#[tauri::command]
fn inject_input(ctx: State<'_, AppCtx>, event: FrontInputEvent) -> Result<(), String> {
    let ev = event.into_protocol();
    ctx.input.inject(&ev).map_err(|e| e.to_string())
}

#[tauri::command]
fn input_reset(ctx: State<'_, AppCtx>) -> Result<(), String> {
    ctx.input.reset().map_err(|e| e.to_string())
}

#[tauri::command]
fn record_session(
    ctx: State<'_, AppCtx>,
    peer: String,
    role: String,
    duration_sec: i64,
    reason: String,
) -> Result<(), String> {
    ctx.db
        .lock()
        .record_session(&peer, &role, duration_sec, &reason)
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct UnattendedStatus {
    enabled: bool,
}

#[tauri::command]
fn set_unattended(
    ctx: State<'_, AppCtx>,
    enabled: bool,
    password: Option<String>,
) -> Result<UnattendedStatus, String> {
    let db = ctx.db.lock();
    if enabled {
        let pw = password.ok_or_else(|| "password required".to_string())?;
        if pw.len() < 12 {
            return Err("password too short".into());
        }
        // Store hash only — never plaintext password in sqlite
        let salt = SaltString::generate(&mut rand::thread_rng());
        let hash = Argon2::default()
            .hash_password(pw.as_bytes(), &salt)
            .map_err(|e| e.to_string())?
            .to_string();
        db.set_meta("unattended_enabled", "1")
            .map_err(|e| e.to_string())?;
        db.set_meta("unattended_hash", &hash)
            .map_err(|e| e.to_string())?;
    } else {
        db.set_meta("unattended_enabled", "0")
            .map_err(|e| e.to_string())?;
        db.set_meta("unattended_hash", "")
            .map_err(|e| e.to_string())?;
    }
    Ok(UnattendedStatus { enabled })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let dir = data_dir();
    std::fs::create_dir_all(&dir).expect("data dir");
    let db = LocalDb::open(&dir.join("nexdesk.sqlite")).expect("sqlite");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppCtx {
            db: Mutex::new(db),
            capture: Arc::new(CaptureState::default()),
            input: InputInjector::default(),
        })
        .invoke_handler(tauri::generate_handler![
            get_identity,
            complete_onboarding,
            update_settings,
            capture_start,
            capture_stop,
            list_displays,
            inject_input,
            input_reset,
            record_session,
            set_unattended,
        ])
        .setup(|app| {
            // Ensure main window title
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_title("NexDesk");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running NexDesk");
}
