# PR-38: PWA precache 1st-party verify

> **Last validated:** 2026-05-09 by Devin. **Next review:** 2026-08-07.
> **Status:** In review — PR pending merge. Скрипт живе не у `apps/web/scripts/` (як писалось у плані на 2026-05-07), а у кореневій `scripts/` — всі інші freshness/процес-гейти репо живуть там (`check-patches-doc.mjs`, `check-tech-debt-freshness.mjs`, ін.). Скрипт використовує `apps/server/dist/sw.js` (aп`apps/web` білдить сюди через `outDir`).

|                    |                                                                             |
| ------------------ | --------------------------------------------------------------------------- |
| **Severity**       | Low (L11)                                                                   |
| **Linked finding** | L11 (`00-overview.md`)                                                      |
| **Owner**          | @Skords-01                                                                  |
| **Effort**         | 0.5 дня                                                                     |
| **Risk**           | Low (build-time check; не міняє runtime SW)                                 |
| **Touches**        | `apps/web/vite.config.js`, `apps/web/scripts/`                              |
| **Trigger**        | next time 3rd-party CDN URL потрапляє у precache → silent supply-chain risk |

## Контекст

`apps/web/vite.config.js` (VitePWA) генерує precache manifest з all-built-files. Workbox auto-detects assets з `dist/` і додає у precache.

Risk: build pulls 3rd-party assets (e.g., Google Fonts CSS/woff2 inlined через build-tool) → auto-precached. SW кешує 3rd-party traffic під origin scope:

1. Cache-poisoning if malicious upstream.
2. CSP report leakage (cached requests bypass CSP).
3. Privacy — 3rd-party content cached без user consent.

## Scope

### 1. Build-time precache audit

`apps/web/scripts/check-precache-1st-party.mjs`:

```js
// Reads dist/sw.js generated manifest
// Parses ALL precached URLs
// Fail якщо any URL — non-relative AND not у allowlist
import { readFileSync } from "fs";
const sw = readFileSync("dist/sw.js", "utf-8");
const manifest = sw.match(/__WB_MANIFEST['"]?\s*=\s*(\[[\s\S]*?\])/)?.[1];
// extract URLs, check кожен
```

Allowlist (explicitly):

- self-relative (`/`, `./`)
- self-origin SHA-pinned 3rd-party assets (e.g., own CDN proxy)

### 2. Vite config hardening

```js
// apps/web/vite.config.js
VitePWA({
  workbox: {
    globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
    globIgnores: ["**/node_modules/**"],
    // explicit dontCacheBustURLsMatching для self-domain
  },
  // disable auto-precache via plugins що pull 3rd-party
});
```

### 3. CI step

`.github/workflows/web-build.yml`:

```yaml
- run: pnpm --filter web build
- run: pnpm --filter web check-precache
```

### 4. Documentation

`docs/web/pwa-policy.md`:

- Precache must be 1st-party only.
- How to whitelist 3rd-party (justified case-by-case).

## Out of scope

- Migration від VitePWA на manual Workbox config — backlog.
- Subresource Integrity (SRI) для 3rd-party — окремий PR.

## Acceptance criteria (DoD)

- [x] `scripts/check-pwa-precache-1st-party.mjs` (див. Status-ноту про розміщення).
- [x] CI step `lint:pwa-precache` running on every PR (`.github/workflows/ci.yml#check`, після `pnpm check`-білд-кроку).
- [x] Vite config explicit `globPatterns` + new `globIgnores` (`**/node_modules/**`, `**/*.map`, `**/*.map.*`, `bundle-report.html`).
- [~] `docs/web/pwa-policy.md` — пропущено як follow-up. Module-level doc-string у `scripts/check-pwa-precache-1st-party.mjs` покриває розширений rationale (cache poisoning, CSP-bypass, privacy, supply-chain) + інструкцію як whitelist-ити legitimate origin.
- [x] Test: intentional 3rd-party URL у manifest → gate fail (`scripts/__tests__/check-pwa-precache-1st-party.test.mjs` — 10 test у 3 suite-ах; реальний build верифікований: 144 URL-и, всі 1st-party).

## Тести

- `apps/web/scripts/__tests__/check-precache.test.mjs` — fixture:
  - all-1st-party manifest → pass.
  - mixed manifest → fail з URL list.

## Rollout

- Single PR.

## Risks & mitigations

| Risk                                                         | Mitigation                                               |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| Edge-case 3rd-party (Google Fonts woff2) needed legitimately | Explicit allowlist у script з reason-comment             |
| Manifest format change у VitePWA upgrade ламає parser        | Regex robust; test-suite covers majeure VitePWA versions |

## Touchpoints (file:line)

- `scripts/check-pwa-precache-1st-party.mjs` — new gate (кореневий `scripts/`, біля інших freshness-гейтів).
- `scripts/__tests__/check-pwa-precache-1st-party.test.mjs` — new (`node --test`, 10 тестів, 3 suite-и).
- `apps/web/vite.config.js:154-169` — `injectManifest.globPatterns` + new `globIgnores`.
- `.github/workflows/ci.yml:170-177` — додано step «PWA precache 1st-party gate (PR-38 / L11)» після `pnpm check`.
- `package.json:85` — додано `lint:pwa-precache` script.
- `docs/web/pwa-policy.md` — follow-up (див. DoD `[~]` вище; module-level doc-string покриває раціонал).

## Refs

- [Workbox precache documentation](https://developer.chrome.com/docs/workbox/modules/workbox-precaching/)
- [VitePWA workbox option](https://vite-pwa-org.netlify.app/workbox/)
