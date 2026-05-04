# M12 — `web-vitals` ingest needs cap, allowlist, and User-Agent normaliser

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Medium                          |
| **Sprint**     | [Sprint 3](./sprint-3.md)       |
| **Owner**      | backend                         |
| **Effort**     | 0.25 person-day                 |
| **Status**     | Open                            |
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
