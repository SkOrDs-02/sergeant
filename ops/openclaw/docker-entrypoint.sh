#!/bin/sh
set -e

# Copy config-as-code from the container image to the persistent Gateway workspace volume.
# Runs on every container start — config is code-controlled, not hand-edited on the volume.
# Persistent auth state (Telegram webhook, WhatsApp session) lives on the volume and is NOT
# overwritten here because only the config files (not the workspace/auth subdirs) are copied.

mkdir -p ~/.openclaw/workspace/skills

# Lay down main config (overwrites on each restart).
cp /app/ops/openclaw/openclaw.example.json ~/.openclaw/openclaw.json

# Stage 1 MVP: the workspace skills/ + cheap-router prompt + n8n-allowlist
# were authored for the pre-rewrite plugin and reference 24+ tools that the
# MVP plugin doesn't register yet (recall_memory, query_app_db, read_github
# only). Leaving them in place poisons the agent's persona — it reads the
# SKILL.md docs, believes it's "Sergeant CTO with full tool-set", then can't
# find the tools it expects and surfaces confusing "I don't have X" answers.
#
# Wipe the volume-persisted copies on every start. Re-introduce these assets
# stage by stage as we migrate tools in Stages 2-4.
rm -rf ~/.openclaw/workspace/skills/* \
       ~/.openclaw/cheap-router.system.md \
       ~/.openclaw/n8n-allowlist.json
# Re-create empty skills dir to keep the path valid for openclaw.
mkdir -p ~/.openclaw/workspace/skills

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
rm -rf ~/.openclaw/plugins ~/.openclaw/extensions/sergeant ~/.openclaw/extensions/@sergeant-openclaw-plugin-* || true
openclaw plugins install /app/packages/openclaw-plugin --force || true

# After install, patch in the runtime config block under
# plugins.entries.sergeant.config — kept out of the base config-as-code so the
# gateway doesn't strip it as a stale entry on the validation pass that
# precedes install. The plugin's register() hook reads this block as the
# stringified second argument and would otherwise crash with
# "OpenClaw plugin config is not valid JSON: 'undefined' is not valid JSON".
node /app/ops/openclaw/patch-sergeant-config.mjs

# Hand off to OpenClaw runtime. `gateway run` runs the WebSocket Gateway in the
# foreground (the unqualified `openclaw gateway` would try to install/start a
# systemd unit, which is unavailable in containers — see `openclaw gateway --help`).
# Port 18789 must match the Railway service public-domain target port and the
# HEALTHCHECK in Dockerfile.openclaw-gateway.
exec openclaw gateway run --port 18789
