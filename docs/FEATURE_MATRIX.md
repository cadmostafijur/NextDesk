# NexDesk Feature Completion Matrix

Legend: **Implemented** (code present) · **Tested** (automated or manual verification in this environment) · **Partial** · **Planned**

| Feature | Status | Notes |
|---------|--------|-------|
| Project structure / workspace | Implemented | Monorepo scaffolded |
| Protocol v1 typed messages | Implemented + Tested | `cargo test -p nexdesk-protocol` (2 passed) |
| Signaling WebSocket + presence | Implemented + Tested | Service healthy on `:7800` |
| Connect request / accept / reject | Implemented + Tested | `tests/integration/signaling_e2e.mjs` PASS |
| Device registration + JWT | Implemented + Tested | REST register + hello_ack verified |
| SDP/ICE relay authorization | Implemented + Tested | Covered in signaling_e2e |
| STUN/TURN credential minting | Implemented | coturn REST HMAC; TURN deploy needs host networking |
| Desktop onboarding + device ID | Implemented | SQLite local identity; `cargo check -p nexdesk` OK |
| Home / Connect / Settings UI | Implemented | TypeScript clean (`pnpm lint`) |
| Incoming connection modal | Implemented | |
| WebRTC session negotiation | Implemented | Offer/answer/ICE via signaling (client code) |
| Native screen capture (Windows) | Implemented | `xcap` → JPEG → data channel; compiles |
| Display Media fallback | Implemented | `getDisplayMedia` track path |
| Remote mouse/keyboard | Implemented | Normalized coords + enigo; compiles |
| Session chat | Implemented | Control data channel |
| File transfer UI + protocol types | Partial | Offer/chunk types exist; full resumable pipeline pending |
| Clipboard sync | Partial | Permission flag + types; sync loop pending |
| Unattended access setup | Partial | Local hash stored; auto-accept path pending |
| Account register/login API | Implemented | In-memory; needs Postgres wiring |
| Session history (local) | Implemented | SQLite + Recent page |
| Docker Compose | Implemented | Docker not installed in build host |
| Windows installer packaging | Partial | `pnpm tauri build` next; use `scripts/env-cargo.bat` |
| macOS / Linux capture | Planned | APIs identified; not implemented |
| E2E two-instance media proof | Partial | Signaling E2E tested; dual Tauri media loop pending |
| Security fuzz / path traversal suite | Partial | Docs + schema; expand tests |
| Perf benchmarks (FPS/latency) | Planned | Measure before publishing numbers |

## Environment notes (this workstation)

- **Docker**: not installed — Compose files provided, not executed here.
- **Disk**: `C:` nearly full — use `scripts/env-cargo.bat` (`CARGO_HOME` / target on `E:`).
- **MSVC**: VS 2019 Build Tools verified (`cl.exe` present).
- **Dual Tauri UI media test**: launch two `pnpm tauri dev` instances after `call scripts\env-cargo.bat`.
