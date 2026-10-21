-- NexDesk PostgreSQL schema (production persistence)
-- Apply with: psql $DATABASE_URL -f migrations/001_init.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS registered_devices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id       TEXT NOT NULL UNIQUE,
    device_name     TEXT NOT NULL,
    owner_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    secret_hash     TEXT NOT NULL,
    public_key_hint TEXT NOT NULL DEFAULT '',
    revoked         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devices_owner ON registered_devices(owner_user_id);

CREATE TABLE IF NOT EXISTS device_credentials (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id       TEXT NOT NULL REFERENCES registered_devices(device_id) ON DELETE CASCADE,
    kind            TEXT NOT NULL,
    secret_hash     TEXT NOT NULL,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    granter_device  TEXT NOT NULL REFERENCES registered_devices(device_id) ON DELETE CASCADE,
    grantee_device  TEXT NOT NULL REFERENCES registered_devices(device_id) ON DELETE CASCADE,
    view_ok         BOOLEAN NOT NULL DEFAULT TRUE,
    control_ok      BOOLEAN NOT NULL DEFAULT FALSE,
    clipboard_ok    BOOLEAN NOT NULL DEFAULT FALSE,
    file_transfer_ok BOOLEAN NOT NULL DEFAULT FALSE,
    audio_ok        BOOLEAN NOT NULL DEFAULT FALSE,
    chat_ok         BOOLEAN NOT NULL DEFAULT TRUE,
    unattended      BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (granter_device, grantee_device)
);

CREATE TABLE IF NOT EXISTS connection_sessions (
    id              UUID PRIMARY KEY,
    controller_device TEXT NOT NULL,
    host_device     TEXT NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at        TIMESTAMPTZ,
    end_reason      TEXT,
    relayed         BOOLEAN,
    permissions     JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sessions_host ON connection_sessions(host_device, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_controller ON connection_sessions(controller_device, started_at DESC);

CREATE TABLE IF NOT EXISTS session_participants (
    session_id      UUID NOT NULL REFERENCES connection_sessions(id) ON DELETE CASCADE,
    device_id       TEXT NOT NULL,
    role            TEXT NOT NULL,
    PRIMARY KEY (session_id, device_id)
);

CREATE TABLE IF NOT EXISTS file_transfers (
    id              UUID PRIMARY KEY,
    session_id      UUID REFERENCES connection_sessions(id) ON DELETE SET NULL,
    from_device     TEXT NOT NULL,
    to_device       TEXT NOT NULL,
    file_name       TEXT NOT NULL,
    file_size       BIGINT NOT NULL,
    sha256          TEXT NOT NULL,
    status          TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS access_grants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_device     TEXT NOT NULL REFERENCES registered_devices(device_id) ON DELETE CASCADE,
    subject         TEXT NOT NULL,
    permissions     JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
    id              BIGSERIAL PRIMARY KEY,
    at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    kind            TEXT NOT NULL,
    actor           TEXT NOT NULL,
    detail          TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_events(at DESC);

CREATE TABLE IF NOT EXISTS application_settings (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preferences     JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
