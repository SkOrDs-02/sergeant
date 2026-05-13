# M12 — `web-vitals` ingest needs cap, allowlist, and User-Agent normaliser

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Closed (2026-05-04)

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Medium                          |
| **Sprint**     | [Sprint 3](./sprint-3.md)       |
| **Owner**      | backend                         |
| **Effort**     | 0.25 person-day                 |
| **Status**     | Closed (2026-05-04)             |
| **Discovered** | 2026-05-03 deep security review |

## Summary

`/api/web-vitals` is sessionless by design. Without explicit caps it becomes
an attractive abuse vector — large bodies, raw User-Agent storage, and
arbitrary metric names.

## Recommendation

Confirm the endpoint enforces all of:

1. Per-IP rate-limit (50/min).
2. Body-size cap (10 KB).
3. Allowlist of metric names: `LCP`, `FID`, `CLS`, `TTFB`, `INP`, `FCP`.
4. Normalise `User-Agent` to a coarse fingerprint (browser family + major
   version) before persisting.

## Correction points

- `apps/server/src/modules/observability/webVitals.ts` — enforce each guard
  with structured 4xx responses.
- `apps/server/src/lib/uaNormalise.ts` (new) — extract the normaliser so
  push and other endpoints can reuse it.
- `apps/server/src/modules/observability/webVitals.test.ts` — Supertest
  cases per guard.

## Verification

- **Unit:** request with metric name `evil-metric` returns 422.
- **Unit:** body of 11 KB returns 413 without invoking the handler.
- **Manual:** rate-limit smoke test using `wrk` against staging.

## Cross-references

- [`./M9-per-ip-secondary-rate-limit.md`](./M9-per-ip-secondary-rate-limit.md)
- [`./M14-internal-push-ip-allowlist.md`](./M14-internal-push-ip-allowlist.md)

## Resolution (2026-05-04)

Закрито batched M7 + M12 hardening PR. Уточнення: канонічний шлях ендпойнту в кодбазі — `/api/metrics/web-vitals` (а не `/api/web-vitals` з recommendation-секції); схема payload-а лежить у `WebVitalsPayloadSchema` з `@sergeant/shared`. Картка інтерпретована з урахуванням реальної архітектури.

**Що зроблено:**

- `apps/server/src/lib/uaNormalise.ts` — новий reusable helper `normaliseUserAgent(input: string | null | undefined): string` повертає коарсну форму `"<family> <major>"` (`chrome 121`, `safari-mobile 17`, `firefox 122`, `edge 121`, `opera 106`, ...) або `"unknown"` для bot-ів / curl / порожнього хедера / overflow (>512 байт). Залежно-вільний (regex), детермінований; кардинальність ~7 family × ~30 major versions ≈ 210 значень — безпечно для Prometheus-лейблів і логів. Order regex-патернів важливий: специфічні (Edge, Opera, Chrome-on-iOS) перевіряються перед більш-загальним Chrome / Safari.
- `apps/server/src/lib/uaNormalise.test.ts` — 20 тест-кейсів (10 позитивних — Chrome/Edge/Opera/Firefox/Safari desktop+mobile + iOS WKWebView; 8 negativeових — null/undefined/empty/whitespace/curl/Googlebot/AhrefsBot/UA-overflow; 1 cardinality-bound assertion; 1 порядкова перевірка для розрізнення Edge↔Chrome↔Safari).
- `apps/server/src/modules/observability/web-vitals.ts` — на invalid-payload warn-логу додано `ua_family: normaliseUserAgent(req.headers["user-agent"])`. Сирий `User-Agent` більше не йде в логи / Sentry breadcrumbs з цього хендлера; ретеншн-сейфно.
- `apps/server/src/routes/web-vitals.ts` — per-IP/per-session rate-limit понижено з 60 до 50 r/min (узгоджено з картою).
- `apps/server/src/app.ts` — додано explicit body-size cap `app.use("/api/metrics/web-vitals", express.json({ limit: "10kb" }))` ПЕРЕД глобальним 128 KB парсером (порядок mount-ів важливий — детально пояснено в коментарі біля mount-блоку).
- `apps/server/src/modules/observability/web-vitals.test.ts` — нові тест-кейси під describe `M12 — payload allowlist and UA normalisation`:
  - `evil-metric` (поза allowlist `LCP|INP|FCP|TTFB|CLS`) → 204 без запису метрик до Prometheus (Zod-схема відхиляє payload).
  - На invalid-payload з реальним macOS Safari UA (`Mozilla/5.0 (Macintosh; ...) Version/17.2 Safari/605.1.15`) → у warn-логу `ua_family === "safari 17"` (а не сирий UA з patch-версією).
  - На invalid-payload без `User-Agent`-хедера → `ua_family === "unknown"`.
- `apps/server/src/obs/metrics.ts` — без зміни (Zod вже відсіює invalid metric names; додаткова метрика для allowlist-rejection не потрібна, бо обсяг сигналу маленький).

**Що навмисно НЕ робилось:**

- "Returns 422 / 413 on invalid payload" з recommendation-секції — handler навмисно відповідає `204 No Content` навіть на invalid payload, бо `navigator.sendBeacon` ігнорує response status. Структурований 422 не приніс би користі (клієнт його не побачить), а додав би verbose-лог-шум; security goal (не діяти на сміття + не лікувати атакуючому) виконується через Zod-параз + 10 KB body cap (Express сам відповість 413 ДО потрапляння в handler).
- "Per-IP secondary bucket" як окремий middleware — поточний `rateLimitExpress({ key: "api:web-vitals" })` уже бере composite key (subject + endpoint), а subject для анонімних запитів = IP. Окремий per-IP secondary bucket потрібен у M9 (масовий abuse через багато анонімних сесій), і там же буде закритий (cross-reference вже на місці).
- "Manual: rate-limit smoke test using `wrk` against staging" з verification-секції — staging-test-у не зробили в межах PR, бо потребує VPN + staging credential-ів; покладаємось на існуючий unit-test для rate-limit (`smoke.test.ts`) + integration-tests на `apiV1.test.ts`. Ризик низький: rate-limit-конфігурація — це одне число у `rateLimitExpress({ limit: 50 })` і регресія була б видима у `rate_limit_hits_total{key="api:web-vitals", outcome="blocked"}`.
