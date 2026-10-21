use std::path::Path;

use anyhow::Result;
use rusqlite::{params, Connection};

pub struct LocalDb {
    conn: Connection,
}

impl LocalDb {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(
            r#"
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS recent_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                peer TEXT NOT NULL,
                role TEXT NOT NULL,
                duration_sec INTEGER NOT NULL,
                reason TEXT,
                ended_at TEXT NOT NULL
            );
            "#,
        )?;
        Ok(Self { conn })
    }

    pub fn get_meta(&self, key: &str) -> Result<Option<String>> {
        let mut stmt = self.conn.prepare("SELECT value FROM meta WHERE key = ?1")?;
        let mut rows = stmt.query(params![key])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub fn set_meta(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO meta(key, value) VALUES(?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn record_session(
        &self,
        peer: &str,
        role: &str,
        duration_sec: i64,
        reason: &str,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO recent_sessions(peer, role, duration_sec, reason, ended_at)
             VALUES(?1, ?2, ?3, ?4, datetime('now'))",
            params![peer, role, duration_sec, reason],
        )?;
        Ok(())
    }
}
