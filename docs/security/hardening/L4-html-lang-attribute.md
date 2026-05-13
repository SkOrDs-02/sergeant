# L4 — `<html lang>` attribute audit

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Closed (2026-05-05) — see Resolution log.

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Low (a11y / SEO, not security)  |
| **Sprint**     | [Sprint 4](./sprint-4.md)       |
| **Owner**      | frontend                        |
| **Effort**     | 0.1 person-day                  |
| **Status**     | **Closed** (2026-05-05)         |
| **Discovered** | 2026-05-03 deep security review |

## Summary

Confirm `<html lang="...">` is set on `apps/web/index.html`. While not a
security concern, screen readers and search engines depend on it, and the
audit caught it as an "easy fix while you're in there".

## Recommendation

Use `lang="uk"` (the project's primary language) or `lang="uk-UA"`.

## Correction points

- `apps/web/index.html` — `<html lang="uk">`.
- `apps/web/__tests__/index-html.test.ts` (new or extend) — assert the
  attribute is present.

## Verification

- **Lint:** snapshot test of the rendered HTML.
- **Manual:** Lighthouse a11y score includes "html element has a lang
  attribute".

## Cross-references

- [`./L3-meta-referrer.md`](./L3-meta-referrer.md)

## Resolution log

### 2026-05-05 — closed

`apps/web/index.html` already shipped `<html lang="uk">` (set during the
original scaffold). The audit only flagged this card for **explicit
assertion**: without a regression test, a future meta-tag refactor could
strip the attribute and break Lighthouse a11y / screen-reader pronunciation
silently.

New regression test [`apps/web/src/test/indexHtmlLang.test.ts`](../../../apps/web/src/test/indexHtmlLang.test.ts)
locks three properties of the static HTML:

1. `<html>` declares a `lang` attribute (any value).
2. The value matches `^uk(-UA)?$` (the project's primary product language).
3. The attribute lives on the literal opening `<html>` tag — not added at
   runtime — so SSR and static crawlers see it.

Batched with **L5 + L6 + M21** in the same hardening PR (Sprint 4 hygiene
sweep + M21 COEP doc).
