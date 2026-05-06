# PR-14: Vercel COEP review (require-corp)

> **Last validated:** 2026-05-06 by Codex. **Next review:** 2026-08-04.
> **Status:** Closed (2026-05-05, doc-only) — resolved by M21 compatibility matrix

|              |                                                            |
| ------------ | ---------------------------------------------------------- |
| **Severity** | High (H8)                                                  |
| **Owner**    | TBD                                                        |
| **Effort**   | 0.5 дня                                                    |
| **Risk**     | Medium (зміна security-header-у може зламати iframe-embed) |
| **Touches**  | `vercel.json`, `apps/web/index.html`, web E2E              |

## Контекст

```jsonc
// vercel.json:30
{ "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
```

`COEP: require-corp` забороняє завантаження будь-яких cross-origin ресурсів, які явно не виставили `CORP: cross-origin` (Cross-Origin-Resource-Policy) або CORS headers. Це enables `SharedArrayBuffer` і high-resolution timers — потужно для WASM workloads.

**Питання:** чи Sergeant використовує SharedArrayBuffer / WebAssembly threads? Скоріше — ні (ChartKit, Tailwind, React — все scalar JS).

Якщо ні — `require-corp` тільки додає brittleness:

- Будь-який third-party iframe (PostHog session-replay, Sentry replay, Stripe checkout у майбутньому, embed-and-share content) — ламається.
- Кожна third-party CDN-картинка вимагає `crossorigin="anonymous"` атрибут і CORS-headers від CDN.

## Scope

### 1. Audit

- Пошук `SharedArrayBuffer` / `WebAssembly` / `wasm` references у codebase. Якщо нема — COEP не потрібен.
- Перевірка PostHog / Sentry session-replay — чи їхні assets compatible (PostHog public CDN вже виставляє правильні CORP-headers, але треба підтвердити).

### 2. Decision

- **Якщо SharedArrayBuffer не використовується:** змінити на `COEP: credentialless` (м'якший варіант, дозволяє cross-origin без credentials) АБО прибрати COEP взагалі (тільки COOP залишити).
- **Якщо used:** залишити `require-corp`, але додати explicit allowlist для third-party origins у `vercel.json` rewrites (щоб legitimate CDN-зображення проходили з `Cross-Origin-Resource-Policy: cross-origin`).

### 3. E2E coverage

- `apps/web/tests/e2e/security-headers.spec.ts` — assert що response-headers сходяться з `vercel.json`.
- Smoke iframe-test: спробувати embed Stripe-checkout-iframe (або mock) → перевірити що нічого не блокується.

## Out of scope

- Зміна COOP / CORP / X-Frame-Options policy — окремий PR якщо потрібно.

## Acceptance criteria (DoD)

- [x] Audit doc captured as [`docs/security/hardening/M21-coep-stripe-compatibility.md`](../../security/hardening/M21-coep-stripe-compatibility.md) plus [`docs/deploy/vercel.md`](../../deploy/vercel.md#third-party-iframe--cross-origin-compatibility).
- [x] `vercel.json` decision recorded: no change required while `require-corp` is load-bearing for SQLite-WASM.
- [x] Security-header verification recipe documented in `docs/deploy/vercel.md`.
- [x] Sentry / PostHog compatibility recorded as JS-module/connect-src flows, not iframe flows.

## Тести

- `apps/web/tests/e2e/security-headers.spec.ts` — Playwright headers-assertion.

## Rollout

- Single PR. Якщо третя сторона (Sentry/PostHog) ламається після зміни — fallback на попередній COEP-mode через `vercel.json` revert.

## Risks & mitigations

| Risk                                            | Mitigation                                             |
| ----------------------------------------------- | ------------------------------------------------------ |
| Зміна COEP ламає embed з невідомого джерела     | E2E тести на основні flow + manual session-replay test |
| `credentialless` не повністю широко підтриманий | Перевірити caniuse — наразі OK у всіх major browsers   |

## Touchpoints (file:line)

- `vercel.json:30` — COEP header
- `apps/web/tests/e2e/security-headers.spec.ts` — новий
- `docs/notes/spikes/2026-05-coep-audit.md` — новий

## Refs

- [MDN COEP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Embedder-Policy)
- [Web.dev: COOP/COEP](https://web.dev/articles/coop-coep)

## Resolution note

Already resolved by [`M21`](../../security/hardening/M21-coep-stripe-compatibility.md)
and the canonical compatibility matrix in
[`docs/deploy/vercel.md`](../../deploy/vercel.md#third-party-iframe--cross-origin-compatibility).
No `vercel.json` change is required today: `require-corp` remains load-bearing
for the SQLite-WASM `crossOriginIsolated` path, and Stripe/OAuth iframes must
record an explicit COEP exception before launch.
