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

- `Contact:` — щонайменше один canonical channel. Поки що — лише
  `https://github.com/Skords-01/Sergeant/security/advisories/new`. Email-
  mailbox `security@…` як друге Contact-поле — open follow-up (див. секцію
  «Open follow-ups» нижче).
- `Expires: 2026-12-31T23:59:59Z` — refreshed yearly.
- `Preferred-Languages: uk, en`.
- `Canonical:` — both `sergeant.2dmanager.com.ua` і `sergeant.vercel.app`.
- `Encryption: <PGP-key URL>` (optional, не додано — open follow-up).

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
Expires: 2026-12-31T23:59:59Z
Preferred-Languages: uk, en
Canonical: https://sergeant.2dmanager.com.ua/.well-known/security.txt
Canonical: https://sergeant.vercel.app/.well-known/security.txt
```

Зміни проти попередньої версії:

- **`Contact:`** — лишається GitHub Security Advisories як **єдиний** primary
  channel (private disclosure через GitHub UI). Email-mailbox `security@…` поки
  що **не** додано — див. open follow-up нижче.
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

### 2026-05-04 — follow-up: drop unverified email contact

На review-етапі (одразу після merge-у попереднього commit-у) виявлено, що
`mailto:security@2dmanager.com.ua` додано як друге Contact-поле, але mailbox
**не** налаштований (нема MX-record-у на домені). Поле, яке вказує на
nonexistent mailbox, гірше за відсутнє поле: research-disclosure впаде у void,
і дослідник може взагалі не репортити вразливість.

**Виправлено:** видалено `Contact: mailto:security@2dmanager.com.ua` з
`apps/web/public/.well-known/security.txt`. Лишається тільки GitHub Security
Advisories як primary channel. Email + PGP перенесено у «Open follow-ups»
нижче (не блокує закриття I4).

## Open follow-ups (не блокують закриття I4)

### 1. Email-канал як друга `Contact:` стрічка

**Статус:** не вирішено (станом на 2026-05-04).

RFC 9116 §2.5.4 рекомендує надавати кілька каналів зв'язку. Зараз лишаємось
тільки на GitHub Security Advisories — це працює для дослідників із GitHub-
аккаунтом, але викидає тих, хто хоче відправити чутливий disclosure через
email (наприклад, з PGP-encryption).

**Що треба зробити, перш ніж додавати другий Contact:**

1. Вирішити, **який** email-mailbox використовувати:
   - `security@2dmanager.com.ua` — потребує налаштування MX-record-у на
     custom-домені, реальної inbox і routing-у на `@Skords-01` (forwarding або
     shared-mailbox).
   - Або `sergeant-security@<gmail/proton>` — швидше, але менш «брендовано».
2. Налаштувати mailbox і верифікувати inbound delivery (test message →
   confirmed delivery).
3. Опціонально — згенерувати PGP-key і опублікувати під `Encryption:` (RFC 9116
   §2.5.3). Без PGP email-канал годиться лише для **низько-чутливих**
   disclosure-ів; для критичних вразливостей дослідник перейде на GitHub
   Security Advisories у будь-якому разі.
4. Додати другу `Contact: mailto:…` стрічку і опційно `Encryption: <key URL>`
   у `apps/web/public/.well-known/security.txt`. CI-guard на expiry не
   зачіпається.

**Чому НЕ додано в I4-PR-і:** mailbox `security@2dmanager.com.ua` поки що **не**
налаштований. Краще лишити один robust-канал (GitHub Security Advisories),
поки email не підготовлений.

**Owner:** `@Skords-01`. Підняти окремою карткою (`I4.1`) або ad-hoc-issue,
коли mailbox буде готовий.

### 2. PGP-key (`Encryption:` поле, RFC 9116 §2.5.3)

**Статус:** не вирішено (станом на 2026-05-04).

Опціональне поле. Має сенс **тільки після** того, як email-канал буде доданий
(див. follow-up #1) — без email-канала PGP-key немає куди застосувати.

**Owner:** `@Skords-01`. Не блокує закриття I4.
