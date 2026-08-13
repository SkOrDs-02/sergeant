// scripts/docs/freshness-config.mjs
//
// Shared config + loader for the doc-freshness system.
//
// Goal (PR-12.B): the list of tracked docs is **derived** from the repo, not
// hand-maintained. Any markdown file with a canonical `> **Last validated:**`
// header is automatically tracked at the default cadence; per-file overrides
// (e.g. 60-day cadence for runbooks, 180-day for ADR-grade specs) live in
// `freshness-config.json`. The legacy `freshness-allowlist.json` is still
// honoured as a fallback so the migration can be split across PRs.
//
// All exports are pure for unit-testability — no fs / git side effects in
// this module's pure helpers; the file-system entry point is `loadConfig`.

import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");

export const DEFAULT_CADENCE_DAYS = 90;
export const FRESHNESS_HEADER_RE = /^>\s*\*\*Last (?:validated|touched):\*\*/m;

const CONFIG_PATH = resolve(__dirname, "freshness-config.json");
const LEGACY_ALLOWLIST_PATH = resolve(__dirname, "freshness-allowlist.json");

// ── Glob → regex (intentionally minimal) ─────────────────────────────────────
//
// Supported syntax: `**` (any depth), `*` (single segment, no `/`), literal
// strings. That's enough for our patterns (`docs/04-governance/adr/**`, `**/_partials/**`,
// `**/TEMPLATE*.md`, exact paths). We deliberately avoid pulling in a glob
// dependency for a 30-line script.

/** Convert a glob pattern to a RegExp. Internal — exported for tests. */
export function globToRegex(glob) {
  // Escape regex special chars except `*` (we'll handle those after).
  let re = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      // Look ahead for `**`.
      if (glob[i + 1] === "*") {
        // `**/` matches zero or more path segments; `**` alone matches any chars.
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 3;
          continue;
        }
        re += ".*";
        i += 2;
        continue;
      }
      // Single `*` = anything except `/`.
      re += "[^/]*";
      i += 1;
      continue;
    }
    if (c === "?") {
      re += "[^/]";
      i += 1;
      continue;
    }
    // Literal — escape regex metas.
    re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    i += 1;
  }
  return new RegExp("^" + re + "$");
}

/** Returns true if `path` matches any of the glob patterns. */
export function matchesAnyGlob(path, globs) {
  for (const g of globs) {
    if (globToRegex(g).test(path)) return true;
  }
  return false;
}

// ── Cadence resolution ───────────────────────────────────────────────────────
//
// `cadenceOverrides` accepts BOTH exact paths and globs. Precedence:
//   1. exact path match (most specific — an individual doc always wins);
//   2. longest matching glob (a deeper prefix beats a shallower one, so
//      `docs/02-engineering/notes/**` wins over `docs/02-engineering/**`);
//   3. `defaultCadenceDays`.
//
// Ties in glob length are resolved by declaration order in the JSON — but a
// tie means two equally-specific rules disagree, which is a config smell, not
// something to rely on.

/** Resolve the cadence in days for one path. */
export function cadenceForPath(path, config) {
  const overrides = config.cadenceOverrides || {};
  const exact = overrides[path];
  if (typeof exact === "number") return exact;

  let best = null;
  let bestLen = -1;
  for (const [pattern, days] of Object.entries(overrides)) {
    if (typeof days !== "number") continue;
    if (!pattern.includes("*")) continue; // exact paths handled above
    if (!globToRegex(pattern).test(path)) continue;
    if (pattern.length > bestLen) {
      best = days;
      bestLen = pattern.length;
    }
  }
  if (best != null) return best;
  return config.defaultCadenceDays ?? DEFAULT_CADENCE_DAYS;
}

/**
 * Deterministic 0..⌊cadence/3⌋ offset added on top of the cadence when a
 * doc's next review date is derived.
 *
 * Why this exists. Nothing about the calendar forces docs to come due
 * together — but stamping does. A batch edit (a rename sweep, a generator
 * run, a mass bump) writes the same `Last touched` into dozens of files, and
 * exactly one cadence later they all go overdue on the SAME day. Measured on
 * this repo 2026-08-13: 195 docs pointed at a single date, and the previous
 * cohort of 47 had likewise been stamped together in May. A wall that big
 * cannot be reviewed, so it gets rolled forward wholesale — which just rebuilds
 * the wall, bigger. Spreading breaks the cohort into a queue.
 *
 * The offset only ever ADDS days, so no doc is reviewed sooner than its
 * cadence promises. It is derived from the path (FNV-1a), so it is stable:
 * the same doc always lands on the same offset, and a re-stamp is idempotent.
 */
export function reviewJitterDays(path, cadenceDays) {
  const span = Math.max(1, Math.floor(cadenceDays / 3));
  let h = 2166136261;
  for (let i = 0; i < path.length; i++) {
    h ^= path.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % span;
}

/** Add `days` calendar days to an ISO date string (UTC). */
export function addDaysISO(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The canonical `Next review` for a doc: last-touch + cadence + spread.
 * Single source of truth for the bumper, the re-stamp script and the gate's
 * fallback, so all three agree.
 */
export function nextReviewFor(path, lastTouchedISO, config) {
  const cadence = cadenceForPath(path, config);
  return addDaysISO(lastTouchedISO, cadence + reviewJitterDays(path, cadence));
}

// ── Lifecycle status ─────────────────────────────────────────────────────────

/**
 * Statuses that take a doc OFF the review calendar entirely.
 *
 * A calendar asks «is this still true?». For a finished or frozen document
 * the question has no answer worth acting on: a postmortem, a shipped plan or
 * an archived spike describes a moment that will not change, so a review date
 * only ever produces noise. Rule #10 already makes every doc declare its
 * status; this makes the gate believe it.
 *
 * Note the obvious lever: flipping one word silences the gate for that file.
 * That is deliberate and bounded — `check-lifecycle-markers.mjs` validates the
 * vocabulary, the status is visible in the diff, and a doc marked finished
 * that is not finished is a lie about the doc, which review cannot catch
 * either way.
 */
export const TERMINAL_STATUSES = new Set([
  "archived",
  "superseded",
  "done",
  "deprecated",
  "closed",
]);

const RE_STATUS = /\*\*Status:\*\*\s*([^\s.,—–-]+)/;

/** Parse the lifecycle status from a doc's header block. Lower-cased. */
export function parseLifecycleStatus(content, lineLimit = 15) {
  const head = content.split("\n").slice(0, lineLimit).join("\n");
  const m = RE_STATUS.exec(head);
  return m ? m[1].toLowerCase() : null;
}

/** True when the doc's status takes it off the review calendar. */
export function isOffCalendar(content, lineLimit = 15) {
  const status = parseLifecycleStatus(content, lineLimit);
  return status != null && TERMINAL_STATUSES.has(status);
}

// ── Config defaults ──────────────────────────────────────────────────────────
//
// These ship with the repo so a brand-new `.md` file is automatically tracked
// without any config change. Override at `freshness-config.json` if your repo
// layout diverges.

export const DEFAULT_CONFIG = {
  defaultCadenceDays: DEFAULT_CADENCE_DAYS,
  scanGlobs: ["**/*.md"],
  excludeGlobs: [
    // Generated / vendored
    "node_modules/**",
    "**/node_modules/**",
    ".turbo/**",
    "dist/**",
    "**/dist/**",
    "coverage/**",
    "**/coverage/**",
    // ADR are immutable — see docs/04-governance/governance/doc-freshness.md § "Свідомо виключено"
    "docs/04-governance/adr/**",
    // Templates / index files are not "validated docs"
    "**/_TEMPLATE*.md",
    "**/TEMPLATE*.md",
    "docs/00-start/playbooks/INDEX.md",
    // Skill / agent libraries shipped from upstream — owned outside this repo's
    // documentation cadence
    ".agents/**",
    ".claude/**",
    // GitHub UI templates (PR / issue forms) — versioned with their handlers,
    // not on a calendar cadence
    ".github/**",
    // Package- and app-level READMEs are code documentation, not governance
    // docs. Add an explicit override in `freshness-config.json` if you want a
    // specific README on the cadence.
    "apps/**/README.md",
    "packages/**/README.md",
    "ops/**/README.md",
    // Те саме й для `scripts/**` — README біля одноразових codemod-ів
    // описує скрипти, а не політику. Пропущено при первинному складанні
    // цього списку, тож два такі README сиділи на governance-каденції.
    "scripts/**/README.md",
    // AI-prompt fragments (system prompts, agent definitions) — versioned with
    // their consumers
    "apps/server/src/ai-prompts/**",
    "apps/mobile/docs/**",
    "apps/mobile/e2e/**",
  ],
  cadenceOverrides: {},
  // Files that MUST be tracked even if they don't currently have a header.
  // Use sparingly — the canonical approach is to add the header.
  explicitInclude: [],
  // Files that are intentionally excluded even if they pass the scan (e.g. a
  // README that delegates to another doc). Use sparingly.
  explicitExclude: [],
};

// ── Loaders ──────────────────────────────────────────────────────────────────

/** Read the JSON config file (if present) and merge with DEFAULT_CONFIG. */
export function readConfigFile(path = CONFIG_PATH) {
  if (!existsSync(path)) return { ...DEFAULT_CONFIG };
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    excludeGlobs: [...DEFAULT_CONFIG.excludeGlobs, ...(raw.excludeGlobs || [])],
    cadenceOverrides: {
      ...DEFAULT_CONFIG.cadenceOverrides,
      ...(raw.cadenceOverrides || {}),
    },
    explicitInclude: [
      ...DEFAULT_CONFIG.explicitInclude,
      ...(raw.explicitInclude || []),
    ],
    explicitExclude: [
      ...DEFAULT_CONFIG.explicitExclude,
      ...(raw.explicitExclude || []),
    ],
  };
}

/**
 * Read the legacy `freshness-allowlist.json` (if present). Used as fallback
 * during migration: any path listed there is force-included with its cadence,
 * even if its current header parsing fails.
 */
export function readLegacyAllowlist(path = LEGACY_ALLOWLIST_PATH) {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Enumerate every markdown file currently tracked by git. We use git rather
 * than a recursive fs walk because:
 *   1. it cleanly skips `.gitignore`d directories (`node_modules`, `dist`,
 *      `.turbo`, …) without us having to maintain a parallel ignore list;
 *   2. it's deterministic across platforms (no fs ordering surprises);
 *   3. it's already required by the rest of CI.
 */
export function listTrackedMarkdown(rootDir = REPO_ROOT) {
  const out = execFileSync("git", ["ls-files", "-z", "--", "*.md"], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return out.split("\0").filter(Boolean).sort();
}

/** Returns true if the file content has a canonical freshness header. */
export function hasFreshnessHeader(content) {
  return FRESHNESS_HEADER_RE.test(content.split("\n").slice(0, 15).join("\n"));
}

/**
 * Pure: given a list of candidate paths, the parsed config, and a function to
 * read each candidate's content, return the final tracked list with cadence.
 *
 * Returns: Array<{ path, cadenceDays, source }>
 *   source ∈ { "header", "explicit", "legacy" }
 */
export function buildTrackedList({
  candidates,
  config,
  legacyAllowlist = [],
  readFile,
}) {
  const tracked = new Map(); // path → { cadenceDays, source }

  const cadenceFor = (p) => cadenceForPath(p, config);

  // 1. Auto-discover every candidate that has a freshness header AND isn't
  //    excluded.
  for (const path of candidates) {
    if (matchesAnyGlob(path, config.excludeGlobs)) continue;
    if (config.explicitExclude.includes(path)) continue;
    const content = readFile(path);
    if (content == null) continue;
    if (!hasFreshnessHeader(content)) continue;
    // Finished / frozen docs keep their header (Rule #10 still applies) but
    // leave the calendar — see TERMINAL_STATUSES.
    if (isOffCalendar(content)) continue;
    tracked.set(path, { cadenceDays: cadenceFor(path), source: "header" });
  }

  // 2. Force-include explicit entries (even without a header), so the existing
  //    issue-bot keeps nagging about a missing header until someone adds one.
  for (const path of config.explicitInclude) {
    if (config.explicitExclude.includes(path)) continue;
    if (!tracked.has(path)) {
      tracked.set(path, { cadenceDays: cadenceFor(path), source: "explicit" });
    }
  }

  // 3. Legacy allowlist fallback. Any entry that isn't already auto-tracked
  //    gets pulled in with its cadenceDays. We surface this as a separate
  //    `source` so dashboards can show "still on legacy allowlist — migrate
  //    by adding a header".
  for (const entry of legacyAllowlist) {
    const path = entry.path;
    if (config.explicitExclude.includes(path)) continue;
    if (matchesAnyGlob(path, config.excludeGlobs)) continue;
    if (tracked.has(path)) continue;
    tracked.set(path, {
      cadenceDays: entry.cadenceDays ?? config.defaultCadenceDays,
      source: "legacy",
    });
  }

  return [...tracked.entries()]
    .map(([path, meta]) => ({ path, ...meta }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Convenience wrapper: read config + legacy allowlist + scan tracked markdown
 * files from disk. The default entry point used by `check-freshness.mjs` and
 * `generate-freshness-dashboard.mjs`.
 */
export function loadConfig({
  rootDir = REPO_ROOT,
  configPath = CONFIG_PATH,
  legacyAllowlistPath = LEGACY_ALLOWLIST_PATH,
} = {}) {
  const config = readConfigFile(configPath);
  const legacyAllowlist = readLegacyAllowlist(legacyAllowlistPath);
  const candidates = listTrackedMarkdown(rootDir);

  const readFile = (path) => {
    const fullPath = resolve(rootDir, path);
    if (!existsSync(fullPath)) return null;
    return readFileSync(fullPath, "utf8");
  };

  const tracked = buildTrackedList({
    candidates,
    config,
    legacyAllowlist,
    readFile,
  });

  return { config, legacyAllowlist, tracked };
}

/**
 * Compute coverage gaps: every `.md` candidate that is not excluded and does
 * not have a header. Used by `--check-coverage` mode in CI.
 */
export function computeCoverageGaps({ candidates, config, readFile }) {
  const gaps = [];
  for (const path of candidates) {
    if (matchesAnyGlob(path, config.excludeGlobs)) continue;
    if (config.explicitExclude.includes(path)) continue;
    const content = readFile(path);
    if (content == null) continue;
    if (!hasFreshnessHeader(content)) {
      gaps.push(path);
    }
  }
  return gaps;
}
