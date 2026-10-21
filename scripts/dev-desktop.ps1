$ErrorActionPreference = "Stop"
Set-Location (Join-Path (Split-Path $PSScriptRoot -Parent) "apps\desktop")
$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
if (-not (Test-Path node_modules)) { pnpm install }
pnpm tauri dev
