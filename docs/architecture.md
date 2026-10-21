# NexDesk Architecture

## Overview

NexDesk separates **signaling** from **media**:

1. Clients authenticate to the signaling service over WebSocket (TLS in production).
2. Presence, connect requests, accept/reject, SDP, and ICE candidates are exchanged on signaling.
3. Screen media and control data travel peer-to-peer over WebRTC (DTLS-SRTP / data channels).
4. When P2P fails, ICE uses TURN (coturn) with short-lived credentials.

Device IDs identify endpoints for discovery. They are **not** credentials.

## Components

| Component | Role |
|-----------|------|
| `apps/desktop` | Tauri 2 shell, React UI, WebRTC session, native capture/input |
| `services/signaling` | Axum WS + auth/device REST (MVP) |
| `services/api` | Standalone REST process (split-deploy ready) |
| `packages/protocol` | Versioned Rust message types |
| `packages/shared-types` | TypeScript mirrors |
| `infrastructure/turn` | coturn config |
| PostgreSQL | Durable accounts/devices/audit (schema ready) |
| Redis | Optional presence/rate-limit (planned) |

## Session lifecycle

```
Controller                Signaling                 Host
    |--- Hello/auth -------->|                         |
    |                        |<------- Hello/auth -----|
    |--- LookupDevice ------>|                         |
    |--- ConnectRequest ---->|--- ConnectIncoming ---->|
    |                        |<--- ConnectAccept ------|
    |<--- SessionReady ------|---- SessionReady ------>|
    |--- SDP/ICE ----------->|--- SDP/ICE ------------>|
    |<======== WebRTC media + data channels ==========>|
    |--- SessionEnd -------->|--- SessionEnd --------->|
```

## Native responsibilities (desktop)

- **Identity**: SQLite + optional OS keyring; device secret never logged.
- **Capture**: `xcap` (Windows Desktop Duplication / Graphics Capture path via crate).
- **Input**: `enigo` / Win32 SendInput mapping from normalized coordinates.
- **Permissions**: OS prompts for screen capture; unattended access explicit-only.

## Threat model (summary)

See [security.md](security.md). Core assumptions:

- Signaling is semi-trusted: it routes messages but cannot decrypt WebRTC media.
- Endpoints enforce accept/reject and permission clamps.
- Stolen device IDs alone cannot authorize a session.
