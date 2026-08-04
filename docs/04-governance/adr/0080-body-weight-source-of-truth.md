# ADR-0080: Єдине джерело істини ваги тіла — fizruk

- **Status:** Accepted
- **Last validated:** 2026-07-25 by @Skords-01. **Next review:** 2026-10-23.
- **Date:** 2026-07-25
- **Reviewers:** @SkOrDs-02
- **Supersedes:** —
- **Related:**
  - [`docs/01-product/model/fizruk.md`](../../01-product/model/fizruk.md) — канон fizruk §3, §10.
  - [`docs/01-product/model/nutrition.md`](../../01-product/model/nutrition.md) — TDEE/BMR споживають вагу.
  - [`apps/web/src/core/profile/biometrics.ts`](../../../apps/web/src/core/profile/biometrics.ts) — докстрінг про профільне поле, що втрачає силу.
  - [`docs/90-work/audits/product-knowledge-fizruk.md`](../../90-work/audits/product-knowledge-fizruk.md) § C3/D-3.

---

## 0. TL;DR

Вага тіла живе **тільки у fizruk**, у таблиці **`fizruk_measurements`**.
`hub_biometrics.weightKg` перестає бути самостійним полем і стає кешем.
Nutrition читає вагу звідти для BMR/TDEE.

## 1. Контекст

Вага зберігалась у двох місцях і вони розходились: профільне поле
`hub_biometrics` і журнал вимірювань fizruk. Канон fizruk §10 `[ІНТЕРВ'Ю]` каже
«одне джерело істини ваги тіла — fizruk», але докстрінг
`core/profile/biometrics.ts` дослівно фіксує протилежну вимогу: окреме профільне
поле існує, «щоб користувач без модуля Fizruk мав вхідні дані для BMR/TDEE».

Обидва твердження легітимні, тому рішення не могло бути ухвалене агентом.

## 2. Рішення

**SoT — `fizruk_measurements`.** Обґрунтування вибору саме цієї таблиці, а не
`fizruk_daily_log`: канон fizruk §3 приписує «вагу тіла» сутності Measurement;
mobile-екрани Body/Progress/Measurements уже читають звідти; `fizruk_daily_log`
семантично — журнал сну, енергії й настрою, що годує recovery, і вага там
чужорідна.

`hub_biometrics.weightKg` лишається як **кеш останнього відомого значення** для
швидкого читання, але перестає бути джерелом правди й не приймає незалежних
записів.

## 3. Наслідки

**Відомий регрес видимої фічі — закрито рішенням власника 2026-08-04.**
Користувач **без увімкненого fizruk** ризикував втратити розрахунок TDEE у
nutrition, бо вага більше не мала бути незалежним полем профілю. Мітигація:
**профіль лишається головним входом для ваги** (форма Біометрії далі приймає
`weightKg`), просто цей вхід тепер завжди йде **через fizruk**, а не поруч із
ним — `BiometricsSection` пише в fizruk-журнал через `useDailyLog.addEntry`,
який (стадія 2 W1-WEIGHT-SOT) сам мірить назад у `hub_biometrics` через
`recordBodyWeight()`. Користувач без модуля fizruk і далі вводить вагу на
Профілі — просто запис тепер завжди має SoT-копію в `fizruk_measurements`, а
не лише в кеші. Для тих, у кого вага вже лежала лише в кеші (записана до цього
рішення), клієнтський bootstrap (стадія 4, нижче) одноразово сідить
fizruk-журнал значенням з кешу.

**Докстрінг `biometrics.ts` більше не описує чинну вимогу** і оновлюється разом
із cutover-стадією — інакше наступний агент прочитає його як діючу специфікацію.

**Вага переживає зміну пристрою** — головна виграшна властивість: `fizruk_measurements`
синкується, тоді як профільне поле не мало ні запису в `OP_LOG_TABLE_REGISTRY`,
ні міграції, а `SYNC_MODULES.profile` лишався мертвим tombstone-ом.

**Bootstrap (стадія 4) — клієнтський, не SQL-міграція.** `hub_biometrics` не
має серверної колонки чи таблиці (localStorage-only, поза
`OP_LOG_TABLE_REGISTRY`), тож немає ані backfill-джерела для серверної
міграції, ані що дропати двофазним `DROP` (Hard Rule #4 тут незастосовний).
Замість цього — клієнтський одноразовий сід
(`bootstrapBodyWeightFromBiometrics()`,
`apps/web/src/modules/fizruk/lib/bodyWeightBootstrap.ts`, викликається з
`sqliteReadBoot.ts`): коли `fizruk_measurements` + `fizruk_daily_log` разом не
дають жодного зважування (`selectLatestBodyWeight` → `null`), а
`hub_biometrics.weightKg` є — пише один рядок у `fizruk_measurements` із
`weightUpdatedAt` як момент виміру. Ідемпотентний за конструкцією: наступний
boot бачить непорожній журнал і no-op-ить, без окремого прапорця.

## 4. Що це закриває

- Канон fizruk §10 — тепер має ратифікований механізм, а не лише намір.
- Аудит fizruk § C3/D-3.
- Беклог, рядок `W1-WEIGHT-SOT` — ✅ стадії 1-4 (2026-08-04).
