#!/usr/bin/env node
/**
 * @scaffolded
 * @owner @Skords-01
 * @nextStep Add `scripts/claude-hooks/*.mjs` to knip's `entry` globs so the
 *           settings.json-invoked hooks count as real entry points, then
 *           delete this tag. See AGENTS.md → Hard Rule #10.
 *
 * Intentional zero-*importer* — this hook is invoked as a subprocess by
 * `.claude/settings.json` (PreToolUse → `node scripts/claude-hooks/
 * block-protected-paths.mjs`), never `import`ed, so knip reports no
 * consumers. Do NOT delete as part of dead-code cleanup — see Hard
 * Rule #10 in AGENTS.md.
 */
// PreToolUse hook: block Edit/Write/MultiEdit on protected files.
// Reads JSON from stdin per Claude Code hooks API.
// Exit 2 + stderr → block tool call and surface message to Claude.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const PROTECTED = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)\.env\.local$/i,
  /(^|\/)\.env\.production$/i,
  /(^|\/)settings\.local\.json$/i,
  /(^|\/)pnpm-lock\.yaml$/i,
  /(^|\/)package-lock\.json$/i,
  /(^|\/)yarn\.lock$/i,
  /docs\/governance\/governance\/freshness-dashboard\.html$/i,
  /\.agents\/skills-lock\.json$/i,
  /\.generated\.(ts|js|json|yaml|yml)$/i,
  /openapi\.(generated|gen)\.(ts|js|json|yaml|yml)$/i,
];

// Міграції захищені лише після потрапляння в `origin/main`: застосовану
// міграцію раннер трекає за іменем файлу, тож її правка в проді не
// виконається, а зламає `down`-дрил і перевірку. Нову, ще не злиту міграцію
// писати можна — інакше агент не може створити жодної (рішення власника
// 2026-10-22). Якщо git не відповідає, вважаємо файл застосованим.
const MIGRATION_SQL = /apps\/server\/src\/migrations\/.+\.sql$/i;

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function isOnMain(filePath) {
  try {
    let dir = dirname(resolve(filePath));
    while (!existsSync(dir)) dir = dirname(dir);
    const top = git(dir, ["rev-parse", "--show-toplevel"]);
    git(top, ["rev-parse", "--verify", "--quiet", "origin/main"]);
    const rel = relative(top, resolve(filePath)).replaceAll("\\", "/");
    try {
      git(top, ["cat-file", "-e", `origin/main:${rel}`]);
      return true;
    } catch {
      return false;
    }
  } catch {
    return true;
  }
}

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

const filePath =
  payload.tool_input?.file_path ?? payload.tool_input?.notebook_path ?? "";
if (!filePath) process.exit(0);

const normalized = filePath.replaceAll("\\", "/");

if (MIGRATION_SQL.test(normalized) && isOnMain(filePath)) {
  process.stderr.write(
    `BLOCKED: ${filePath} is a migration already on origin/main.\n` +
      `Applied migrations are tracked by filename; write a new migration instead.\n` +
      `If you genuinely need to edit, ask the user first or set SERGEANT_HOOK_OVERRIDE=1.\n`,
  );
  if (process.env.SERGEANT_HOOK_OVERRIDE !== "1") process.exit(2);
  process.stderr.write("Override active — allowing.\n");
}

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
