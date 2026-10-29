#!/usr/bin/env bash
# One-time setup of a Ladle VPS (Ubuntu 24.04 or Debian 12, as root), for the
# keeper and the chat relay under systemd behind Caddy (docs/LAUNCH.md).
#
#   sudo bash install.sh <git repository URL> [branch]
#
# Re-runnable: it updates the checkout and the units. It installs Node 24
# (NodeSource), pnpm (corepack), Caddy (its official apt repository) and a
# firewall allowing SSH, 80 and 443 only. It never writes keys or settings:
# copy /etc/ladle/keeper.env, chat.env and keeper.json yourself (LAUNCH.md).
set -euo pipefail

REPO="${1:?usage: sudo bash install.sh <git repository URL> [branch]}"
BRANCH="${2:-main}"
APP=/srv/ladle

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git gnupg ufw debian-keyring debian-archive-keyring apt-transport-https

# Node 24
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
corepack enable

# Caddy
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

# two system users: ladle (the checkout, the chat relay, which faces the
# internet) and ladle-keeper (the keeper, the only one that can read its key)
id ladle >/dev/null 2>&1 || useradd --system --home-dir "$APP" --shell /usr/sbin/nologin ladle
id ladle-keeper >/dev/null 2>&1 || useradd --system --home-dir "$APP" --shell /usr/sbin/nologin ladle-keeper
# settings are read by systemd (root) only; the key by the keeper's group (permissions below)
install -d -o root -g root -m 0755 /etc/ladle
install -d -o ladle -g ladle -m 0750 /var/lib/ladle
[ -f /var/lib/ladle/mute.txt ] || install -o ladle -g ladle -m 0640 /dev/null /var/lib/ladle/mute.txt

# the code: keeper, relay and the SDK they import (no app, no dev tools)
if [ -d "$APP/.git" ]; then
  git -c safe.directory="$APP" -C "$APP" fetch --depth 1 origin "$BRANCH"
  git -c safe.directory="$APP" -C "$APP" checkout -B "$BRANCH" FETCH_HEAD
else
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP"
fi
chown -R ladle:ladle "$APP"
cd "$APP"
runuser -u ladle -- env HOME="$APP" corepack pnpm install --frozen-lockfile --prod --filter "@pulled/keeper..." --filter "@ladle/chat..."

install -m 0644 deploy/systemd/ladle-keeper.service deploy/systemd/ladle-chat.service /etc/systemd/system/
install -m 0644 deploy/Caddyfile /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl reload caddy || systemctl restart caddy

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

cat <<'EOF'

Done. Next (docs/LAUNCH.md):
  1. copy your settings and the keeper key (from your PC, %USERPROFILE%\.config\ladle\):
       keeper.env -> /etc/ladle/keeper.env     chat.env -> /etc/ladle/chat.env
       ladle-mainnet-keeper.json -> /etc/ladle/keeper.json
     then (the relay must not read the keeper's files):
       chown root:root /etc/ladle/keeper.env /etc/ladle/chat.env && chmod 0600 /etc/ladle/keeper.env /etc/ladle/chat.env
       chown root:ladle-keeper /etc/ladle/keeper.json && chmod 0640 /etc/ladle/keeper.json
  2. sudo systemctl enable --now ladle-chat ladle-keeper
  3. curl -s 127.0.0.1:8788/health ; curl -s 127.0.0.1:8787/health
  4. point the DNS record of the chat host at this machine; Caddy fetches the certificate:
       curl -s https://chat.useladle.fun/health ; curl -s https://chat.useladle.fun/keeper/health
EOF
