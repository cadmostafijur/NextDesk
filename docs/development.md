# Development

## Prerequisites (Windows MVP)

- Rust stable + MSVC Build Tools (C++ workload)
- Node.js 20+ and pnpm
- WebView2 Runtime (usually preinstalled on Windows 11)
- Optional: Docker Desktop for Postgres/Redis/TURN

If `C:` is low on disk, run `scripts\env-cargo.bat` first (sets `CARGO_HOME` / target dir on `E:`).

## Run signaling

```powershell
copy .env.example .env
cd services\signaling
# from repo root is preferred:
cargo run -p nexdesk-signaling
```

Health: http://127.0.0.1:7800/health

## Run desktop

```powershell
cd apps\desktop
pnpm install
pnpm tauri dev
```

Second instance:

```powershell
$env:NEXDESK_DATA_DIR = "$env:TEMP\nexdesk-b"
pnpm tauri dev
```

## MVP test script

1. Start signaling.
2. Launch two NexDesk windows (different data dirs).
3. Complete onboarding on each; copy Host ID.
4. On Controller: Connect → paste ID → Request.
5. On Host: Accept.
6. Confirm remote screen appears (native frames or display-media track).
7. With control granted, move mouse/type on controller; observe host.
8. Disconnect; verify both return to idle and input modifiers release.

## Tests

```powershell
cargo test -p nexdesk-protocol
cargo test -p nexdesk-signaling
node tests\integration\signaling_e2e.mjs
cd apps\desktop
pnpm lint
pnpm build
```

## Benchmarks (manual)

During a session, note FPS (frame events / sec), RTT (WebRTC stats), CPU (Task Manager), and bitrate. Record results in `docs/FEATURE_MATRIX.md` notes — do not claim numbers without measurement.
