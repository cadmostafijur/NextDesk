@echo off
setlocal
call "%~dp0env-cargo.bat"
cd /d F:\NextDesk\apps\desktop
if not exist node_modules call pnpm install
pnpm tauri build
exit /b %ERRORLEVEL%
