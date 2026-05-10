#!/usr/bin/env node
// Scan SKILL.md body content for injection patterns, data-exfiltration
// instructions, credential harvesting, prompt injection, persistence
// mechanisms, reverse shells, and destructive commands.
//
// Exits non-zero if any hit is found. Severity is always `error` — there
// is no warning mode. Clean baseline on all 12 existing skills expected.
//
// Linked roadmap: docs/agents/skills-evolution-roadmap.md (PR 5).
// Linked rule: docs/governance/rules/22-skill-body-security-scan.md.

import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {string} repoRoot
 * @returns {{ skillsDir: string, lockPath: string }}
 */
export function resolvePaths(repoRoot) {
  return {
    skillsDir: path.join(repoRoot, ".agents/skills"),
    lockPath: path.join(repoRoot, ".agents/skills-lock.json"),
  };
}

// ── Threat categories ────────────────────────────────────────────────

/** @type {Array<{ id: string, label: string, patterns: RegExp[] }>} */
export const THREAT_CATEGORIES = [
  {
    id: "command-injection",
    label: "Command injection",
    patterns: [
      /curl\s+[^\s|]*\s*\|\s*(?:sh|bash|zsh)/i,
      /wget\s+[^\s|]*\s*\|\s*(?:sh|bash|zsh)/i,
      /eval\s*\$\(/,
      /`[^`]*(?:curl|wget|nc)\s[^`]*`/,
    ],
  },
  {
    id: "data-exfiltration",
    label: "Data exfiltration",
    patterns: [
      /cat\s+\/etc\/(?:passwd|shadow)/,
      /(?:cat|less|head|tail|cp|scp)\s+[^\s]*\.env\b[^\s]*\s*[|>]/,
      /curl\s+.*-[dX]\s+.*\.env/i,
      /curl\s+.*--data.*\.env/i,
    ],
  },
  {
    id: "credential-harvesting",
    label: "Credential harvesting",
    patterns: [
      /~\/\.ssh\/id_/,
      /~\/\.aws\/credentials/,
      /~\/\.config\/gcloud\//,
      /(?:cat|cp|scp|curl).*(?:cookies\.sqlite|Cookies|Login Data)/i,
    ],
  },
  {
    id: "prompt-injection",
    label: "Prompt injection",
    patterns: [
      /<system>/i,
      /<persona>/i,
      /<\/?(?:system|persona|instructions)>/i,
    ],
  },
  {
    id: "persistence",
    label: "Persistence",
    patterns: [
      /crontab\s+-[ei]/,
      /systemctl\s+enable/,
      />>?\s*~\/\.bashrc/,
      />>?\s*~\/\.zshrc/,
      />>?\s*~\/\.profile/,
    ],
  },
  {
    id: "reverse-shell",
    label: "Reverse shells",
    patterns: [
      /nc\s+-[^\s]*e/,
      /bash\s+-i\s*>&\s*\/dev\/tcp\//,
      /python[23]?\s+-c\s+.*socket.*connect/i,
      /socat\s+.*exec:/i,
    ],
  },
  {
    id: "destructive",
    label: "Destructive commands",
    patterns: [
      /rm\s+-rf\s+\//,
      /git\s+reset\s+--hard/,
      /git\s+clean\s+-fd/,
      /mkfs\./,
      /dd\s+if=.*of=\/dev\//,
    ],
  },
];

// ── Scanner ──────────────────────────────────────────────────────────

/**
 * @param {string} body  — SKILL.md body (everything after frontmatter)
 * @returns {Array<{ category: string, label: string, line: number, match: string }>}
 */
export function scanBody(body) {
  const hits = [];
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const cat of THREAT_CATEGORIES) {
      for (const re of cat.patterns) {
        const m = line.match(re);
        if (m) {
          hits.push({
            category: cat.id,
            label: cat.label,
            line: i + 1,
            match: m[0],
          });
        }
      }
    }
  }
  return hits;
}

/**
 * Extract body from a SKILL.md text (everything after `---` frontmatter).
 * @param {string} text
 * @returns {string}
 */
export function extractBody(text) {
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---", 4);
  if (end === -1) return text;
  return text.slice(end + 4);
}

// ── CLI entrypoint ───────────────────────────────────────────────────

function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const { skillsDir, lockPath } = resolvePaths(repoRoot);

  let lock;
  try {
    lock = JSON.parse(readFileSync(lockPath, "utf8"));
  } catch (err) {
    console.error(
      `[lint:skills:security] cannot read ${path.relative(repoRoot, lockPath)}: ${err.message}`,
    );
    process.exit(1);
  }

  const slugs = Object.keys(lock.skills ?? {}).sort();
  const allHits = [];

  for (const slug of slugs) {
    const skillPath = path.join(skillsDir, slug, "SKILL.md");
    let stat;
    try {
      stat = statSync(skillPath);
    } catch {
      continue; // shape-check catches missing files
    }
    if (!stat.isFile()) continue;

    const text = readFileSync(skillPath, "utf8");
    const body = extractBody(text);
    const hits = scanBody(body);

    for (const hit of hits) {
      allHits.push({ slug, ...hit });
    }
  }

  if (allHits.length > 0) {
    console.error(
      `[lint:skills:security] ${allHits.length} security hit(s) found:`,
    );
    for (const h of allHits) {
      console.error(`  \u2718 ${h.slug}:${h.line} [${h.label}] ${h.match}`);
    }
    console.error("");
    console.error(
      "SKILL.md body contains patterns that could instruct an agent to " +
        "execute dangerous commands. Remove or rephrase the flagged lines. " +
        "See docs/governance/rules/22-skill-body-security-scan.md.",
    );
    process.exit(1);
  }

  console.log(
    `[lint:skills:security] OK \u2014 ${slugs.length} skill(s) pass body security scan (${THREAT_CATEGORIES.length} threat categories).`,
  );
}

// Only run main when executed directly (not imported for tests)
const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  main();
}
