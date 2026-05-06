# 2026-05-06 — Холодний старт без порожнього дашборду

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Active

> **Modal id:** `2026-05-06-cold-start` —
> [`apps/web/src/core/whatsNew/releases.ts`](../../apps/web/src/core/whatsNew/releases.ts)

## TL;DR

Перший візит після онбордингу більше не закидає на пустий дашборд:
ми додали outcome-card («ось що ти отримаєш»), почистили дублюючі
checkout-CTA та вкрутили автогенерований SBOM-чек — щоб legal-команда
не дзвонила після кожного `pnpm install`.

## Items

- **Feature** — Outcome card на cold-start заміняє «empty TODO»
  дашборд: показує очікуваний результат і перший action для обраного
  модуля.
- **Improvement** — Hero copy «disciplined» арм у v2-split: фокус на
  результат, а не на features (audit finding 8.1.1).
- **Improvement** — `pnpm bootstrap` — один command для нового агента
  замість 4-х розрізнених install-ів.
- **Fix** — Confetti на wizard-finish прибрано: celebration лишається
  тільки після першої реальної цінності, а не за факт натиснення
  «Готово» (audit findings 8.1.2 + 8.2.7).
- **Fix** — Soft-Auth fear-based copy замінено на neutral-tone
  (audit finding 8.3.13).
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
