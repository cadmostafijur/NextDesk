#!/usr/bin/env bash
# One-shot NexDesk server setup for an Ubuntu VM: Oracle Cloud "Always Free"
# or Google Cloud free-tier e2-micro.
# Installs Docker, opens the VM firewall, generates secrets, and runs
# nexdesk-signaling (port 7800) + coturn TURN relay (port 3478).
#
#   curl -fsSL https://raw.githubusercontent.com/cadmostafijur/NextDesk/main/infrastructure/oracle/setup.sh | bash
#
# Re-running is safe: secrets in ~/nexdesk.env are kept.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/cadmostafijur/NextDesk.git}"
APP_DIR="$HOME/NextDesk"
ENV_FILE="$HOME/nexdesk.env"
TURN_MIN_PORT=49160
TURN_MAX_PORT=49200

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

export DEBIAN_FRONTEND=noninteractive # iptables-persistent otherwise stops at a prompt

log "Installing Docker and tools"
sudo apt-get update -y
sudo -E apt-get install -y ca-certificates curl git iptables-persistent docker.io
sudo systemctl enable --now docker

# The E2.1.Micro shape has 1 GB RAM; compiling Rust needs more.
if [ "$(free -m | awk '/Mem:/ {print $2}')" -lt 3000 ] && [ ! -f /swapfile ]; then
  log "Adding 4 GB swap for the Rust build"
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

log "Opening VM firewall ports (Oracle Ubuntu images block them by default)"
open_port() { # proto port
  sudo iptables -C INPUT -p "$1" --dport "$2" -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT -p "$1" --dport "$2" -j ACCEPT
}
open_port tcp 7800
open_port tcp 3478
open_port udp 3478
open_port udp "$TURN_MIN_PORT:$TURN_MAX_PORT"
sudo netfilter-persistent save

PUBLIC_IP="$(curl -fsS https://ifconfig.me || curl -fsS https://api.ipify.org)"
PRIVATE_IP="$(hostname -I | awk '{print $1}')"

if [ ! -f "$ENV_FILE" ]; then
  log "Generating secrets in $ENV_FILE"
  cat >"$ENV_FILE" <<EOF
NEXDESK_BIND=0.0.0.0:7800
NEXDESK_JWT_SECRET=$(openssl rand -hex 32)
NEXDESK_TURN_SECRET=$(openssl rand -hex 24)
EOF
  chmod 600 "$ENV_FILE"
fi
# TURN URLs follow the current public IP on every run.
sed -i '/^NEXDESK_TURN_URLS=/d' "$ENV_FILE"
echo "NEXDESK_TURN_URLS=stun:stun.l.google.com:19302,turn:$PUBLIC_IP:3478?transport=udp,turn:$PUBLIC_IP:3478?transport=tcp" >>"$ENV_FILE"
# shellcheck disable=SC1090
. "$ENV_FILE"

log "Fetching NexDesk source"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi

log "Building signaling image (first build takes 10-25 minutes)"
sudo docker build -t nexdesk-signaling -f "$APP_DIR/infrastructure/docker/Dockerfile.signaling" "$APP_DIR"

log "Writing TURN config"
mkdir -p "$HOME/turn"
cat >"$HOME/turn/turnserver.conf" <<EOF
listening-port=3478
fingerprint
use-auth-secret
static-auth-secret=$NEXDESK_TURN_SECRET
realm=nexdesk
external-ip=$PUBLIC_IP/$PRIVATE_IP
min-port=$TURN_MIN_PORT
max-port=$TURN_MAX_PORT
total-quota=100
stale-nonce=600
no-multicast-peers
no-cli
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
EOF

log "Starting containers"
sudo docker rm -f nexdesk-signaling nexdesk-turn >/dev/null 2>&1 || true
sudo docker run -d --name nexdesk-signaling --restart unless-stopped \
  --env-file "$ENV_FILE" -p 7800:7800 nexdesk-signaling
sudo docker run -d --name nexdesk-turn --restart unless-stopped --network host \
  -v "$HOME/turn/turnserver.conf:/etc/coturn/turnserver.conf:ro" coturn/coturn:latest

sleep 3
if curl -fsS http://127.0.0.1:7800/health >/dev/null; then
  log "NexDesk server is running"
  echo "  Server address for the app (Settings):  ws://$PUBLIC_IP:7800/ws"
  echo "  Health check from your PC:              http://$PUBLIC_IP:7800/health"
else
  echo "Signaling did not answer on :7800. Logs:" >&2
  sudo docker logs --tail 50 nexdesk-signaling >&2
  exit 1
fi
