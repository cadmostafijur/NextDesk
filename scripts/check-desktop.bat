@echo off
setlocal
set CARGO_HOME=E:\cargo-home
set CARGO_TARGET_DIR=E:\nexdesk-target
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
if not exist E:\cargo-home mkdir E:\cargo-home
if not exist E:\nexdesk-target mkdir E:\nexdesk-target
(
  echo [build]
  echo target-dir = "E:/nexdesk-target"
) > E:\cargo-home\config.toml
call "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
cd /d F:\NextDesk
cargo check -p nexdesk
exit /b %ERRORLEVEL%
