# 2026-05-06 — Перший екран більше не порожній

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

> **Modal id:** `2026-05-06-cold-start` —
> [`apps/web/src/core/whatsNew/releases.ts`](../../apps/web/src/core/whatsNew/releases.ts)

> **UX-feedback 2026-05-08:** копія цього запису була переписана
> in-place. Оригінальний текст («outcome card», «FTUX-копія»,
> `pnpm bootstrap`, «drift-check у CI») був інженерним жаргоном замість
> release-нот для юзера. Це bugfix копії — не нова фіча, тому id не
> мінявся (інакше modal знову б випадав усім, хто вже закрив попередню
> версію). Інженерні підпункти (release-engineering tooling, license
> SBOM) винесені в розділ «Внутрішня кухня» нижче — у юзерський modal
> вони не потрапляють.

## TL;DR (юзер-facing — те що бачить modal)

Після знайомства ти одразу бачиш картку з конкретним першим кроком,
а не пустий екран. Текст вступу теж став зрозумілішим — про те, що
ти отримаєш, а не перелік функцій.

## Items (юзер-facing — те що бачить modal)

- **Feature** — На головному з'являється картка з першим кроком —
  клік, і ти вже у потрібному розділі.
- **Improvement** — Текст на стартовому екрані переписали — тепер він
  говорить про результат, а не перелічує функції.
- **Fix** — Анімацію з конфетті прибрали з кінця знайомства — вона
  з'являється тільки після того, як ти зробиш перший запис.

## Внутрішня кухня (НЕ потрапляє у юзерський modal)

Це інженерні зміни, які поїхали разом з релізом, але не релевантні
для звичайного користувача — ховаємо їх з in-product release notes.

- **Improvement** — Soft-Auth fear-based copy замінено на neutral-tone
  (audit finding 8.3.13).
- **Improvement** — `pnpm bootstrap` — один command для нового агента
  замість 4-х розрізнених install-ів.
- **Improvement** — `THIRD_PARTY_LICENSES.md` — автогенерація + drift-check
  у CI (`pnpm licenses:check`); 1036 shipped-packages, allowlist у
  `scripts/generate-licenses.mjs`.

## Чому

FTUX [master tracker](../launch/product-os/ftux-master-tracker.md)
§3.1 (Wave 1) — закриваємо знахідки 2026-05-03 roast §8.1 (P0):

- **8.1.1** Hero copy продає features, не результат → [PR #1944](https://github.com/Skords-01/Sergeant/pull/1944) (PR-04, disciplined arm у v2 split).
- **8.1.2** Confetti до першої цінності → [PR #1609](https://github.com/Skords-01/Sergeant/pull/1609) (S1.3).
- **8.1.3** «Відкрити Sergeant» закидає на порожній dashboard → PR-09 (outcome-card replaces empty TODO).
- **8.3.13** Soft-Auth fear-based copy → [PR #1623](https://github.com/Skords-01/Sergeant/pull/1623) (S3.5).

PR-17 з §3.3 (Wave 3 — Platform parity) — license SBOM
([#516](https://github.com/Skords-01/Sergeant/pull/516) +
[#517](https://github.com/Skords-01/Sergeant/pull/517) +
[#518](https://github.com/Skords-01/Sergeant/pull/518)).

## Метрики

**Що очікуємо у PostHog за 7 днів:**

- `whats_new_shown` для `2026-05-06-cold-start` ≥ 80% returning-users
  D1+ (всі, хто закінчили онбординг до 2026-05-06).
- `whats_new_cta_clicked` / `whats_new_shown` ≥ 30% — це та сама
  `d7_returning_user_engagement_with_whats_new` метрика з FTUX-плану
  PR-18.
- `whats_new_dismissed{via: "close"}` ≤ 50% — якщо більше, copy / hero
  занадто слабкі.

**Rollback criterion:** якщо `whats_new_shown` спричинить
`onboarding_completed` drop ≥ 5% (юзер бачить modal на cold-start і
не повертається до подальшого онбординг-flow), вимикаємо
`<WhatsNewModal />` через feature-flag і шукаємо first-render conflict
з outcome-card.
