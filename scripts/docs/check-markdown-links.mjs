#!/usr/bin/env node
// scripts/docs/check-markdown-links.mjs
//
// Walk every `*.md` file in the repo (minus build outputs / vendor / node_modules),
// extract `[text](target)` links, and verify both kinds of targets:
//
//   - **Internal** — relative file paths (+ optional `#anchor`). Fail if the
//     file doesn't exist. When the target is an existing `.md` file and the
//     link carries an `#anchor`, the anchor is resolved against that file's
//     headings too (see § Anchors below).
//
//   - **External** — `http(s)://…` URLs. Fetched with caching to stay
//     CI-friendly; failures downgrade to warnings by default so a flaky
//     third-party host doesn't red the whole PR. Use `--strict-external` to
//     promote them to errors.
//
// Existing `check-governance-sync.mjs` only catches *inline-code* refs like
// `apps/web/...`. Regular markdown links between docs are silently broken
// (estimated ~40% of undetected dead links in the audit).
//
// § Anchors
//
// Until 2026-09-11 anchors were deliberately NOT verified. That left an
// invisible class: the file resolved, so the gate was green, while the
// `#section` part pointed at a heading that had been renumbered, renamed or
// deleted. A one-off sweep of `docs/**` found **55 broken anchors out of 345**
// — renumbered sections (`#9-повна-monthly-cost-projection` after the target
// was renumbered to §6), emoji headings (GitHub prefixes those slugs with a
// `-`), the two different apostrophes (U+2019 in the heading vs U+02BC in the
// link), and sections that no longer exist at all. The resolver this comment
// once called too expensive is `headingSlug` + `collectAnchors` below: two
// pure functions, no dependencies, one extra read per distinct target file.
//
// The slugger reproduces GitHub's algorithm and is pinned by tests for the
// four edges that actually bit: emoji-prefixed headings, the apostrophe pair,
// `_` inside a code span (kept — it is not emphasis there), and duplicate
// headings (`-1` suffix). After that sweep was repaired the gate went live
// green: it verifies 359 anchors across the whole tree (a wider set than the
// `docs/**` sweep — root `AGENTS.md` and friends are in scope too) with zero
// failures, so it fails only on anchors broken from here on.
//
// Usage:
//   node scripts/docs/check-markdown-links.mjs
//   node scripts/docs/check-markdown-links.mjs --skip-external
//   node scripts/docs/check-markdown-links.mjs --strict-external
//   node scripts/docs/check-markdown-links.mjs --offline       # alias for --skip-external
//
// Cache:
//   .cache/markdown-links/links.json  (gitignored)
//   TTL 7 days; keyed by absolute URL.
//
// Exit code 1 on any internal failure (or external failure with --strict-external).

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { resolve, dirname, join, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");
const CACHE_DIR = resolve(REPO_ROOT, ".cache/markdown-links");
const CACHE_FILE = join(CACHE_DIR, "links.json");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".turbo",
  ".next",
  ".cache",
  "dist",
  "dist-server",
  "build",
  "coverage",
  ".nyc_output",
  "ios",
  "android",
  "worktrees", // .claude/worktrees — agent scratch space, not repo content
]);

// Files the checker skips entirely:
//   - `.agents/skills/**` are vendored third-party skill bundles; their internal
//     refs point at other skill files that live outside the repo.
//   - `docs/start/instructions/_TEMPLATE-decision-tree.md` uses `<related-playbook>.md`
//     as a placeholder — real playbooks must fill it in.
const SKIP_FILE_PATTERNS = [
  /(?:^|\/)\.agents\/skills\//,
  /(?:^|\/)_TEMPLATE-[^/]+\.md$/,
];

// Targets that are NEVER links (template placeholders, empty-string fallbacks).
const SKIP_TARGET_PATTERNS = [
  /^undefined$/i,
  /<[^>]+>/, // `<placeholder>.md` — any angle-bracket placeholder token
  /\{\{[^}]+\}\}/, // handlebars placeholders
];

const ALWAYS_SKIP_SCHEMES = /^(mailto:|tel:|javascript:|data:|chrome:)/i;

// Default allowlist file. JSON shape:
//   { "version": 1, "entries": [ { "pattern": "<regex>", "reason": "..." } ] }
// Patterns are matched against the raw URL with `new RegExp(pattern)`. URLs
// that match any pattern are treated as ok (skipped from external fetching
// entirely). Use this for legitimate cases the checker cannot verify:
//   - localhost / private hosts that are documented for dev only
//   - URLs in immutable decision records (ADRs) that suffer link rot but are
//     cited as historical references at the time of the decision
//   - hosts that block automated user-agents (LinkedIn 999, Cloudflare-protected
//     sites returning 403 to HEAD/GET)
const DEFAULT_ALLOWLIST_PATH =
  "docs/governance/governance/external-link-allowlist.json";

// HTTP statuses we treat as "URL exists" even though `res.ok` is false:
//   - 429: rate-limited; the URL exists, the server just doesn't want this
//          robot. Re-checking on the next CI run will usually succeed.
//   - 415: server rejected the HEAD/GET method's expected content-type, but
//          the route exists (e.g. CookieYes returns 415 to HEAD).
//   - 999: LinkedIn's anti-bot signal (and a few other hosts copy it).
// 4xx/5xx not in this list still fail under --strict-external.
const STATUS_TREAT_AS_OK = new Set([429, 415, 999]);

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/**
 * Extract all markdown links from a string. Ignores fenced code blocks
 * (``` ... ```) and inline-code backticks. Also ignores reference-style and
 * auto-links — we only care about explicit `[text](target)` forms.
 * Returns [{ text, target, line }].
 */
export function extractLinks(content) {
  const out = [];
  const lines = content.split(/\r?\n/);
  let fence = null;
  // Blank out fenced-code lines instead of dropping them, so the scannable
  // buffer keeps a 1:1 line mapping and prose links that prettier wrapped
  // across two lines stay matchable.
  const scannable = lines.map((line) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const markerChar = marker[0];
      if (!fence) fence = { markerChar, length: marker.length };
      else if (markerChar === fence.markerChar && marker.length >= fence.length)
        fence = null;
      return "";
    }
    if (fence) return "";
    // Strip inline code spans so we don't pick up `[stuff](./x)` literals.
    return line.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));
  });

  const buffer = scannable.join("\n");
  // Match [text](target) — label may wrap across lines, target may not.
  // Nested parens in the target are allowed one level deep.
  const re =
    /\[([^\]]+)\]\(([^()\s]+(?:\([^()]*\))?[^()\s]*)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = re.exec(buffer)) !== null) {
    const line = buffer.slice(0, m.index).split("\n").length;
    out.push({ text: m[1], target: m[2], line });
  }
  return out;
}

/**
 * Render a heading's markdown source down to the plain text GitHub slugs.
 *
 * Order matters, and each step is here because a real heading in this repo
 * needs it:
 *   1. Code spans are lifted out FIRST and restored last. Inside a code span
 *      there is no emphasis parsing, so `` `VITE_*` `` keeps its underscore —
 *      the anchor really is `…-vite_`. Stripping backticks before step 4 ate
 *      that underscore and reported a live link as broken.
 *   2. Images drop entirely; links collapse to their label.
 *   3. `*` and `~` are always emphasis/strikethrough markers in a heading.
 *   4. `_` is emphasis ONLY at a word boundary (`_(optional)_`); between two
 *      alphanumerics it is a literal character (`METRICS_TOKEN`).
 */
export function renderHeadingText(raw) {
  // Code spans are lifted out behind a SOH-delimited placeholder. The
  // marker must be a character markdown source cannot hold: a heading can
  // legitimately contain a bare number ("## Krok 3 - dali"), so a printable
  // placeholder would collide with it. Built via fromCharCode so this file
  // stays plain ASCII.
  const MARK = String.fromCharCode(1);
  const spans = [];
  let text = String(raw).replace(
    /`+([^`]*)`+/g,
    (_m, inner) => MARK + (spans.push(inner) - 1) + MARK,
  );
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/[*~]+/g, "");
  // The placeholder counts as a word character on both sides, so an `_`
  // touching a code span stays literal instead of being read as emphasis.
  const emphasis = new RegExp(
    `(?<![A-Za-z0-9${MARK}])_|_(?![A-Za-z0-9${MARK}])`,
    "g",
  );
  text = text.replace(emphasis, "");
  const restore = new RegExp(`${MARK}(\\d+)${MARK}`, "g");
  return text.replace(restore, (_m, index) => spans[Number(index)]);
}

/**
 * GitHub's heading-anchor algorithm: render to text, lowercase, drop every
 * character that is not a letter, number, space, `-` or `_`, then turn spaces
 * into `-`. Unicode-aware, so Cyrillic headings slug to Cyrillic anchors.
 *
 * Two consequences that look like bugs and are not:
 *   - A leading emoji (`## 🌐 1. Web / PWA`) is removed but its trailing space
 *     survives, so the slug starts with a hyphen: `-1-web--pwa`.
 *   - A removed character between two words leaves both its neighbouring
 *     spaces, so `Web / PWA` slugs to `web--pwa` with a double hyphen.
 */
export function headingSlug(raw) {
  const rendered = renderHeadingText(raw).trim().toLowerCase();
  let out = "";
  for (const ch of rendered) {
    if (/[\p{L}\p{N}]/u.test(ch) || ch === " " || ch === "-" || ch === "_") {
      out += ch;
    }
  }
  return out.replace(/ /g, "-");
}

/**
 * Collect every anchor a markdown document exposes, in document order:
 * heading slugs (with GitHub's `-1` / `-2` suffixes for repeats) plus explicit
 * `<a id="…">` / `<a name="…">` targets. Fenced code blocks are skipped so a
 * `# comment` line inside a shell example is not mistaken for a heading.
 *
 * Returns [{ anchor, heading }] — `heading` is the raw heading source (or
 * `<a id>` for explicit anchors) so error messages can quote it.
 */
export function collectAnchors(content) {
  const out = [];
  const seen = new Map();
  let fence = null;
  for (const line of String(content).split(/\r?\n/)) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const markerChar = marker[0];
      if (!fence) fence = { markerChar, length: marker.length };
      else if (markerChar === fence.markerChar && marker.length >= fence.length)
        fence = null;
      continue;
    }
    if (fence) continue;
    const m = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!m) continue;
    const base = headingSlug(m[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({ anchor: n === 0 ? base : `${base}-${n}`, heading: m[1] });
  }
  for (const m of String(content).matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) {
    out.push({ anchor: m[1].toLowerCase(), heading: "<a id>" });
  }
  return out;
}

/** Levenshtein distance, bounded input — used only to name a near miss. */
function editDistance(a, b) {
  const s = a.slice(0, 120);
  const t = b.slice(0, 120);
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const row = [i];
    for (let j = 1; j <= t.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[t.length];
}

/**
 * Best-guess replacement for a broken anchor. Returns the closest existing
 * anchor or null when nothing is close enough — a wrong suggestion costs more
 * than none, so the bar is 60% similarity.
 */
export function nearestAnchor(wanted, anchors) {
  let best = null;
  let bestScore = 0;
  for (const entry of anchors) {
    const longest = Math.max(wanted.length, entry.anchor.length) || 1;
    const score = 1 - editDistance(wanted, entry.anchor) / longest;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return bestScore >= 0.6 ? best : null;
}

/**
 * Split an internal link target into its path and anchor parts. The anchor is
 * percent-decoded and lowercased so `#%D1%81%D1%82%D0%B0%D0%BD` and `#стан`
 * compare equal.
 */
export function splitAnchor(target) {
  const hash = target.indexOf("#");
  if (hash < 0) return { path: target, anchor: null };
  const raw = target.slice(hash + 1);
  if (!raw) return { path: target.slice(0, hash), anchor: null };
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* malformed escape — compare the raw form */
  }
  return { path: target.slice(0, hash), anchor: decoded.toLowerCase() };
}

/** Walk a directory recursively, returning all .md file paths (absolute). */
export function walkMarkdown(dir, out = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      walkMarkdown(p, out);
    } else if (ent.isFile() && ent.name.endsWith(".md")) {
      out.push(p);
    }
  }
  return out;
}

/** Classify a link target as "external" | "internal" | "skip". */
export function classifyTarget(target) {
  if (!target || target.trim() === "") return "skip";
  if (target.startsWith("#")) return "skip"; // pure anchor, same-page
  if (ALWAYS_SKIP_SCHEMES.test(target)) return "skip";
  if (SKIP_TARGET_PATTERNS.some((re) => re.test(target))) return "skip";
  if (/^https?:\/\//i.test(target)) return "external";
  return "internal";
}

/** Is this markdown file skipped entirely by the checker? */
export function shouldSkipFile(relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  return SKIP_FILE_PATTERNS.some((re) => re.test(normalized));
}

/** Resolve an internal link target to an absolute filesystem path. */
export function resolveInternal(sourceFile, target, repoRoot = REPO_ROOT) {
  // Drop the anchor; anchors aren't verified against markdown content.
  const [path] = target.split("#");
  if (!path) return null; // pure anchor handled by classify
  const base = isAbsolute(path) ? repoRoot : dirname(sourceFile);
  const decoded = decodeURIComponent(path);
  return isAbsolute(decoded)
    ? resolve(repoRoot, decoded.slice(1))
    : resolve(base, decoded);
}

/** Load cache from disk; returns {} if missing / invalid / expired-keys dropped. */
export function loadCache(
  cacheFile = CACHE_FILE,
  { now = Date.now(), ttl = CACHE_TTL_MS } = {},
) {
  if (!existsSync(cacheFile)) return {};
  try {
    const raw = JSON.parse(readFileSync(cacheFile, "utf8"));
    const pruned = {};
    for (const [url, entry] of Object.entries(raw)) {
      if (entry && typeof entry === "object" && now - (entry.at || 0) < ttl) {
        pruned[url] = entry;
      }
    }
    return pruned;
  } catch {
    return {};
  }
}

export function saveCache(cache, cacheFile = CACHE_FILE) {
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
}

// ── Fetch with cache ─────────────────────────────────────────────────────────

async function checkExternalOnce(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // HEAD first (cheap). Fallback to GET if server disallows HEAD (405/501).
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "sergeant-markdown-link-checker/1.0" },
    });
    if (res.status === 405 || res.status === 501 || res.status === 403) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": "sergeant-markdown-link-checker/1.0" },
      });
    }
    const ok = res.ok || STATUS_TREAT_AS_OK.has(res.status);
    return { ok, status: res.status, at: Date.now() };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: String(err.message || err),
      at: Date.now(),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function checkExternal(url, cache, { timeoutMs = 8000 } = {}) {
  if (cache[url]) return cache[url];
  let result = await checkExternalOnce(url, timeoutMs);
  // A `status: 0` failure is transient transport noise (abort/timeout, DNS
  // hiccup, connection reset) — not evidence the link is broken. One retry
  // with a doubled deadline kills the rotating one-slow-host-per-run CI
  // flake without hiding genuinely dead links (those return real statuses
  // or fail both attempts).
  if (!result.ok && result.status === 0) {
    result = await checkExternalOnce(url, timeoutMs * 2);
  }
  cache[url] = result;
  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const allowlistIdx = argv.indexOf("--allowlist");
  return {
    skipExternal:
      argv.includes("--skip-external") || argv.includes("--offline"),
    strictExternal: argv.includes("--strict-external"),
    rootArg:
      (argv.includes("--root") && argv[argv.indexOf("--root") + 1]) || null,
    allowlistArg:
      allowlistIdx >= 0 && argv[allowlistIdx + 1]
        ? argv[allowlistIdx + 1]
        : null,
  };
}

/**
 * Load and compile the external-link allowlist. Returns an array of
 * { pattern: string, regex: RegExp, reason: string }. Missing file is OK
 * (returns []). Malformed file throws so a typo doesn't silently
 * bypass the gate.
 */
export function loadAllowlist(path) {
  if (!path || !existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (!raw || !Array.isArray(raw.entries)) {
    throw new Error(
      `external-link allowlist at ${path} is malformed: expected { entries: [{pattern, reason}] }`,
    );
  }
  return raw.entries.map((e, i) => {
    if (!e || typeof e.pattern !== "string") {
      throw new Error(
        `external-link allowlist entry #${i} at ${path} is missing 'pattern' (string).`,
      );
    }
    if (typeof e.reason !== "string" || e.reason.trim().length < 5) {
      throw new Error(
        `external-link allowlist entry #${i} at ${path} is missing a non-trivial 'reason'. Allowlists exist to be auditable; a one-line justification is required.`,
      );
    }
    return {
      pattern: e.pattern,
      regex: new RegExp(e.pattern),
      reason: e.reason,
    };
  });
}

export function isAllowlisted(url, allowlist) {
  return allowlist.some((entry) => entry.regex.test(url));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = args.rootArg ? resolve(args.rootArg) : REPO_ROOT;

  const allowlistPath = resolve(
    REPO_ROOT,
    args.allowlistArg || DEFAULT_ALLOWLIST_PATH,
  );
  const allowlist = loadAllowlist(allowlistPath);

  const files = walkMarkdown(root);
  console.log(
    `Scanning ${files.length} markdown files from ${relative(process.cwd(), root) || "."}…`,
  );
  if (allowlist.length > 0) {
    console.log(
      `→ external-link allowlist: ${allowlist.length} pattern(s) from ${relative(REPO_ROOT, allowlistPath)}`,
    );
  }

  const internalFailures = [];
  const anchorFailures = [];
  const externalFailures = [];
  const externalWarnings = [];
  const cache = loadCache();
  const externalQueue = [];
  let internalCount = 0;
  let externalCount = 0;
  let anchorCount = 0;

  // One read + one parse per distinct target file, not per link: the launch
  // docs point at the same handful of trackers hundreds of times.
  const anchorCache = new Map();
  const anchorsFor = (absPath) => {
    if (!anchorCache.has(absPath)) {
      try {
        anchorCache.set(absPath, collectAnchors(readFileSync(absPath, "utf8")));
      } catch {
        anchorCache.set(absPath, null); // unreadable → cannot judge, stay quiet
      }
    }
    return anchorCache.get(absPath);
  };

  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    if (shouldSkipFile(rel)) continue;
    const content = readFileSync(file, "utf8");
    const links = extractLinks(content);
    for (const link of links) {
      const kind = classifyTarget(link.target);
      if (kind === "skip") continue;
      if (kind === "internal") {
        internalCount++;
        const abs = resolveInternal(file, link.target);
        if (!abs || !existsSync(abs)) {
          internalFailures.push({
            file: relative(REPO_ROOT, file),
            line: link.line,
            target: link.target,
          });
          continue;
        }
        // The file resolved — now the `#anchor`, if any. Only markdown targets
        // have headings to resolve against; a `.json#pointer` or a directory
        // link is left alone.
        const { anchor } = splitAnchor(link.target);
        if (!anchor || !abs.endsWith(".md")) continue;
        if (shouldSkipFile(relative(REPO_ROOT, abs))) continue;
        const anchors = anchorsFor(abs);
        if (anchors === null) continue;
        anchorCount++;
        if (anchors.some((entry) => entry.anchor === anchor)) continue;
        anchorFailures.push({
          file: relative(REPO_ROOT, file),
          line: link.line,
          target: link.target,
          targetFile: relative(REPO_ROOT, abs),
          anchor,
          nearest: nearestAnchor(anchor, anchors),
        });
      } else if (kind === "external") {
        externalCount++;
        if (isAllowlisted(link.target, allowlist)) continue;
        if (!args.skipExternal) {
          externalQueue.push({ file, link });
        }
      }
    }
  }

  console.log(
    `→ ${internalCount} internal links (${anchorCount} with a verified #anchor), ${externalCount} external links.`,
  );

  // External checks run with bounded concurrency so CI doesn't stall.
  if (!args.skipExternal && externalQueue.length > 0) {
    const CONCURRENCY = 8;
    let idx = 0;
    async function worker() {
      while (idx < externalQueue.length) {
        const my = idx++;
        const { file, link } = externalQueue[my];
        const res = await checkExternal(link.target, cache);
        if (!res.ok) {
          const entry = {
            file: relative(REPO_ROOT, file),
            line: link.line,
            target: link.target,
            status: res.status,
            error: res.error,
          };
          if (args.strictExternal) externalFailures.push(entry);
          else externalWarnings.push(entry);
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, externalQueue.length) }, () =>
        worker(),
      ),
    );
    saveCache(cache);
  }

  if (internalFailures.length > 0) {
    console.error(`\n❌${internalFailures.length} broken INTERNAL link(s):\n`);
    for (const f of internalFailures) {
      console.error(`  ${f.file}:${f.line}  →  ${f.target}`);
    }
  }
  if (anchorFailures.length > 0) {
    console.error(`\n❌${anchorFailures.length} broken ANCHOR(s):\n`);
    for (const f of anchorFailures) {
      console.error(`  ${f.file}:${f.line}  →  ${f.target}`);
      console.error(
        `      no heading in ${f.targetFile} slugs to #${f.anchor}`,
      );
      if (f.nearest) {
        console.error(
          `      nearest: #${f.nearest.anchor}   (heading: ${f.nearest.heading})`,
        );
      } else {
        console.error(
          `      no close heading — the section is gone; drop the #anchor or link the right doc`,
        );
      }
    }
    console.error(
      `\n  Anchors are GitHub slugs: lowercase, punctuation dropped, spaces → "-".`,
    );
    console.error(
      `  A leading emoji leaves a leading "-"; a dropped character between words leaves "--".`,
    );
  }
  if (externalFailures.length > 0) {
    console.error(`\n❌${externalFailures.length} broken EXTERNAL link(s):\n`);
    for (const f of externalFailures) {
      console.error(
        `  ${f.file}:${f.line}  →  ${f.target}  (${f.status || f.error})`,
      );
    }
  }
  if (externalWarnings.length > 0) {
    console.warn(
      `\n⚠  ${externalWarnings.length} external link(s) failed (non-fatal; rerun with --strict-external to enforce):\n`,
    );
    for (const w of externalWarnings) {
      console.warn(
        `  ${w.file}:${w.line}  →  ${w.target}  (${w.status || w.error})`,
      );
    }
  }

  if (
    internalFailures.length === 0 &&
    anchorFailures.length === 0 &&
    externalFailures.length === 0
  ) {
    console.log("\n✅ All markdown links resolve.");
    process.exit(0);
  }
  process.exit(1);
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
