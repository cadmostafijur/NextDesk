# Deployment

## Signaling + API

1. Provision PostgreSQL and apply `services/signaling/migrations/001_init.sql`.
2. Set strong `NEXDESK_JWT_SECRET` and disable dev tokens.
3. Run `nexdesk-signaling` behind Nginx with TLS.
4. Expose `/ws` with WebSocket upgrade headers (see `infrastructure/nginx/nexdesk.conf`).

```bash
docker compose up -d postgres redis signaling
```

## TURN (coturn)

1. Set `static-auth-secret` in `infrastructure/turn/turnserver.conf` to match `NEXDESK_TURN_SECRET`.
2. Configure `external-ip` to the public address.
3. Open UDP/TCP 3478 and your relay port range.
4. Point `NEXDESK_TURN_URLS` at `stun:` / `turn:` URLs.

```bash
docker compose --profile turn up -d coturn
```

## Desktop packaging

```powershell
cd apps\desktop
pnpm tauri build
```

Artifacts land under `apps/desktop/src-tauri/target/release/bundle/`. Sign with your Authenticode certificate before distribution.

## Updates

Ship signed installers; verify signatures on update. Do not fetch unsigned binaries over plain HTTP.
