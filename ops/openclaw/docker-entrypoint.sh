#!/bin/sh
set -e

# Copy config-as-code from the container image to the persistent Gateway workspace volume.
# Runs on every container start — config is code-controlled, not hand-edited on the volume.
# Persistent auth state (Telegram webhook, WhatsApp session) lives on the volume and is NOT
# overwritten here because only the config files (not the workspace/auth subdirs) are copied.

mkdir -p ~/.openclaw/workspace/skills

# Lay down main config (overwrites on each restart).
cp /app/ops/openclaw/openclaw.example.json ~/.openclaw/openclaw.json

# Sync skills from image (cp -r copies contents of skills/ into workspace/skills/).
cp -r /app/ops/openclaw/skills/. ~/.openclaw/workspace/skills/

# Externalized cheap-router system prompt (referenced by plugin.config.cheapRouterSystemPromptPath).
cp /app/ops/openclaw/cheap-router.system.md ~/.openclaw/cheap-router.system.md

# n8n workflow allowlist.
cp /app/ops/openclaw/n8n-allowlist.json ~/.openclaw/n8n-allowlist.json

# Plugin bootstrap: the Sergeant runtime adapter lives in packages/openclaw-plugin
# and is loaded into the Gateway as an OpenClaw plugin. Install state lives on
# the volume under ~/.openclaw/plugins, so this is real work only on first boot
# (or after a volume reset) and a tolerated no-op on every warm start.
# `--force` overwrites any partial install left by a crashed previous boot;
# `|| true` prevents crash-loops if the install fails for benign reasons
# (e.g. plugin already installed and openclaw exits non-zero on idempotent path).
openclaw plugins install /app/packages/openclaw-plugin --force || true

# Hand off to OpenClaw runtime. `gateway` is the canonical start command
# (see https://docs.openclaw.ai/cli — `start` is not a built-in subcommand).
# Port 18789 must match the Railway service public-domain target port and
# the `targetPort` in railway.openclaw-gateway.toml.
exec openclaw gateway --port 18789
