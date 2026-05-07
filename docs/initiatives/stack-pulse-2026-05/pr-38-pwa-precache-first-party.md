# PR-38: PWA precache 1st-party verify

> **Last validated:** 2026-05-07 by Devin. **Next review:** 2026-08-05.
> **Status:** Planned

|                    |                                                                              |
| ------------------ | ---------------------------------------------------------------------------- |
| **Severity**       | Low (L11)                                                                    |
| **Linked finding** | L11 (`00-overview.md`)                                                       |
| **Owner**          | TBD (sponsor: @Skords-01)                                                    |
| **Effort**         | 0.5 дня                                                                      |
| **Risk**           | Low (build-time check; не міняє runtime SW)                                  |
| **Touches**        | `apps/web/vite.config.js`, `apps/web/scripts/`                               |
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
})
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

- [ ] `apps/web/scripts/check-precache-1st-party.mjs`.
- [ ] CI step `check-precache` running on every PR.
- [ ] Vite config explicit `globPatterns` + `globIgnores`.
- [ ] `docs/web/pwa-policy.md`.
- [ ] Test: intentional 3rd-party URL у dist → CI fail.

## Тести

- `apps/web/scripts/__tests__/check-precache.test.mjs` — fixture:
  - all-1st-party manifest → pass.
  - mixed manifest → fail з URL list.

## Rollout

- Single PR.

## Risks & mitigations

| Risk                                                              | Mitigation                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------- |
| Edge-case 3rd-party (Google Fonts woff2) needed legitimately       | Explicit allowlist у script з reason-comment              |
| Manifest format change у VitePWA upgrade ламає parser             | Regex robust; test-suite covers majeure VitePWA versions  |

## Touchpoints (file:line)

- `apps/web/vite.config.js` — VitePWA config
- `apps/web/scripts/check-precache-1st-party.mjs` — new
- `apps/web/scripts/__tests__/check-precache.test.mjs` — new
- `.github/workflows/web-build.yml` — додати check
- `docs/web/pwa-policy.md` — new

## Refs

- [Workbox precache documentation](https://developer.chrome.com/docs/workbox/modules/workbox-precaching/)
- [VitePWA workbox option](https://vite-pwa-org.netlify.app/workbox/)
