#!/bin/sh
set -e

# Copy config-as-code from the container image to the persistent Gateway workspace volume.
# Runs on every container start — config is code-controlled, not hand-edited on the volume.
# Persistent auth state (Telegram webhook, WhatsApp session) lives on the volume and is NOT
# overwritten here because only the config files (not the workspace/auth subdirs) are copied.

mkdir -p ~/.openclaw/workspace/skills

# Lay down main config (overwrites on each restart).
cp /app/ops/openclaw/openclaw.example.json ~/.openclaw/openclaw.json

# Sync supplementary assets (skills, shortcuts, cheap-router prompt, n8n allowlist).
# These are consumed by @sergeant/openclaw-plugin at runtime via paths under ~/.openclaw.
cp -r /app/ops/openclaw/skills/. ~/.openclaw/workspace/skills/
cp /app/ops/openclaw/cheap-router.system.md ~/.openclaw/cheap-router.system.md
cp /app/ops/openclaw/n8n-allowlist.json ~/.openclaw/n8n-allowlist.json

# Plugin bootstrap: @sergeant/openclaw-plugin lives in packages/openclaw-plugin and
# is loaded into the Gateway as an OpenClaw plugin. Install state lives on the
# volume under ~/.openclaw/{plugins,extensions}, so this is real work only on
# first boot (or after a volume reset) and a tolerated no-op on every warm start.
#
# Wipe any prior install state before re-installing: earlier crashed deploys (when
# the manifest still lacked id / dist output / a slim package.json) wrote partial
# entries into installs.json that subsequent --force installs preserved, leaving
# the gateway to validate against stale data and crash on "plugin manifest requires
# id". Clearing the install records + extension dirs is safe — the plugin code
# ships in the image, not on the volume.
rm -rf ~/.openclaw/plugins ~/.openclaw/extensions/@sergeant-openclaw-plugin-* || true
openclaw plugins install /app/packages/openclaw-plugin --force || true

# Hand off to OpenClaw runtime. `gateway run` runs the WebSocket Gateway in the
# foreground (the unqualified `openclaw gateway` would try to install/start a
# systemd unit, which is unavailable in containers — see `openclaw gateway --help`).
# Port 18789 must match the Railway service public-domain target port and the
# HEALTHCHECK in Dockerfile.openclaw-gateway.
exec openclaw gateway run --port 18789
