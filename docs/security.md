# NexDesk Security

## Principles

1. **ID ≠ credential** — Knowing `NXD-…` never grants access.
2. **Explicit consent** — Attended sessions require accept; unattended requires local opt-in + strong secret.
3. **Least privilege** — Permissions are requested, granted, and clamped.
4. **Encrypt in transit** — TLS for signaling/API; DTLS-SRTP / data-channel encryption for media.
5. **No covert control** — No hidden persistence, no bypass of OS login/UAC, no credential harvesting.

## Authentication

- User passwords: Argon2id hashes.
- Device secrets: Argon2id hashes at registration; JWT device tokens for sessions.
- TURN: time-limited HMAC credentials (coturn REST style).
- Unattended password: local Argon2 hash only.

## Session authorization

- Only the callee may accept/reject.
- SDP/ICE relayed only to verified session participants.
- Disconnect resets injected input state (modifier/button release).

## File transfer

- Requires `file_transfer` permission.
- Path sanitization; reject `..` and absolute escapes.
- SHA-256 integrity on complete.
- Quotas/size limits (configurable).

## Logging

- Never log passwords, device secrets, JWTs, or TURN credentials.
- Audit events record kind/actor/detail without secrets.

## Production checklist

- [ ] Rotate `NEXDESK_JWT_SECRET` and `NEXDESK_TURN_SECRET`
- [ ] Disable `NEXDESK_ALLOW_DEV_TOKENS`
- [ ] Terminate TLS at Nginx (or equivalent)
- [ ] Restrict TURN relay IPs and quotas
- [ ] Apply DB migrations; back up PostgreSQL
- [ ] Code-sign Windows installers
