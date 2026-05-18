#!/usr/bin/env node
// scripts/docs/generate-open-work.mjs
//
// Scan every tracker directory under `docs/` for markdown files with a
// canonical `> **Status:** …` header, classify each Status as
// `open` / `closed` / `reference`, and generate
// `docs/open-work.md` — a single-pane index of all *open* work across
// every tracker, grouped by tracker. Auto-extracts PR mentions
// (`#NNNN` — 3+ digit numbers in the doc body) into a `PR-згадки` column.
//
// Single source of truth for «що в цьому репо зараз НЕ доробленого?»
// — answers the question without touring 6+ tracker READMEs.
//
// Trackers (in display order; configured via `TRACKERS` below):
//   1. Initiatives                — docs/initiatives/ (+ stack-pulse-2026-05/)
//   2. Planning                   — docs/planning/
//   3. Launch                     — docs/launch/business/ + tech/ + product-os/
//   4. Audits                     — docs/audits/
//   5. Security hardening         — docs/security/hardening/
//   6. Tech debt                  — docs/tech-debt/
//   7. Superpowers / plans        — docs/superpowers/plans/
//
// For each tracker the script emits a markdown table with three columns:
//   | Документ | Статус | PR-згадки |
//
// `PR-згадки` is a deduped, ascending-sorted list of `#NNNN` mentions
// extracted from the document body. The generator does not call GitHub,
// so this column is a navigation aid, not live open/closed PR status.
//
// Status classification (operates on the text after `> **Status:**`,
// stripped of leading `**`/whitespace, case-insensitive):
//   - **open**       — Active / Draft / In progress / Scaffolded / Open /
//                      Planned / Phase * (multi-phase markers always
//                      treated as open — there is still work in flight)
//   - **closed**     — Closed / Done / Archived / Implemented
//   - **reference**  — Frozen / Reference / "Аналіз" / "не потребує дій" /
//                      Superseded
//   - **unknown**    — anything else (still surfaced as open with a
//                      `?` marker so authors notice and fix the header)
//
// Usage:
//   node scripts/docs/generate-open-work.mjs            # write
//   node scripts/docs/generate-open-work.mjs --check    # CI gate
//
// Exits 1 on `--check` diff or I/O error.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");
const OUTPUT_PATH = resolve(REPO_ROOT, "docs/open-work.md");
const OUTPUT_DIR = dirname(OUTPUT_PATH);

// ── Regexes ─────────────────────────────────────────────────────────────────

const RE_H1 = /^#\s+(.+?)\s*$/m;
// `> **Status:**` line — captures everything after the marker until end of
// the line (statuses are often multi-clause, e.g.
// «In progress (Phase 1 landed; Phase 2 pending coordination)»).
const RE_STATUS = /^>\s*\*\*Status:\*\*\s*(.+?)\s*$/m;
// PR mention: `#NNNN` with 3-5 digits, optionally wrapped in `[]()`
// markdown link or preceded by `PR` / `pull/`. The 3-digit minimum filters
// out enumerations like `#1`–`#5 у списку`; the 5-digit ceiling avoids
// treating hex colors like `#171412` as GitHub PR links.
const RE_PR_NUMBER = /#(\d{3,5})(?!\d)|\/pull\/(\d{3,5})(?!\d)/g;

// ── Tracker configuration ───────────────────────────────────────────────────

/**
 * Each tracker is one section in the generated dashboard. Fields:
 *   - id         — short slug used in section anchors
 *   - title      — markdown H2 (section heading)
 *   - rootDir    — directory under `REPO_ROOT` to scan
 *   - blurb      — one-line description shown under the H2
 *   - recursive  — descend into subdirectories (default: false)
 *   - exclude    — array of relative-to-rootDir glob-ish substrings that
 *                  short-circuit a file out of the scan; matched against
 *                  the file's path relative to `rootDir` with forward slashes
 *
 * Files filtered universally (in `shouldSkipFile`):
 *   - README.md, follow-ups.md, open-work.md
 *   - any path containing `/archive/`
 *   - filenames starting with `_` (completed-prefix convention used in
 *     `docs/initiatives/`, see initiatives README.md § Completed-prefix)
 */
export const TRACKERS = [
  {
    id: "initiatives",
    title: "Ініціативи",
    blurb:
      "Нумеровані multi-PR ініціативи з acceptance criteria. Source: [`docs/initiatives/`](./initiatives/README.md).",
    rootDir: "docs/initiatives",
    recursive: true,
  },
  {
    id: "planning",
    title: "Планування",
    blurb:
      "Активні roadmap-и, research, decision-rationale. Source: [`docs/planning/`](./planning/README.md).",
    rootDir: "docs/planning",
    recursive: false,
  },
  {
    id: "launch",
    title: "Launch / запуск",
    blurb:
      "GTM, монетизація, FTUX delivery і product-surface roadmap-и. Source: [`docs/launch/`](./launch/README.md).",
    rootDir: "docs/launch",
    recursive: true,
  },
  {
    id: "audits",
    title: "Аудити й прожарки",
    blurb:
      "Прожарки, аудити та implementation roadmap-и. Source: [`docs/audits/`](./audits/README.md).",
    rootDir: "docs/audits",
    recursive: false,
  },
  {
    id: "security-hardening",
    title: "Security hardening",
    blurb:
      "Картки по окремих findings (C/H/M/L/I severity) + sprint plans. Source: [`docs/security/hardening/`](./security/hardening/README.md).",
    rootDir: "docs/security/hardening",
    recursive: false,
  },
  {
    id: "tech-debt",
    title: "Техборг",
    blurb:
      "Реєстри боргу по платформах (backend / frontend / mobile). Source: [`docs/tech-debt/`](./tech-debt/README.md).",
    rootDir: "docs/tech-debt",
    recursive: false,
  },
  {
    id: "superpowers-plans",
    title: "Superpowers — плани впровадження",
    blurb:
      "Плани впровадження cross-cutting capabilities. Source: [`docs/superpowers/plans/`](./superpowers/README.md).",
    rootDir: "docs/superpowers/plans",
    recursive: true,
  },
];

// ── Pure helpers (exported for tests) ───────────────────────────────────────

/**
 * Strip leading bold markers (`**`), italic markers (`*`/`_`), and
 * whitespace from the start of the status text. This lets us match
 * `Closed`, `**Closed (…)**`, `_Active_` etc. with the same regex.
 */
export function stripStatusPrefix(text) {
  return String(text).replace(/^[\s*_]+/, "");
}

/**
 * Classify a Status string into one of `open` | `closed` | `reference` |
 * `unknown`. The order of checks matters: closed/reference markers win
 * over open markers when both could plausibly apply (e.g.
 * `Closed (some Active items deferred)` → closed).
 */
export function classifyStatus(rawStatus) {
  if (!rawStatus) return "unknown";
  const t = stripStatusPrefix(rawStatus);
  const lower = t.toLowerCase();

  // Reference / informational — work tracked elsewhere or no action needed.
  if (/^frozen\b/i.test(t)) return "reference";
  if (/^reference\b/i.test(t)) return "reference";
  if (/^superseded\b/i.test(t)) return "reference";
  if (/^аналіз\b/i.test(t)) return "reference";
  if (/не\s+потребує\s+дій/i.test(lower)) return "reference";

  // Closed — work shipped / abandoned. We accept both the canonical
  // single-word form AND mid-sentence variants like
  // `Closed — merged [#NNNN]` (still starts with "Closed").
  if (/^closed\b/i.test(t)) return "closed";
  if (/^done\b/i.test(t)) return "closed";
  if (/^archived\b/i.test(t)) return "closed";
  if (/^implemented\b/i.test(t)) return "closed";

  // Open — work still in flight.
  if (/^active\b/i.test(t)) return "open";
  if (/^draft\b/i.test(t)) return "open";
  if (/^in\s+progress\b/i.test(t)) return "open";
  if (/^scaffolded\b/i.test(t)) return "open";
  if (/^open\b/i.test(t)) return "open";
  if (/^planned\b/i.test(t)) return "open";
  // Multi-phase status (`Phase 1 ✅ done; Phase 2 blocked`) — surface as
  // open because at least one phase is unfinished.
  if (/^phase\s*\d/i.test(t)) return "open";

  return "unknown";
}

/**
 * Extract a deduped, ascending-sorted list of PR numbers mentioned in
 * `content`. Only `#NNNN` with 3-5 digits is recognised — see
 * `RE_PR_NUMBER` comment for rationale.
 */
export function extractPRNumbers(content) {
  if (!content) return [];
  const seen = new Set();
  for (const m of content.matchAll(RE_PR_NUMBER)) {
    const num = m[1] || m[2];
    if (num) seen.add(Number(num));
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * Should the file at `relPath` (relative to repo root) be excluded from
 * the open-work scan? Universally-excluded filenames (README, follow-ups,
 * open-work, _-prefix, archive/) live here.
 */
export function shouldSkipFile(relPath) {
  const fwd = relPath.split(sep).join("/");
  const base = fwd.split("/").pop();
  if (base === "README.md") return true;
  if (base === "follow-ups.md") return true;
  if (base === "open-work.md") return true;
  if (base.startsWith("_")) return true;
  if (fwd.includes("/archive/")) return true;
  return false;
}

/**
 * Walk `dir` collecting `.md` files. When `recursive` is false, only the
 * top level is read; archive/ is always pruned even with `recursive=true`
 * to avoid scanning historical material.
 */
export function listMarkdown(dir, { recursive = false } = {}) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const childPath = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!recursive) continue;
      if (ent.name === "archive") continue;
      out.push(...listMarkdown(childPath, { recursive }));
      continue;
    }
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith(".md")) continue;
    out.push(childPath);
  }
  return out.sort();
}

/**
 * Parse a single document's open-work record:
 *   - title       — H1 title (fallback: filename without `.md`)
 *   - rawStatus   — text after `> **Status:**` on first line of that block
 *   - status      — classified bucket (`open` | `closed` | `reference` | `unknown`)
 *   - prs         — deduped sorted PR numbers from the body
 *
 * Returns `null` if the file has no `> **Status:**` header (such files
 * are silently skipped — Rule #10 requires the marker but enforcement
 * is its own gate, not this one).
 */
export function parseDocument(absPath) {
  const content = readFileSync(absPath, "utf8");
  const statusMatch = RE_STATUS.exec(content);
  if (!statusMatch) return null;
  const titleMatch = RE_H1.exec(content);
  const fallbackTitle = absPath.split(/[\\/]/).pop().replace(/\.md$/, "");
  const title = titleMatch ? titleMatch[1].trim() : fallbackTitle;
  const rawStatus = statusMatch[1].trim();
  return {
    title,
    rawStatus,
    status: classifyStatus(rawStatus),
    prs: extractPRNumbers(content),
  };
}

/**
 * Collect open-work entries across every configured tracker. Returns a
 * map keyed by tracker id with `{ tracker, entries }` values; `entries`
 * is sorted by file path for deterministic output.
 */
export function collectOpenWork(repoRoot = REPO_ROOT, trackers = TRACKERS) {
  const result = [];
  for (const tracker of trackers) {
    const rootAbs = resolve(repoRoot, tracker.rootDir);
    const files = listMarkdown(rootAbs, { recursive: tracker.recursive });
    const entries = [];
    for (const abs of files) {
      const relToRoot = relative(repoRoot, abs).split(sep).join("/");
      if (shouldSkipFile(relToRoot)) continue;
      const doc = parseDocument(abs);
      if (!doc) continue;
      if (doc.status === "closed" || doc.status === "reference") continue;
      // Rewrite any relative markdown links inside the status text so
      // they remain valid after we paste the text into `docs/open-work.md`.
      // `outputRelPath` is always `docs/open-work.md` (the dashboard's
      // canonical location); kept as a constant rather than read from
      // `OUTPUT_PATH` so the function stays pure for unit tests.
      const outputRelPath = "docs/open-work.md";
      const rewrittenStatus = rewriteRelativeLinks(
        doc.rawStatus,
        relToRoot,
        outputRelPath,
      );
      entries.push({
        relPath: relToRoot,
        // Path relative to the output file's directory (`docs/`), used to
        // build navigation links that work from `docs/open-work.md`.
        linkPath: relative(OUTPUT_DIR, abs).split(sep).join("/"),
        relToRootDir: relative(rootAbs, abs).split(sep).join("/"),
        ...doc,
        rawStatus: rewrittenStatus,
      });
    }
    result.push({ tracker, entries });
  }
  return result;
}

// ── Markdown rendering ──────────────────────────────────────────────────────

function escapePipes(s) {
  return String(s).replace(/\|/g, "\\|");
}

function tableCell(s) {
  return escapePipes(String(s).replace(/\r?\n/g, " ")).trim();
}

/** Truncate long statuses so the table stays scannable. */
export function truncateStatus(status, maxLen = 180) {
  const flat = String(status).replace(/\r?\n/g, " ").trim();
  if (flat.length <= maxLen) return flat;
  return flat.slice(0, maxLen - 1).trimEnd() + "…";
}

/**
 * Rewrite `[text](relative-path)` markdown links inside `text` so they
 * remain valid when the surrounding text is copied from `srcRelPath`
 * (a path relative to repo root) into `dstRelPath` (also relative to
 * repo root).
 *
 * Only relative paths that contain a path separator or look like a file
 * reference are rewritten. Anchor-only (`#section`), absolute (`/foo`),
 * and protocol URLs (`https://`, `mailto:`) are left untouched.
 *
 * This avoids broken-link CI errors in `docs/open-work.md` for status
 * fields that contain relative links like `[ftux-master-tracker §3.4](./ftux-master-tracker.md#…)`
 * — the source doc lived under `docs/launch/product-os/` but the
 * dashboard lives at `docs/`, so `./ftux-master-tracker.md` no longer
 * resolves.
 */
export function rewriteRelativeLinks(text, srcRelPath, dstRelPath) {
  if (!text || !srcRelPath || !dstRelPath) return text;
  const srcDir = dirname(srcRelPath);
  const dstDir = dirname(dstRelPath);
  // Markdown inline link: `[text](url)` — url stops at the first `)`
  // that is not escaped. We don't handle reference-style links because
  // status text is always a single line.
  return String(text).replace(
    /(\[[^\]]*\])\(([^)\s]+)([^)]*?)\)/g,
    (full, label, url, suffix) => {
      // Pass through anything that's not a relative file reference.
      if (!url) return full;
      if (/^[a-z]+:/i.test(url)) return full; // protocol (https:, mailto:, …)
      if (url.startsWith("#")) return full; // pure anchor
      if (url.startsWith("/")) return full; // already root-relative

      // Split path / anchor.
      const hashIdx = url.indexOf("#");
      const path = hashIdx === -1 ? url : url.slice(0, hashIdx);
      const anchor = hashIdx === -1 ? "" : url.slice(hashIdx);
      if (!path) return full;

      // Resolve source-relative path to repo-root-relative (purely
      // string manipulation — no fs access — so this stays pure for
      // unit tests with synthetic repo roots), then make it relative to
      // the destination file's directory.
      const repoRel = join(srcDir, path).split(sep).join("/");
      let newRel = relative(dstDir, repoRel).split(sep).join("/");
      if (!newRel.startsWith(".") && !newRel.startsWith("/")) {
        newRel = "./" + newRel;
      }
      return `${label}(${newRel}${anchor}${suffix})`;
    },
  );
}

/** Format PR numbers as a list of markdown links to github.com/Skords-01/Sergeant. */
export function formatPRLinks(prs, { maxShown = 10 } = {}) {
  if (prs.length === 0) return "—";
  const visible = prs.slice(0, maxShown);
  const linked = visible.map(
    (n) => `[#${n}](https://github.com/Skords-01/Sergeant/pull/${n})`,
  );
  if (prs.length > maxShown) {
    linked.push(`+${prs.length - maxShown}`);
  }
  return linked.join(" ");
}

/** Markdown table row for one entry. */
function renderRow(entry) {
  const docLink = `[\`${entry.relToRootDir}\`](./${entry.linkPath})`;
  const statusCell = tableCell(truncateStatus(entry.rawStatus));
  const marker = entry.status === "unknown" ? " ❓" : "";
  return `| ${docLink} | ${statusCell}${marker} | ${formatPRLinks(entry.prs)} |`;
}

/** Today as YYYY-MM-DD in UTC (mirrors check-freshness.mjs). */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Add `days` calendar days to an ISO date (mirrors check-freshness.mjs). */
export function addDays(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Sum total open + unknown entries across all trackers. */
export function totalOpen(sections) {
  return sections.reduce((acc, s) => acc + s.entries.length, 0);
}

/**
 * Render the full open-work dashboard. Pure (no I/O).
 *
 * `today` is overridable for tests; default = current UTC date.
 */
export function renderOpenWork(sections, { today = todayISO() } = {}) {
  const lines = [];
  lines.push("# Відкрита робота — єдиний дашборд");
  lines.push("");
  // The husky hook `bump-last-validated.mjs` rewrites the committer
  // handle on commit, so match the canonical value the hook will produce.
  // Cadence mirrors `generate-initiative-followups.mjs` (90 days).
  lines.push(
    `> **Last validated:** ${today} by @codex. **Next review:** ${addDays(today, 90)}.`,
  );
  lines.push("> **Status:** Active");
  lines.push("");
  lines.push(
    "<!-- AUTO-GENERATED FILE. Do not edit by hand. Regenerate via `pnpm docs:gen-open-work`. -->",
  );
  lines.push("");
  lines.push(
    "Зведений single-pane view усього, що зараз НЕ доробленого у репо — згрупований по 7 трекерах. Source = `> **Status:**` header у кожному документі (Rule #10 lifecycle marker). У дашборд потрапляють документи зі статусами `Active` / `Draft` / `In progress` / `Scaffolded` / `Open` / `Planned` / `Phase *`. Документи зі статусом `Closed` / `Done` / `Archived` / `Implemented` / `Reference` / `Frozen` — виключені.",
  );
  lines.push("");
  lines.push(
    "Перевірка свіжості — `pnpm docs:check-open-work` (CI gate). Щоб додати власний трекер — додай запис у `TRACKERS` у [`scripts/docs/generate-open-work.mjs`](../scripts/docs/generate-open-work.mjs).",
  );
  lines.push("");
  lines.push(
    "**Колонки.** `Документ` — шлях відносно директорії трекера. `Статус` — повний текст `Status:` хедера (truncated до 180 символів; `❓` = `unknown` бакет, треба полагодити header). `PR-згадки` — auto-extracted `#NNNN` згадки (≥3 цифри, deduped, sorted ascending; перші 10 показано). Це навігаційні згадки з документа, не live-стан GitHub PR.",
  );
  lines.push("");

  // ── Summary line ──────────────────────────────────────────────────────────
  const total = totalOpen(sections);
  const perTracker = sections
    .map((s) => `${s.tracker.title}: **${s.entries.length}**`)
    .join(" · ");
  lines.push(`**Усього відкритих документів:** **${total}** — ${perTracker}.`);
  lines.push("");

  for (const section of sections) {
    lines.push(`## ${section.tracker.title} (${section.entries.length})`);
    lines.push("");
    lines.push(`> ${section.tracker.blurb}`);
    lines.push("");
    if (section.entries.length === 0) {
      lines.push("_Жодного відкритого документа._");
      lines.push("");
      continue;
    }
    lines.push("| Документ | Статус | PR-згадки |");
    lines.push("| -------- | ------ | --------- |");
    for (const entry of section.entries) {
      lines.push(renderRow(entry));
    }
    lines.push("");
  }

  // ── Footer / how-to ──────────────────────────────────────────────────────
  lines.push("## Як додати документ у дашборд");
  lines.push("");
  lines.push(
    "Документ автоматично з'являється тут, якщо: (1) лежить під одним із трекерів зі списку вище, (2) має `> **Status:**` header з відкритим статусом (Active / Draft / In progress / Scaffolded / Open / Planned / Phase *), (3) не є README.md / follow-ups.md / open-work.md і не лежить під `archive/` (і не починається з `_`).",
  );
  lines.push("");
  lines.push("Після зміни статусу:");
  lines.push("");
  lines.push("```bash");
  lines.push(
    "pnpm docs:gen-open-work        # перегенерувати docs/open-work.md",
  );
  lines.push(
    "pnpm docs:check-open-work      # перевірити, що commited версія актуальна (CI gate)",
  );
  lines.push("```");
  lines.push("");
  lines.push(
    "CI гейт `Open work (in sync)` падає, якщо commited `docs/open-work.md` ≠ згенерована версія. Це нормальний flow: правиш `> **Status:**` у документі → запускаєш `pnpm docs:gen-open-work` → комітиш обидва файли разом.",
  );
  lines.push("");

  return lines.join("\n");
}

/**
 * Format markdown with the repo's Prettier config. Mirrors the
 * `generate-initiative-followups.mjs` pattern so on-disk output matches
 * `pnpm format:check`. Lazy-loaded so unit tests can run without
 * `node_modules`.
 */
export async function formatMarkdown(content) {
  const { default: prettier } = await import("prettier");
  const opts = (await prettier.resolveConfig(OUTPUT_PATH)) ?? {};
  return prettier.format(content, { ...opts, parser: "markdown" });
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const args = process.argv.slice(2);
  const sections = collectOpenWork();
  const raw = renderOpenWork(sections);
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
        `${OUTPUT_PATH} is out of date. Run \`pnpm docs:gen-open-work\` and commit.`,
      );
      process.exit(1);
    }
    console.log(
      `${OUTPUT_PATH} is up to date (${totalOpen(sections)} open document${totalOpen(sections) === 1 ? "" : "s"} across ${sections.length} tracker${sections.length === 1 ? "" : "s"}).`,
    );
    process.exit(0);
  }

  writeFileSync(OUTPUT_PATH, next);
  console.log(
    `Wrote ${OUTPUT_PATH} — ${totalOpen(sections)} open document${totalOpen(sections) === 1 ? "" : "s"} across ${sections.length} tracker${sections.length === 1 ? "" : "s"}.`,
  );
}
