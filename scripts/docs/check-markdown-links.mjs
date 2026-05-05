#!/usr/bin/env node
// scripts/docs/check-markdown-links.mjs
//
// Walk every `*.md` file in the repo (minus build outputs / vendor / node_modules),
// extract `[text](target)` links, and verify both kinds of targets:
//
//   - **Internal** — relative file paths (+ optional `#anchor`). Fail if the
//     file doesn't exist. Anchors themselves are NOT verified (to keep the
//     check fast and avoid maintaining a markdown anchor resolver).
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
]);

// Files the checker skips entirely:
//   - `.agents/skills/**` are vendored third-party skill bundles; their internal
//     refs point at other skill files that live outside the repo.
//   - `THIRD_PARTY_LICENSES.md` is auto-generated and legitimately contains
//     `(undefined)` placeholders when an upstream package omits `homepage`.
//   - `docs/playbooks/_TEMPLATE-decision-tree.md` uses `<related-playbook>.md`
//     as a placeholder — real playbooks must fill it in.
const SKIP_FILE_PATTERNS = [
  /(?:^|\/)\.agents\/skills\//,
  /(?:^|\/)THIRD_PARTY_LICENSES\.md$/,
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
const DEFAULT_ALLOWLIST_PATH = "docs/governance/external-link-allowlist.json";

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
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // Strip inline code spans so we don't pick up `[stuff](./x)` literals.
    const stripped = line.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));

    // Match [text](target) — no newlines inside target, allow nested parens
    // only one level deep (good enough for markdown in this repo).
    const re =
      /\[([^\]]+)\]\(([^()\s]+(?:\([^()]*\))?[^()\s]*)(?:\s+"[^"]*")?\)/g;
    let m;
    while ((m = re.exec(stripped)) !== null) {
      out.push({ text: m[1], target: m[2], line: i + 1 });
    }
  }
  return out;
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
  return SKIP_FILE_PATTERNS.some((re) => re.test(relPath));
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

async function checkExternal(url, cache, { timeoutMs = 8000 } = {}) {
  if (cache[url]) return cache[url];
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
    const result = { ok, status: res.status, at: Date.now() };
    cache[url] = result;
    return result;
  } catch (err) {
    const result = {
      ok: false,
      status: 0,
      error: String(err.message || err),
      at: Date.now(),
    };
    cache[url] = result;
    return result;
  } finally {
    clearTimeout(timer);
  }
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
  const externalFailures = [];
  const externalWarnings = [];
  const cache = loadCache();
  const externalQueue = [];
  let internalCount = 0;
  let externalCount = 0;

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
        }
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
    `→ ${internalCount} internal links, ${externalCount} external links.`,
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

  if (internalFailures.length === 0 && externalFailures.length === 0) {
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
