#!/usr/bin/env node
// PreToolUse hook: block Edit/Write/MultiEdit on protected files.
// Reads JSON from stdin per Claude Code hooks API.
// Exit 2 + stderr → block tool call and surface message to Claude.

import { readFileSync } from "node:fs";

const PROTECTED = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)\.env\.local$/i,
  /(^|\/)\.env\.production$/i,
  /(^|\/)settings\.local\.json$/i,
  /(^|\/)pnpm-lock\.yaml$/i,
  /(^|\/)package-lock\.json$/i,
  /(^|\/)yarn\.lock$/i,
  /apps\/server\/src\/migrations\/.+\.sql$/i,
  /docs\/governance\/freshness-dashboard\.html$/i,
  /\.agents\/skills-lock\.json$/i,
  /\.generated\.(ts|js|json|yaml|yml)$/i,
  /openapi\.(generated|gen)\.(ts|js|json|yaml|yml)$/i,
];

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

const tool = payload.tool_name ?? "";
if (!/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) process.exit(0);

const filePath = payload.tool_input?.file_path ?? payload.tool_input?.notebook_path ?? "";
if (!filePath) process.exit(0);

const normalized = filePath.replaceAll("\\", "/");

for (const pattern of PROTECTED) {
  if (pattern.test(normalized)) {
    process.stderr.write(
      `BLOCKED: ${filePath} matches protected pattern ${pattern}.\n` +
        `These files are generated, secret, or hand-edit-forbidden.\n` +
        `If you genuinely need to edit, ask the user first or set SERGEANT_HOOK_OVERRIDE=1.\n`,
    );
    if (process.env.SERGEANT_HOOK_OVERRIDE === "1") {
      process.stderr.write("Override active — allowing.\n");
      process.exit(0);
    }
    process.exit(2);
  }
}

process.exit(0);
