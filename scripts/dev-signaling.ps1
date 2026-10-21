$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
cargo run -p nexdesk-signaling
