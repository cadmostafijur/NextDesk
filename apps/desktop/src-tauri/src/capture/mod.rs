use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Result};
use image::codecs::jpeg::JpegEncoder;
use image::{ColorType, ImageEncoder};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};
use tracing::{info, warn};
use xcap::Monitor;

pub struct CaptureState {
    running: AtomicBool,
    join: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl Default for CaptureState {
    fn default() -> Self {
        Self {
            running: AtomicBool::new(false),
            join: Mutex::new(None),
        }
    }
}

impl CaptureState {
    pub fn start(
        self: &Arc<Self>,
        app: AppHandle,
        monitor_index: usize,
        max_fps: u32,
        quality: u8,
    ) -> Result<()> {
        if self.running.swap(true, Ordering::SeqCst) {
            return Ok(());
        }

        let flag = Arc::clone(self);
        let handle = std::thread::Builder::new()
            .name("nexdesk-capture".into())
            .spawn(move || {
                if let Err(err) = capture_loop(&flag, app, monitor_index, max_fps, quality) {
                    warn!("capture loop ended: {err:#}");
                }
                flag.running.store(false, Ordering::SeqCst);
            })?;
        *self.join.lock() = Some(handle);
        info!(monitor_index, max_fps, "screen capture started");
        Ok(())
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.join.lock().take() {
            let _ = handle.join();
        }
        info!("screen capture stopped");
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }
}

fn capture_loop(
    state: &CaptureState,
    app: AppHandle,
    monitor_index: usize,
    max_fps: u32,
    quality: u8,
) -> Result<()> {
    let monitors = Monitor::all().map_err(|e| anyhow!("monitor enum failed: {e}"))?;
    let monitor = monitors
        .into_iter()
        .nth(monitor_index)
        .ok_or_else(|| anyhow!("monitor {monitor_index} not found"))?;

    let fps = max_fps.clamp(1, 60);
    let frame_delay = Duration::from_millis(1000 / u64::from(fps));
    let quality = quality.clamp(20, 95);

    while state.running.load(Ordering::SeqCst) {
        let started = std::time::Instant::now();
        match monitor.capture_image() {
            Ok(img) => {
                let rgb = image::DynamicImage::ImageRgba8(img).into_rgb8();
                let (w, h) = rgb.dimensions();
                let mut jpeg = Vec::with_capacity((w * h / 4) as usize);
                {
                    let enc = JpegEncoder::new_with_quality(&mut jpeg, quality);
                    if enc
                        .write_image(rgb.as_raw(), w, h, ColorType::Rgb8.into())
                        .is_ok()
                    {
                        // Emit as Vec<u8> for the frontend data channel bridge
                        let _ = app.emit("capture://frame", jpeg);
                    }
                }
            }
            Err(err) => {
                warn!("capture frame failed: {err}");
                std::thread::sleep(Duration::from_millis(200));
            }
        }
        let spent = started.elapsed();
        if spent < frame_delay {
            std::thread::sleep(frame_delay - spent);
        }
    }
    Ok(())
}

pub fn list_monitors() -> Result<Vec<MonitorInfo>> {
    let monitors = Monitor::all().map_err(|e| anyhow!("{e}"))?;
    Ok(monitors
        .into_iter()
        .enumerate()
        .map(|(i, m)| MonitorInfo {
            index: i,
            name: {
                let n = m.name();
                if n.is_empty() {
                    format!("Display {i}")
                } else {
                    n.to_string()
                }
            },
            width: m.width(),
            height: m.height(),
            is_primary: m.is_primary(),
        })
        .collect())
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MonitorInfo {
    pub index: usize,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}
