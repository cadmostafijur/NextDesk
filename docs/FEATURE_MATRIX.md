# NexDesk Feature Completion Matrix

Legend: **Implemented** (code present) · **Tested** (automated or manual verification in this environment) · **Partial** · **Planned**

| Feature | Status | Notes |
|---------|--------|-------|
| Project structure / workspace | Implemented | Monorepo scaffolded |
| Protocol v1 typed messages | Implemented | Rust + TS; unit tests in protocol crate |
| Signaling WebSocket + presence | Implemented | Axum service |
| Connect request / accept / reject | Implemented | Authorization checks on roles |
| Device registration + JWT | Implemented | In-memory store; SQL schema ready |
| STUN/TURN credential minting | Implemented | coturn REST HMAC; TURN deploy needs host networking |
| Desktop onboarding + device ID | Implemented | SQLite local identity |
| Home / Connect / Settings UI | Implemented | Original NexDesk visual identity |
| Incoming connection modal | Implemented | |
| WebRTC session negotiation | Implemented | Offer/answer/ICE via signaling |
| Native screen capture (Windows) | Implemented | `xcap` → JPEG → data channel |
| Display Media fallback | Implemented | `getDisplayMedia` track path |
| Remote mouse/keyboard | Implemented | Normalized coords + enigo |
| Session chat | Implemented | Control data channel |
| File transfer UI + protocol types | Partial | Offer/chunk types exist; full resumable pipeline pending |
| Clipboard sync | Partial | Permission flag + types; sync loop pending |
| Unattended access setup | Partial | Local hash stored; auto-accept path pending |
| Account register/login API | Implemented | In-memory; needs Postgres wiring |
| Session history (local) | Implemented | SQLite + Recent page |
| Docker Compose | Implemented | Docker not installed in build host |
| Windows installer packaging | Partial | `tauri build` ready once MSVC available |
| macOS / Linux capture | Planned | APIs identified; not implemented |
| E2E two-instance media proof | Blocked | Requires MSVC + running dual instances |
| Security fuzz / path traversal suite | Partial | Docs + schema; expand tests |
| Perf benchmarks (FPS/latency) | Planned | Measure before publishing numbers |

## Environment blockers (this workstation)

- **Docker**: not installed — Compose files provided, not executed here.
- **MSVC Build Tools**: VS folder present under Program Files (x86); full C++ toolchain must be verified before `tauri build` / native crates link.
- **Physical dual-PC / dual-instance E2E**: to be run after first successful desktop build.
