#!/usr/bin/env node
/**
 * PWA precache 1st-party gate (PR-38 / stack-pulse 2026-05 L11).
 *
 * Парсить згенерований Workbox-ом `apps/server/dist/sw.js` (output
 * `pnpm --filter @sergeant/web build`), витягує всі URL-и з
 * `precacheAndRoute(self.__WB_MANIFEST)` (placeholder підмінюється
 * VitePWA на JSON-літерал масиву `{url, revision}`), і фейлиться, якщо
 * у precache потрапив будь-який non-1st-party URL — окрім тих, що
 * явно дозволені у `ORIGIN_ALLOWLIST` нижче.
 *
 * Чому це важливо:
 *
 *   1. **Cache poisoning.** SW кешує під origin scope нашого app-у.
 *      Якщо upstream (Google Fonts, jsDelivr, CDN партнера) колись
 *      буде compromised, malicious response потрапляє у persistent
 *      cache всіх наших користувачів — і живе там до зміни SW
 *      version (тобто до наступного deploy-у). Cleanup-у `cache delete`
 *      не існує, бо malicious SW сам собі цю команду не видасть.
 *
 *   2. **CSP-bypass.** Cached fetch-и обходять `Content-Security-Policy`
 *      report endpoint — порушення CSP, що б ми додали для 3rd-party
 *      origin-у, у precache-режимі не виявимо.
 *
 *   3. **Privacy.** Кешування 3rd-party assets без user-consent (GDPR
 *      Art. 6/7) — risk зони у EU/UA. 1st-party-only за замовчуванням
 *      робить це non-issue.
 *
 *   4. **Reproducibility / supply-chain.** Глобальний `globPatterns`
 *      у `apps/web/vite.config.js#injectManifest` контролює лише наші
 *      файли. А Vite-плагін чи build-step, що pull-ить 3rd-party
 *      asset у `dist/` (наприклад inline-завантаження woff2 зі
 *      сторонньої CDN), автоматично потрапляє у precache. Цей gate —
 *      catch-all поверх explicit `globPatterns`.
 *
 * Як whitelistити legitimate 3rd-party (rare!):
 *
 *   - Додай origin у `ORIGIN_ALLOWLIST` нижче з reason-comment-ом.
 *   - Парно: SRI hash на html-side і CSP `connect-src` review.
 *   - Документуй в `docs/web/pwa-policy.md` (out of scope of цього PR-у —
 *     тимчасово в module-level doc-string-у).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(__filename), "..");
const SW_PATH = resolve(repoRoot, "apps/server/dist/sw.js");

/**
 * Origin-и, які явно дозволені у precache. **Empty by default** —
 * додавай лише з justified rationale + SRI/CSP review.
 *
 * Format: `Set` рядків origin-у (`"https://example.com"`), без trailing
 * slash. Match робиться через `new URL(url).origin === <member>`, тобто
 * subdomain-mismatch фейлиться automaticly.
 */
export const ORIGIN_ALLOWLIST = new Set();

/**
 * @param {string} url Raw URL з precache manifest-у.
 * @returns {boolean} `true` якщо URL — наш origin (relative, або
 *   absolute зі allow-listed origin); `false` якщо 3rd-party.
 */
export function isFirstParty(url) {
  // Простий relative path (`index.html`, `assets/index-abc123.js`,
  // `./favicon.ico`, `/icon-192.png`) — точно 1st-party.
  // Match: будь-що, що НЕ починається з protocol-у (`https:`, `http:`,
  // `data:`, тощо) і не починається зі схеми-relative `//`.
  if (!/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) return true;
  try {
    const u = new URL(url);
    return ORIGIN_ALLOWLIST.has(u.origin);
  } catch {
    // Malformed URL — Workbox runtime теж би відмовився, але
    // тут ми не панікуємо: повертаємо false, щоб явно попередити
    // інженера про дивний entry.
    return false;
  }
}

/**
 * @param {string} swSource Built service-worker JS.
 * @returns {Array<string>} Усі URL-и з precache manifest-у.
 *
 * VitePWA / Workbox `injectManifest` strategy замінює placeholder
 * `self.__WB_MANIFEST` на масив `[{url, revision}, ...]`. Після
 * minification ключі `"url"` / `"revision"` лишаються JSON-string-ами
 * (це property-keys у object literal), тож regex по `"url":"..."`
 * робастно витягує всі entries незалежно від minifier-а.
 */
export function extractPrecacheUrls(swSource) {
  const re = /"url":\s*"([^"]+)"/g;
  /** @type {Array<string>} */
  const urls = [];
  let m;
  while ((m = re.exec(swSource)) !== null) {
    urls.push(m[1]);
  }
  return urls;
}

function main() {
  if (!existsSync(SW_PATH)) {
    console.error(
      `[check-pwa-precache] missing ${SW_PATH}.\n` +
        `Run \`pnpm --filter @sergeant/web build\` first (це генерує SW).`,
    );
    process.exit(2);
  }
  const sw = readFileSync(SW_PATH, "utf-8");
  const urls = extractPrecacheUrls(sw);
  if (urls.length === 0) {
    console.error(
      "[check-pwa-precache] no precache URLs found in sw.js.\n" +
        "Manifest format may have changed (VitePWA / Workbox upgrade?). " +
        "Update extractor regex in scripts/check-pwa-precache-1st-party.mjs.",
    );
    process.exit(2);
  }

  const violations = urls.filter((u) => !isFirstParty(u));
  if (violations.length > 0) {
    console.error(
      `[check-pwa-precache] ${violations.length} non-1st-party URL(s) in PWA precache (of ${urls.length} total):`,
    );
    for (const u of violations) {
      console.error(`  - ${u}`);
    }
    console.error(
      "\nIf this entry is legitimate (rare!), add its origin to " +
        "ORIGIN_ALLOWLIST in scripts/check-pwa-precache-1st-party.mjs " +
        "with a justified rationale + paired SRI / CSP review.",
    );
    process.exit(1);
  }

  console.log(
    `[check-pwa-precache] OK — ${urls.length} precache URLs, all 1st-party.`,
  );
}

// Run only when executed directly, not when imported by tests.
if (
  import.meta.url === `file://${process.argv[1]}` ||
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  main();
}
