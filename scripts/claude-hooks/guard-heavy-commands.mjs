#!/usr/bin/env node
// PreToolUse hook for Bash: warn before heavy pnpm commands on slow hardware.
// Aligns with CLAUDE.md "Local execution policy".
// Exit 2 → block with reason. Set SERGEANT_HEAVY_OK=1 to override.

import { readFileSync } from "node:fs";

let raw = "";
try {
  raw = readFileSync(0, "utf8");
} catch {
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

if (payload.tool_name !== "Bash") process.exit(0);

const command = String(payload.tool_input?.command ?? "");

// Strip quoted strings so we don't false-positive on text inside commit messages,
// echo args, here-docs, etc. Then split on shell separators and check each segment.
const stripped = command
  .replace(/"(?:[^"\\]|\\.)*"/g, '""')
  .replace(/'(?:[^'\\]|\\.)*'/g, "''")
  .replace(/<<-?\s*'?(\w+)'?[\s\S]*?\1/g, "");

const segments = stripped.split(/&&|\|\||;|\|/).map((s) => s.trim()).filter(Boolean);

const HEAVY = [
  { pattern: /^pnpm(\s+--filter\s+\S+)?\s+check(\s|$)/, label: "pnpm check" },
  { pattern: /^pnpm(\s+--filter\s+\S+)?\s+test(\s|$|:)/, label: "pnpm test" },
  { pattern: /^pnpm(\s+--filter\s+\S+)?\s+build(\s|$|:)/, label: "pnpm build" },
  { pattern: /^pnpm\s+format(\s|$)/, label: "pnpm format" },
  { pattern: /^pnpm\s+dev(\s|$|:)/, label: "pnpm dev" },
];

const ALWAYS_OK = [
  /^pnpm\s+lint:skills\b/,
  /^pnpm\s+skills:lock\b/,
  /^pnpm\s+typecheck\b/,
  /^pnpm(\s+--filter\s+\S+)?\s+typecheck\b/,
];

let hit = null;
for (const seg of segments) {
  if (ALWAYS_OK.some((p) => p.test(seg))) continue;
  const m = HEAVY.find(({ pattern }) => pattern.test(seg));
  if (m) {
    hit = m;
    break;
  }
}

if (!hit) process.exit(0);

if (process.env.SERGEANT_HEAVY_OK === "1") {
  process.stderr.write(`Heavy command allowed via SERGEANT_HEAVY_OK: ${hit.label}\n`);
  process.exit(0);
}

process.stderr.write(
  `BLOCKED heavy command "${hit.label}" — slow-hardware policy (see CLAUDE.md § Local execution policy).\n` +
    `CI runs this on push. If the user explicitly asked you to run it locally,\n` +
    `prefix the command with: SERGEANT_HEAVY_OK=1\n` +
    `Or suggest a cheaper alternative (pnpm typecheck, scoped --filter ... typecheck).\n`,
);
process.exit(2);
