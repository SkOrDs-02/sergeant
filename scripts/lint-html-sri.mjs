#!/usr/bin/env node
// scripts/lint-html-sri.mjs
//
// SRI (Subresource Integrity) lint для HTML-сторінок Sergeant — закриває
// audit-item `S3` з `docs/audits/2026-05-13-security-observability-roast.md`.
//
// Що валідуємо:
//   Кожен `<script>` із `src="https://..."` (cross-origin / CDN) у
//   `apps/web/index.html` мусить нести SRI-хеш та `crossorigin` атрибут:
//     • `integrity="sha384-..."` — SRI-цифровий відбиток (W3C SRI § 3.5
//       рекомендує SHA-384 як baseline для нового коду; SHA-256 / SHA-512
//       теж приймаються специфікацією, але SHA-384 — fail-closed дефолт).
//     • `crossorigin="anonymous"` — необхідно, щоб браузер міг перевірити
//       integrity-хеш (інакше fetch без `cors`-credentials → SRI-перевірка
//       мовчки skip-неться, що нівелює всю гру).
//
// Чому це важливо (audit § S3, P1):
//   CSP allowlist у `apps/web/vercel.json` (script-src) пропускає
//   `https://*.posthog.com`, `https://*.sentry-cdn.com`, `https://*.sentry.io`,
//   `https://js.sentry-cdn.com`. У 2026 жодне з них статично не вантажиться
//   у `index.html` (PostHog/Sentry приходять через npm-bundle). Але майбутній
//   PR, що додасть `<script src="https://cdn.example.com/x.js">` без
//   `integrity=`, тихо відкриє supply-chain атаку: компроміс CDN або
//   MITM-атака на trusting-on-first-use HTTPS = XSS у production.
//
//   Цей лінт — fail-closed дефолт: новий `<script src="https://...">` без
//   SRI валить білд. Local-only теги (`src="/..."`, `src="./..."`, без
//   `src` взагалі — inline) — лишаються дозволеними, бо вони контрольовані
//   нашою Vite-збіркою і CSP `'self'`.
//
// Usage:
//   pnpm lint:html-sri
//   node scripts/lint-html-sri.mjs
//   node scripts/lint-html-sri.mjs --paths apps/web/index.html apps/other/index.html
//
// Exit code: 0 на success, 1 при будь-якому порушенні, 2 на runtime-помилку
// (відсутній файл, parse error). Runner — path-based (без `pnpm install`),
// тож недорого тримати у PR-CI.

import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..");

// Default target — `apps/web/index.html`. Можна override-нути через
// CLI-flag `--paths <file> [<file>...]` (для нових SPA shell-ів,
// що з'являться у `apps/openclaw-console` тощо).
const DEFAULT_PATHS = ["apps/web/index.html"];

// Регекс для SRI-хешу: `<algo>-<base64>` де `algo ∈ {sha256, sha384, sha512}`.
// Base64-alphabet (RFC 4648 § 4) + URL-safe variants (`-`, `_`) приймаємо;
// padding `=` дозволено наприкінці. Декілька хешів розділені пробілом
// (W3C SRI § 3.5 multi-hash priority).
const SRI_HASH_RE = /^(sha256|sha384|sha512)-[A-Za-z0-9+/=_-]+$/;

// W3C SRI § 3.5 рекомендує SHA-384 для нового коду — слабші хеші
// підсвічуємо як warning, але не fail-closed (можуть бути legacy-allowlist
// записи у майбутньому). Поки що — інформаційний indicator у error-нотатці.
const PREFERRED_ALGO = "sha384";

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/**
 * @param {string} url Raw `src` attribute value.
 * @returns {boolean} `true` якщо URL — cross-origin HTTPS (потребує SRI);
 *   `false` якщо local / relative / data URI / blob (контрольовані нами).
 *
 * Cross-origin означає будь-який abs-URL зі схемою `https:` АБО
 * schema-relative (`//cdn.example.com/...`) — обидва відкривають
 * supply-chain атаку. `http://` теж формально cross-origin, але CSP вже
 * блокує його у `script-src 'self' https://*.posthog.com ...` (немає
 * `http:`-allowlist-у); ловимо для повноти. `data:` / `blob:` — inline,
 * SRI не застосовується, тож skip.
 */
export function isCrossOriginScriptSrc(url) {
  if (typeof url !== "string" || url.length === 0) return false;
  // Schema-relative (`//cdn.example.com`) — той самий supply-chain ризик.
  if (url.startsWith("//")) return true;
  // Absolute HTTPS / HTTP — cross-origin.
  if (/^https?:\/\//i.test(url)) return true;
  // `data:` / `blob:` / `javascript:` (останнє — окреме CSP-питання) — skip.
  return false;
}

/**
 * @param {Array<{name: string, value: string}>} attrs parse5 attribute list.
 * @returns {Map<string, string>} Lookup мапа `name → value` для O(1) access.
 *
 * parse5 повертає атрибути як масив; ми тримаємо map, бо лінт перевіряє
 * кілька атрибутів на один елемент. Дублікати атрибутів у HTML —
 * undefined behaviour (parser лишає лише перший); ми наслідуємо це.
 */
export function attrsToMap(attrs) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const a of attrs ?? []) {
    if (typeof a?.name === "string" && !map.has(a.name)) {
      map.set(a.name, typeof a.value === "string" ? a.value : "");
    }
  }
  return map;
}

/**
 * Перевіряє один `<script>` тег на SRI-compliance.
 *
 * @param {Map<string, string>} attrs Атрибути elem-а (через `attrsToMap`).
 * @returns {Array<string>} Пусто, якщо тег ok; інакше — массив human-readable
 *   error-повідомлень. Pure-функція, без I/O.
 *
 * Логіка:
 *   1. Якщо `src` відсутній — inline script, SRI не stosuется (skip).
 *   2. Якщо `src` — local / relative — skip (`isCrossOriginScriptSrc`).
 *   3. Cross-origin HTTPS:
 *      - `integrity` мусить бути присутнім та матчити `SRI_HASH_RE`.
 *      - `crossorigin` мусить бути `anonymous` (або `use-credentials`,
 *        але anonymous — fail-closed дефолт для CDN-bundle-ів).
 */
export function validateScriptAttrs(attrs) {
  const errors = [];
  const src = attrs.get("src");
  if (typeof src !== "string" || src.length === 0) return errors;
  if (!isCrossOriginScriptSrc(src)) return errors;

  const integrity = attrs.get("integrity");
  if (typeof integrity !== "string" || integrity.length === 0) {
    errors.push(
      `<script src="${src}"> missing integrity attribute ` +
        `(expected integrity="${PREFERRED_ALGO}-<base64>").`,
    );
  } else {
    // Допускається multi-hash (W3C SRI § 3.5): кілька хешів, розділені
    // пробілом. Кожен мусить парситися окремо.
    const tokens = integrity.split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || !tokens.every((t) => SRI_HASH_RE.test(t))) {
      errors.push(
        `<script src="${src}"> has malformed integrity="${integrity}" ` +
          `(expected ${PREFERRED_ALGO}-<base64> or one of sha256/sha512).`,
      );
    }
  }

  const crossorigin = attrs.get("crossorigin");
  if (crossorigin !== "anonymous" && crossorigin !== "use-credentials") {
    errors.push(
      `<script src="${src}"> missing crossorigin="anonymous" ` +
        "(required for SRI verification; without CORS the browser " +
        "silently skips integrity check).",
    );
  }

  return errors;
}

/**
 * Рекурсивно знаходить усі `<script>` елементи у parse5 tree.
 *
 * @param {object} node parse5 node (Document, Element або TextNode).
 * @param {Array<{attrs: Map<string,string>, location: object|null}>} out
 *   Акумулятор; передається рекурсивно для tail-call-free traversal.
 * @returns {Array<{attrs: Map<string,string>, location: object|null}>} `out`.
 */
export function collectScriptElements(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (node.nodeName === "script" && Array.isArray(node.attrs)) {
    out.push({
      attrs: attrsToMap(node.attrs),
      location: node.sourceCodeLocation ?? null,
    });
  }
  const children = node.childNodes;
  if (Array.isArray(children)) {
    for (const child of children) collectScriptElements(child, out);
  }
  return out;
}

/**
 * High-level entry: парсить HTML, збирає всі `<script>`-теги, валідує
 * кожен.
 *
 * @param {string} html Сирий HTML-контент.
 * @param {string} [label] Optional label для error-повідомлень
 *   (filename relative to repo root).
 * @returns {{ok: boolean, errors: Array<string>, scriptCount: number}}
 */
export function lintHtml(html, label = "<inline>") {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const scripts = collectScriptElements(document);
  /** @type {Array<string>} */
  const errors = [];
  for (const { attrs, location } of scripts) {
    const tagErrors = validateScriptAttrs(attrs);
    if (tagErrors.length > 0) {
      const lineCol = location
        ? `${label}:${location.startLine}:${location.startCol}`
        : label;
      for (const e of tagErrors) {
        errors.push(`${lineCol} ${e}`);
      }
    }
  }
  return { ok: errors.length === 0, errors, scriptCount: scripts.length };
}

// ── CLI entry (skipped when imported by node:test) ───────────────────────────

function parseCliArgs(argv) {
  const args = argv.slice(2);
  const idx = args.indexOf("--paths");
  if (idx === -1) return DEFAULT_PATHS;
  const rest = args.slice(idx + 1).filter((a) => !a.startsWith("--"));
  return rest.length > 0 ? rest : DEFAULT_PATHS;
}

function main() {
  const paths = parseCliArgs(process.argv);
  let totalErrors = 0;
  let totalScripts = 0;
  for (const rel of paths) {
    const abs = resolve(REPO_ROOT, rel);
    if (!existsSync(abs)) {
      console.error(`[lint-html-sri] missing file: ${rel}`);
      process.exit(2);
    }
    const html = readFileSync(abs, "utf-8");
    const result = lintHtml(html, relative(REPO_ROOT, abs));
    totalScripts += result.scriptCount;
    if (!result.ok) {
      totalErrors += result.errors.length;
      for (const e of result.errors) console.error(`[lint-html-sri] ${e}`);
    }
  }
  if (totalErrors > 0) {
    console.error(
      `\n[lint-html-sri] ${totalErrors} violation(s) across ` +
        `${paths.length} file(s).\n` +
        `See docs/audits/2026-05-13-security-observability-roast.md § S3 ` +
        "for rationale, or scripts/lint-html-sri.mjs header comment.",
    );
    process.exit(1);
  }
  console.log(
    `[lint-html-sri] ok — ${totalScripts} <script> tag(s) checked across ` +
      `${paths.length} file(s).`,
  );
}

// Run only when executed directly (CLI), not when imported by node --test.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
