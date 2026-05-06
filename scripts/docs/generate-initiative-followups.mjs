#!/usr/bin/env node
// scripts/docs/generate-initiative-followups.mjs
//
// Scan `docs/initiatives/[0-9]*.md`, extract each initiative's
// `### Carry-over → successor` block, and generate
// `docs/initiatives/follow-ups.md` — a consolidated index of all open
// follow-up items across initiatives, split into:
//
//   1. One-shot — date-driven items (sorted by due date), trigger-based
//      items (sorted alphabetically by trigger phrase), and truly
//      unscheduled items.
//   2. Recurring — items with a `**Recurring (cadence):**` prefix.
//
// Single source of truth for `що мені треба перевірити цього тижня?`
// — answers the question without grep-ing every initiative file.
//
// Format contract for top-level carry-over bullets:
//
//   - [ ] **YYYY-MM-DD[ ...]:** description …       ← one-shot, due-date
//   - [ ] **Recurring (weekly):** description …     ← recurring check
//   - [ ] **Після baseline-week:** description …    ← trigger-based
//   - [ ] description …                             ← unscheduled (TBD)
//
// Only unchecked (`- [ ]`) bullets appear in the index. Checked items
// are historical record and stay in the source initiative file as-is.
//
// Usage:
//   node scripts/docs/generate-initiative-followups.mjs            # write
//   node scripts/docs/generate-initiative-followups.mjs --check    # CI
//
// Exits 1 on `--check` diff or I/O error.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `prettier` is loaded lazily inside `formatMarkdown` so importing this
// module never requires `node_modules/prettier` on disk. The
// `Docs-automation scripts unit tests` CI job runs raw `node --test`
// without `pnpm install`, and the unit tests do not exercise the
// formatting path — only the CLI does.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");
const INITIATIVES_DIR = resolve(REPO_ROOT, "docs/initiatives");
const OUTPUT_PATH = join(INITIATIVES_DIR, "follow-ups.md");

// Matches both active (`NNNN-...md`) and completed-prefix (`_NNNN-...md`)
// initiative files. The leading `_` is added when an initiative goes
// `Done` / `Closed` so `ls docs/initiatives/` separates active from done
// — see `docs/initiatives/README.md` § Гайдлайн → completed-prefix.
const RE_INITIATIVE_FILE = /^_?\d{4}-.+\.md$/;
const RE_H1 = /^#\s+(.+?)\s*$/m;
// Carry-over heading we recognise. Both `###` and `##` levels supported so
// authors aren't forced to a specific depth.
const RE_CARRY_OVER_HEADING = /^(#{2,3})\s+Carry-over\s+→\s+successor\s*$/m;
// A bullet is a top-level `- [ ] ` / `- [x] ` line. Nested bullets (indented
// with whitespace) are treated as continuation of the parent and are NOT
// indexed independently — they explain the parent item.
const RE_TOP_BULLET = /^- \[( |x)\] (.*)$/;
// Prefix patterns. The order matters: ISO date is most specific, then
// recurring, then any other `**bold prefix:**` is treated as a trigger.
const RE_DATE_PREFIX = /^\*\*(\d{4}-\d{2}-\d{2})(?:\s+\([^)]*\))?:\*\*\s*(.*)$/;
const RE_RECURRING_PREFIX = /^\*\*Recurring\s*\(([^)]+)\):\*\*\s*(.*)$/i;
const RE_OTHER_PREFIX = /^\*\*([^*:]+):\*\*\s*(.*)$/;

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/**
 * Slice the carry-over block out of an initiative file's body. Returns the
 * raw block text (without the heading line itself) or null if no carry-over
 * heading is present.
 */
export function sliceCarryOverBlock(content) {
  const match = RE_CARRY_OVER_HEADING.exec(content);
  if (!match) return null;
  const startIdx = match.index + match[0].length;
  const after = content.slice(startIdx);
  // Stop at the next heading of the same or higher level. We accept any
  // heading `^#{1,3} ` because `### Carry-over → successor` is typically
  // the last subsection in an initiative.
  const stopMatch = /^#{1,3}\s/m.exec(after);
  return stopMatch ? after.slice(0, stopMatch.index) : after;
}

/**
 * Parse the carry-over block into top-level bullets. Returns an array of
 * `{ checked, prefix, kind, key, description }` records:
 *
 *   - kind:        "one-shot-dated" | "recurring" | "trigger" | "tbd"
 *   - key:         ISO date for dated, cadence string for recurring,
 *                  trigger phrase for trigger-based, "" for tbd
 *   - description: bullet body with prefix stripped
 *
 * Only `- [ ]` (unchecked) bullets are returned — checked items are not
 * actionable and are excluded from the index.
 *
 * Indentation note: nested bullets (lines starting with whitespace + `-`)
 * are folded into the parent's description so that authors can write
 * sub-points like rollback steps without polluting the index.
 */
export function parseCarryOverBullets(block) {
  if (!block) return [];
  const lines = block.split(/\r?\n/);
  const bullets = [];
  let current = null;
  for (const line of lines) {
    const topMatch = RE_TOP_BULLET.exec(line);
    if (topMatch) {
      if (current) bullets.push(current);
      current = {
        checked: topMatch[1] === "x",
        rawBody: topMatch[2].trim(),
        continuation: [],
      };
      continue;
    }
    if (!current) continue;
    if (/^\s+\S/.test(line)) {
      current.continuation.push(line.trim());
      continue;
    }
    // Blank or unrelated paragraph terminates the current bullet.
    if (line.trim() === "") {
      bullets.push(current);
      current = null;
    }
  }
  if (current) bullets.push(current);

  return bullets
    .filter((b) => !b.checked)
    .map((b) => classifyBullet(joinBody(b)));
}

function joinBody(b) {
  return b.continuation.length === 0
    ? b.rawBody
    : `${b.rawBody} ${b.continuation.join(" ")}`;
}

/**
 * Classify a stripped bullet body into one of four kinds based on its
 * leading `**...:**` prefix. Exported for tests.
 */
export function classifyBullet(body) {
  const dateMatch = RE_DATE_PREFIX.exec(body);
  if (dateMatch) {
    return {
      kind: "one-shot-dated",
      key: dateMatch[1],
      prefix: body.slice(0, body.indexOf(":**") + 3),
      description: dateMatch[2].trim(),
    };
  }
  const recMatch = RE_RECURRING_PREFIX.exec(body);
  if (recMatch) {
    return {
      kind: "recurring",
      key: recMatch[1].trim().toLowerCase(),
      prefix: body.slice(0, body.indexOf(":**") + 3),
      description: recMatch[2].trim(),
    };
  }
  const otherMatch = RE_OTHER_PREFIX.exec(body);
  if (otherMatch) {
    return {
      kind: "trigger",
      key: otherMatch[1].trim(),
      prefix: body.slice(0, body.indexOf(":**") + 3),
      description: otherMatch[2].trim(),
    };
  }
  return {
    kind: "tbd",
    key: "",
    prefix: "",
    description: body.trim(),
  };
}

/** Today in YYYY-MM-DD UTC. */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Add `days` calendar days to an ISO date string. */
export function addDays(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function escapePipes(s) {
  return String(s).replace(/\|/g, "\\|");
}

function tableCell(s) {
  return escapePipes(String(s).replace(/\r?\n/g, " ")).trim();
}

/**
 * Truncate a description to keep the table readable. We don't truncate
 * by default (rich descriptions are useful) but offer the helper for
 * tests that need it.
 */
export function trimDescription(s, maxLen = Infinity) {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1).trimEnd() + "…";
}

/**
 * Cadence ordering: weekly < bi-weekly < monthly < quarterly < yearly.
 * Unknown cadences fall to the end, sorted alphabetically.
 */
const CADENCE_ORDER = [
  "daily",
  "weekly",
  "bi-weekly",
  "biweekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "yearly",
  "annually",
];

export function compareCadence(a, b) {
  const ai = CADENCE_ORDER.indexOf(a);
  const bi = CADENCE_ORDER.indexOf(b);
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  return a.localeCompare(b);
}

/**
 * Read every `*-*.md` file in `dir` (defaults to docs/initiatives/), parse
 * each Carry-over block, and emit a flat list of items annotated with the
 * source initiative's filename and short title.
 */
export function collectFollowUps(dir = INITIATIVES_DIR) {
  const files = readdirSync(dir)
    .filter((f) => RE_INITIATIVE_FILE.test(f))
    .sort();

  const items = [];
  for (const file of files) {
    const path = join(dir, file);
    const content = readFileSync(path, "utf8");
    const titleMatch = RE_H1.exec(content);
    const title = titleMatch ? titleMatch[1].trim() : file.replace(/\.md$/, "");
    const block = sliceCarryOverBlock(content);
    if (!block) continue;
    const bullets = parseCarryOverBullets(block);
    for (const b of bullets) {
      items.push({ file, title, ...b });
    }
  }
  return items;
}

/**
 * Build the consolidated follow-ups markdown. Pure (no I/O).
 *
 * Sections, in order:
 *   1. One-shot (3 ordered groups: dated → trigger-based → tbd)
 *   2. Recurring
 *
 * `today` is overridable for tests; default = current UTC date.
 */
export function renderFollowUps(items, { today = todayISO() } = {}) {
  const dated = items
    .filter((i) => i.kind === "one-shot-dated")
    .sort((a, b) => a.key.localeCompare(b.key) || a.file.localeCompare(b.file));
  const triggered = items
    .filter((i) => i.kind === "trigger")
    .sort(
      (a, b) =>
        a.key.localeCompare(b.key, undefined, { sensitivity: "base" }) ||
        a.file.localeCompare(b.file),
    );
  const tbd = items
    .filter((i) => i.kind === "tbd")
    .sort((a, b) => a.file.localeCompare(b.file));
  const recurring = items
    .filter((i) => i.kind === "recurring")
    .sort(
      (a, b) => compareCadence(a.key, b.key) || a.file.localeCompare(b.file),
    );

  const lines = [];
  lines.push("# Initiative follow-ups");
  lines.push("");
  lines.push(
    // Stamp the canonical owner handle (matches the pattern used by the
    // sibling generator `generate-hard-rules-matrix.mjs`). The husky hook
    // `bump-last-validated.mjs` rewrites the handle on commit to the
    // committer's resolved handle, so any value that does not match what
    // the hook will produce causes the `--check` CI gate to flag drift.
    // `excludeGlobs` would normally let the hook skip this file, but it
    // matches relative paths only and lint-staged invokes the hook with
    // absolute paths — so we keep both belts AND suspenders by stamping
    // the same handle the hook would.
    `> **Last validated:** ${today} by @Skords-01. **Next review:** ${addDays(today, 90)}.`,
  );
  lines.push("> **Status:** Active");
  lines.push("");
  lines.push(
    "<!-- AUTO-GENERATED FILE. Do not edit by hand. Regenerate via `pnpm docs:gen-initiative-followups`. -->",
  );
  lines.push("");
  lines.push(
    "Зведений календар відкритих follow-up-ів з усіх ініціатив у [`docs/initiatives/`](./README.md). Source = `### Carry-over → successor` блок у кожному файлі (тільки `- [ ]`-пункти; checked-off — історія, в індекс не йдуть).",
  );
  lines.push("");
  lines.push(
    "Перевірка свіжості — `pnpm docs:check-initiative-followups` (CI gate). Формат пунктів — у [`README.md` § Carry-over format](./README.md#carry-over-format).",
  );
  lines.push("");

  // ── One-shot ──────────────────────────────────────────────────────────────
  lines.push("## One-shot");
  lines.push("");
  if (dated.length + triggered.length + tbd.length === 0) {
    lines.push("_Жодного відкритого one-shot follow-up-у._");
    lines.push("");
  } else {
    lines.push("| Due | Initiative | Item |");
    lines.push("| --- | ---------- | ---- |");
    for (const i of dated) {
      const overdue = i.key < today ? " ⚠ overdue" : "";
      lines.push(
        `| \`${i.key}\`${overdue} | ${initiativeLink(i)} | ${tableCell(i.description)} |`,
      );
    }
    for (const i of triggered) {
      lines.push(
        `| _${tableCell(i.key)}_ | ${initiativeLink(i)} | ${tableCell(i.description)} |`,
      );
    }
    for (const i of tbd) {
      lines.push(`| — | ${initiativeLink(i)} | ${tableCell(i.description)} |`);
    }
    lines.push("");
    lines.push(
      "Колонка `Due` — ISO-дата для дат-driven items (`⚠ overdue` на минулі), курсивом — trigger-based phrase (`Після baseline-week`, `When …`), `—` = unscheduled (TBD).",
    );
    lines.push("");
  }

  // ── Recurring ─────────────────────────────────────────────────────────────
  lines.push("## Recurring");
  lines.push("");
  if (recurring.length === 0) {
    lines.push("_Жодного recurring-чека._");
    lines.push("");
  } else {
    lines.push("| Cadence | Initiative | Item |");
    lines.push("| ------- | ---------- | ---- |");
    for (const i of recurring) {
      lines.push(
        `| \`${tableCell(i.key)}\` | ${initiativeLink(i)} | ${tableCell(i.description)} |`,
      );
    }
    lines.push("");
  }

  // ── Format reminder ───────────────────────────────────────────────────────
  lines.push("## How to add a follow-up");
  lines.push("");
  lines.push(
    "Додайте top-level bullet до `### Carry-over → successor` секції відповідної ініціативи, дотримуючись формату:",
  );
  lines.push("");
  lines.push("```markdown");
  lines.push(
    "- [ ] **2026-05-12:** description …            # one-shot, due-date",
  );
  lines.push(
    "- [ ] **Recurring (weekly):** description …    # recurring check",
  );
  lines.push("- [ ] **Після baseline-week:** description …   # trigger-based");
  lines.push(
    "- [ ] description …                            # TBD (catch-all)",
  );
  lines.push("```");
  lines.push("");
  lines.push(
    "Збережіть файл, виконайте `pnpm docs:gen-initiative-followups`, закомітьте змінений `follow-ups.md` у тому самому PR-і. CI гейт `Initiative follow-ups (in sync)` перевіряє, що згенерована версія = checked-in версія.",
  );
  lines.push("");

  return lines.join("\n");
}

function initiativeLink(item) {
  // `item.file` may be `NNNN-slug.md` or `_NNNN-slug.md` for completed
  // initiatives. Strip the optional leading `_` when extracting the id.
  const m = /^_?(\d{4})/.exec(item.file);
  const num = m ? m[1] : item.file.slice(0, 4);
  return `[${num}](./${item.file})`;
}

/**
 * Format markdown with the repo's Prettier config. Mirrors the
 * `generate-hard-rules-matrix.mjs` pattern so on-disk output matches
 * `pnpm format:check`.
 */
export async function formatMarkdown(content) {
  const { default: prettier } = await import("prettier");
  const opts = (await prettier.resolveConfig(OUTPUT_PATH)) ?? {};
  return prettier.format(content, { ...opts, parser: "markdown" });
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const args = process.argv.slice(2);
  const items = collectFollowUps();
  const raw = renderFollowUps(items);
  const next = await formatMarkdown(raw);

  if (args.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(OUTPUT_PATH, "utf8");
    } catch {
      // missing file — treated as a diff
    }
    if (current !== next) {
      console.error(
        `${OUTPUT_PATH} is out of date. Run \`pnpm docs:gen-initiative-followups\` and commit.`,
      );
      process.exit(1);
    }
    console.log(
      `${OUTPUT_PATH} is up to date (${items.length} open follow-up${items.length === 1 ? "" : "s"}).`,
    );
    process.exit(0);
  }

  writeFileSync(OUTPUT_PATH, next);
  console.log(
    `Wrote ${OUTPUT_PATH} — ${items.length} open follow-up${items.length === 1 ? "" : "s"}.`,
  );
}
