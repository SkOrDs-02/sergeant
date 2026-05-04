# L4 — `<html lang>` attribute audit

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Low (a11y / SEO, not security)  |
| **Sprint**     | [Sprint 4](./sprint-4.md)       |
| **Owner**      | frontend                        |
| **Effort**     | 0.1 person-day                  |
| **Status**     | Open                            |
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
