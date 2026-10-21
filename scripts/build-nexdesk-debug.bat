@echo off
setlocal
call "%~dp0env-cargo.bat"
cd /d F:\NextDesk
cargo build -p nexdesk
echo Binary: E:\nexdesk-target\debug\nexdesk.exe
exit /b %ERRORLEVEL%
