# I4 — `/.well-known/security.txt` content + expiry refresh

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** **Closed (2026-05-04)**

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Informational / hardening       |
| **Sprint**     | [Sprint 4](./sprint-4.md)       |
| **Owner**      | platform                        |
| **Effort**     | 0.1 person-day                  |
| **Status**     | **Closed (2026-05-04)**         |
| **Discovered** | 2026-05-03 deep security review |

## Summary

`vercel.json` already exposes `/.well-known/security.txt`. Confirm the
content includes:

- `Contact: mailto:security@2dmanager.com.ua` (or equivalent).
- `Expires: 2026-12-31T23:59:59Z` — refreshed yearly.
- `Preferred-Languages: uk, en`.
- `Encryption: <PGP-key URL>` (optional but recommended).

Without a fresh `Expires` field, RFC 9116 considers the file expired and
researchers may be deterred from reporting.

## Recommendation

- Standardise the content; commit a `apps/web/public/.well-known/security.txt`
  source file.
- Add a CI guard that fails if `Expires` is < 30 days from now.

## Correction points

- `apps/web/public/.well-known/security.txt` — refreshed content.
- `scripts/check-security-txt-expiry.sh` (new) — CI guard.
- `docs/security/README.md` — link to the file and the maintenance
  cadence.

## Verification

- **Manual:** `curl https://<domain>/.well-known/security.txt` returns the
  expected fields.
- **CI:** the guard fails when `Expires` is within 30 days.

## Cross-references

- [`./H7-vercel-config-drift.md`](./H7-vercel-config-drift.md)
- [`../README.md` → Secret scanning policy](../README.md#secret-scanning-policy)
- [RFC 9116 — A File Format to Aid in Security Vulnerability Disclosure](https://datatracker.ietf.org/doc/html/rfc9116)

## Resolution log

### 2026-05-04 — Closed

**Зміст файлу `apps/web/public/.well-known/security.txt`:**

```
Contact: https://github.com/Skords-01/Sergeant/security/advisories/new
Contact: mailto:security@2dmanager.com.ua
Expires: 2026-12-31T23:59:59Z
Preferred-Languages: uk, en
Canonical: https://sergeant.2dmanager.com.ua/.well-known/security.txt
Canonical: https://sergeant.vercel.app/.well-known/security.txt
```

Зміни проти попередньої версії:

- **Дві `Contact:` стрічки** — RFC 9116 §2.5.4 рекомендує надати кілька каналів.
  GitHub Security Advisories — primary (private disclosure через GitHub UI),
  email — fallback для дослідників, що не мають GitHub-аккаунта.
- **`Expires: 2026-12-31T23:59:59Z`** — рік уперед (RFC 9116 §2.5.5 каже "SHOULD
  NOT be in excess of one year"); було `2027-01-01T00:00:00.000Z` (>= рік).
  Поточно лишається 241 день — CI-guard не біситься.
- **`Canonical:`** — два URL-и (custom-домен `sergeant.2dmanager.com.ua` +
  Vercel-fallback). RFC 9116 §2.5.2 рекомендує `Canonical:`, щоб дослідник
  міг переконатися, що файл не відредагований MITM-ом.

**CI guard `scripts/check-security-txt-expiry.sh`:**

- Перевіряє наявність файлу.
- Парсить `Expires:` через `date -d` (ISO 8601).
- Падає, якщо expiry в минулому **або** до нього лишилося <30 днів.
- Wired у `.github/workflows/ci.yml` як крок `security.txt expiry guard`
  поряд із `Vercel config drift guard`.

**Перевірено локально:**

```bash
$ bash scripts/check-security-txt-expiry.sh
security.txt: OK (expires in 241 day(s), at 2026-12-31T23:59:59Z)
```

**Maintenance cadence:**

- Бамп `Expires:` раз на 6–9 місяців (буфер CI-guard-у — 30 днів, щоб PR-зашуміти,
  а не блокувати у production-window).
- Якщо змінюється email або PGP-key, додавати новим Contact-/Encryption-полем,
  не видаляти старе одразу — даємо час дослідникам переключитися (≥3 місяці
  співіснування).
