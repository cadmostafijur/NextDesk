# NexDesk

Cross-platform remote desktop application. Secure device-to-device sessions with screen streaming, remote input, file transfer, and session tools.

**Product name:** NexDesk  
**Primary MVP target:** Windows → Windows over LAN/internet via WebRTC + authenticated signaling.

## Architecture

| Layer | Stack |
|-------|--------|
| Desktop shell | Tauri 2 + Rust |
| UI | React, TypeScript, Vite, Tailwind CSS |
| Local store | SQLite |
| Signaling / API | Rust (Axum + Tokio) |
| Persistence | PostgreSQL |
| Presence / rate limits | Redis (optional in-memory fallback) |
| Media path | WebRTC (P2P) + STUN/TURN (coturn) |
| Capture / input | Native OS APIs (Windows first) |

Signaling is separated from media. Peers exchange offers/answers/ICE over WebSockets; screen and input travel over encrypted WebRTC channels.

## Repository layout

```
apps/desktop/          Tauri + React client
services/signaling/    WebSocket signaling + presence
services/api/          REST auth, devices, history
packages/protocol/     Shared message types (Rust)
packages/shared-types/ Shared TypeScript types
infrastructure/        Docker, TURN, Nginx
tests/                 Integration, security, e2e
docs/                  Architecture & ops docs
```

## Quick start (development)

### Prerequisites

- Rust stable (1.80+)
- Node.js 20+
- PostgreSQL 16+ (or Docker Compose)
- Redis (optional)
- Windows: MSVC Build Tools + WebView2 Runtime

### 1. Environment

```bash
cp .env.example .env
```

### 2. Backend

```bash
# With Docker Compose (recommended when Docker is available):
docker compose up -d postgres redis

# Signaling (also serves lightweight API routes in MVP)
cd services/signaling
cargo run
```

Default signaling URL: `ws://127.0.0.1:7800/ws`  
Health: `http://127.0.0.1:7800/health`

### 3. Desktop app

```bash
cd apps/desktop
pnpm install
pnpm tauri dev
```

Run **two instances** (second with a different config dir) to test connect → accept → stream → control → disconnect.

```bash
# Second instance (PowerShell)
$env:NEXDESK_DATA_DIR = "$env:TEMP\nexdesk-client-b"
pnpm tauri dev
```

## Feature status

See [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md).

## Security notes

- Device IDs are **not** credentials. Possession of an ID never grants access.
- Sessions require explicit accept (or configured unattended access with strong auth).
- TLS required in production for signaling/API.
- Media uses WebRTC DTLS-SRTP where applicable.
- Secrets go in OS secure storage; never commit `.env` with real credentials.

## Documentation

- [Architecture](docs/architecture.md)
- [Protocol](docs/protocol.md)
- [Security](docs/security.md)
- [Development](docs/development.md)
- [Deployment](docs/deployment.md)
- [User guide](docs/user-guide.md)

## License

Proprietary — all rights reserved unless otherwise stated.
