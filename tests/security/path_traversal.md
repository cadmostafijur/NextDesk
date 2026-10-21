# File-transfer path traversal checks

When implementing the receive path, reject:

- `../`, `..\\`
- Absolute paths (`C:\\…`, `/etc/…`)
- Reserved device names on Windows (`CON`, `NUL`, …)
- Symlink escapes outside the configured destination root

Automated tests should write to a temp sandbox and assert rejection before any write.
