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

# Hand off to OpenClaw runtime.
exec openclaw start
