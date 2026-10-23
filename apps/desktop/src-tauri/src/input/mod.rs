use anyhow::Result;
use enigo::{
    Button, Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings,
};
use nexdesk_protocol::{InputEvent, KeyModifiers, MouseButton};
use parking_lot::Mutex;
use serde::Deserialize;
use tracing::debug;

pub struct InputInjector {
    eng: Mutex<Enigo>,
    screen_w: Mutex<u32>,
    screen_h: Mutex<u32>,
}

impl Default for InputInjector {
    fn default() -> Self {
        let eng = Enigo::new(&Settings::default()).expect("enigo init");
        Self {
            eng: Mutex::new(eng),
            screen_w: Mutex::new(1920),
            screen_h: Mutex::new(1080),
        }
    }
}

impl InputInjector {
    pub fn set_framebuffer(&self, w: u32, h: u32) {
        *self.screen_w.lock() = w.max(1);
        *self.screen_h.lock() = h.max(1);
    }

    pub fn inject(&self, event: &InputEvent) -> Result<()> {
        let mut eng = self.eng.lock();
        match event {
            InputEvent::MouseMove { nx, ny, .. } => {
                let (x, y) = self.norm_to_abs(*nx, *ny);
                eng.move_mouse(x, y, Coordinate::Abs)?;
            }
            InputEvent::MouseButton {
                button,
                pressed,
                nx,
                ny,
            } => {
                let (x, y) = self.norm_to_abs(*nx, *ny);
                eng.move_mouse(x, y, Coordinate::Abs)?;
                let btn = map_button(*button);
                let dir = if *pressed {
                    Direction::Press
                } else {
                    Direction::Release
                };
                eng.button(btn, dir)?;
            }
            InputEvent::MouseWheel { dx, dy, nx, ny } => {
                let (x, y) = self.norm_to_abs(*nx, *ny);
                eng.move_mouse(x, y, Coordinate::Abs)?;
                // One enigo unit is one wheel notch (~100px of browser delta)
                let notches = |d: f64| {
                    let n = (d / 100.0).round() as i32;
                    if n == 0 && d != 0.0 { d.signum() as i32 } else { n }
                };
                let sy = notches(*dy);
                let sx = notches(*dx);
                if sy != 0 {
                    eng.scroll(sy, enigo::Axis::Vertical)?;
                }
                if sx != 0 {
                    eng.scroll(sx, enigo::Axis::Horizontal)?;
                }
            }
            InputEvent::Key {
                key,
                code,
                pressed,
                modifiers,
            } => {
                apply_modifiers(&mut eng, modifiers, *pressed)?;
                if let Some(k) = map_key(key, code) {
                    let dir = if *pressed {
                        Direction::Press
                    } else {
                        Direction::Release
                    };
                    eng.key(k, dir)?;
                }
            }
        }
        Ok(())
    }

    pub fn reset(&self) -> Result<()> {
        let mut eng = self.eng.lock();
        // Release common modifiers to avoid stuck keys after disconnect
        for k in [Key::Control, Key::Alt, Key::Shift, Key::Meta] {
            let _ = eng.key(k, Direction::Release);
        }
        for b in [Button::Left, Button::Right, Button::Middle] {
            let _ = eng.button(b, Direction::Release);
        }
        debug!("input state reset");
        Ok(())
    }

    fn norm_to_abs(&self, nx: f64, ny: f64) -> (i32, i32) {
        let (w, h) = self.injection_space();
        let (w, h) = (w as f64, h as f64);
        let nx = nx.clamp(0.0, 1.0);
        let ny = ny.clamp(0.0, 1.0);
        ((nx * (w - 1.0)).round() as i32, (ny * (h - 1.0)).round() as i32)
    }

    /// The coordinate space enigo's absolute moves are normalised against.
    /// On Windows that is the primary screen as `GetSystemMetrics` reports it,
    /// which tracks the process DPI mode, so mapping into it lands on the same
    /// pixel the controller pointed at regardless of display scaling.
    fn injection_space(&self) -> (u32, u32) {
        #[cfg(windows)]
        {
            use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};
            let (w, h) = unsafe { (GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN)) };
            if w > 0 && h > 0 {
                return (w as u32, h as u32);
            }
        }
        (*self.screen_w.lock(), *self.screen_h.lock())
    }
}

fn map_button(b: MouseButton) -> Button {
    match b {
        MouseButton::Left => Button::Left,
        MouseButton::Right => Button::Right,
        MouseButton::Middle => Button::Middle,
    }
}

fn apply_modifiers(eng: &mut Enigo, m: &KeyModifiers, pressed: bool) -> Result<()> {
    let dir = if pressed {
        Direction::Press
    } else {
        Direction::Release
    };
    // Modifiers are included in Key events; avoid double-toggle for pure modifier keys elsewhere
    let _ = (eng, m, dir);
    Ok(())
}

fn map_key(key: &str, code: &str) -> Option<Key> {
    match code {
        "Enter" => Some(Key::Return),
        "Escape" => Some(Key::Escape),
        "Backspace" => Some(Key::Backspace),
        "Tab" => Some(Key::Tab),
        "Space" => Some(Key::Space),
        "Delete" => Some(Key::Delete),
        "ArrowUp" => Some(Key::UpArrow),
        "ArrowDown" => Some(Key::DownArrow),
        "ArrowLeft" => Some(Key::LeftArrow),
        "ArrowRight" => Some(Key::RightArrow),
        "Home" => Some(Key::Home),
        "End" => Some(Key::End),
        "PageUp" => Some(Key::PageUp),
        "PageDown" => Some(Key::PageDown),
        "ControlLeft" | "ControlRight" => Some(Key::Control),
        "ShiftLeft" | "ShiftRight" => Some(Key::Shift),
        "AltLeft" | "AltRight" => Some(Key::Alt),
        "MetaLeft" | "MetaRight" => Some(Key::Meta),
        "NumpadEnter" => Some(Key::Return),
        "CapsLock" => Some(Key::CapsLock),
        "F1" => Some(Key::F1),
        "F2" => Some(Key::F2),
        "F3" => Some(Key::F3),
        "F4" => Some(Key::F4),
        "F5" => Some(Key::F5),
        "F6" => Some(Key::F6),
        "F7" => Some(Key::F7),
        "F8" => Some(Key::F8),
        "F9" => Some(Key::F9),
        "F10" => Some(Key::F10),
        "F11" => Some(Key::F11),
        "F12" => Some(Key::F12),
        #[cfg(windows)]
        "Insert" => Some(Key::Insert),
        #[cfg(windows)]
        "PrintScreen" => Some(Key::PrintScr),
        #[cfg(windows)]
        "Pause" => Some(Key::Pause),
        #[cfg(windows)]
        "NumLock" => Some(Key::Numlock),
        #[cfg(windows)]
        "ContextMenu" => Some(Key::Apps),
        c if c.starts_with("Key") && c.len() == 4 => {
            let ch = c.chars().nth(3)?;
            Some(Key::Unicode(ch.to_ascii_lowercase()))
        }
        c if c.starts_with("Digit") && c.len() == 6 => {
            let ch = c.chars().nth(5)?;
            Some(Key::Unicode(ch))
        }
        _ => {
            if key.len() == 1 {
                key.chars().next().map(Key::Unicode)
            } else {
                None
            }
        }
    }
}

/// JSON-friendly event from the frontend (serde rename to match protocol).
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FrontInputEvent {
    MouseMove {
        x: f64,
        y: f64,
        nx: f64,
        ny: f64,
    },
    MouseButton {
        button: String,
        pressed: bool,
        nx: f64,
        ny: f64,
    },
    MouseWheel {
        dx: f64,
        dy: f64,
        nx: f64,
        ny: f64,
    },
    Key {
        key: String,
        code: String,
        pressed: bool,
        modifiers: FrontModifiers,
    },
}

#[derive(Debug, Deserialize, Default)]
pub struct FrontModifiers {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub meta: bool,
}

impl FrontInputEvent {
    pub fn into_protocol(self) -> InputEvent {
        match self {
            Self::MouseMove { x, y, nx, ny } => InputEvent::MouseMove { x, y, nx, ny },
            Self::MouseButton {
                button,
                pressed,
                nx,
                ny,
            } => InputEvent::MouseButton {
                button: match button.as_str() {
                    "right" => MouseButton::Right,
                    "middle" => MouseButton::Middle,
                    _ => MouseButton::Left,
                },
                pressed,
                nx,
                ny,
            },
            Self::MouseWheel { dx, dy, nx, ny } => InputEvent::MouseWheel { dx, dy, nx, ny },
            Self::Key {
                key,
                code,
                pressed,
                modifiers,
            } => InputEvent::Key {
                key,
                code,
                pressed,
                modifiers: KeyModifiers {
                    ctrl: modifiers.ctrl,
                    alt: modifiers.alt,
                    shift: modifiers.shift,
                    meta: modifiers.meta,
                },
            },
        }
    }
}
