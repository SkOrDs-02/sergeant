#!/usr/bin/env node
/**
 * Idempotent JSON patch: inserts the `config` block into
 * `plugins.entries.sergeant` of `~/.openclaw/openclaw.json` AFTER
 * `openclaw plugins install` has registered the plugin entry (otherwise
 * the gateway strips the entry as stale and the register() hook receives
 * `undefined` instead of the required PluginConfig JSON).
 *
 * Env-interpolated values stay as `${VAR}` strings — openclaw substitutes
 * them at config-load time using process env. Required env vars are
 * declared in Railway and must be present at container start.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const configPath = join(homedir(), ".openclaw", "openclaw.json");
const raw = readFileSync(configPath, "utf8");
const cfg = JSON.parse(raw);

cfg.plugins ??= {};
cfg.plugins.entries ??= {};
const existing = cfg.plugins.entries.sergeant ?? { enabled: true };
cfg.plugins.entries.sergeant = {
  ...existing,
  enabled: true,
  config: {
    serverInternalUrl: "${SERVER_INTERNAL_URL}",
    internalApiKey: "${INTERNAL_API_KEY}",
    founderUserId: "${OPENCLAW_FOUNDER_USER_ID}",
    maxPerCallUsd: "${OPENCLAW_MAX_PER_CALL_USD:-0.5}",
    councilUsdBudget: "${OPENCLAW_COUNCIL_USD_BUDGET:-2.0}",
    approvalVariant: "B",
    cheapRouterSystemPromptPath: "/root/.openclaw/cheap-router.system.md",
  },
};

writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
console.log(
  "[entrypoint] Patched plugins.entries.sergeant.config into",
  configPath,
);
