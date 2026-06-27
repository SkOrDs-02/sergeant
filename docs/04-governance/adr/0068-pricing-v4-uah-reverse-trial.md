# ADR-0068: Pricing v4 — ₴199/міс, зворотній trial, уточнені ліміти Free/Pro

- **Status:** Accepted
- **Last touched:** 2026-06-27 by @SkOrDs-02. **Next review:** 2026-09-27.
- **Date:** 2026-06-27
- **Deciders:** @SkOrDs-02
- **Supersedes:** [ADR-0051](./0051-pricing-v3-single-tier.md)
- **Related:**
  - [`docs/01-product/launch/business/01-monetization-and-pricing.md`](../../01-product/launch/business/01-monetization-and-pricing.md)
  - [`docs/01-product/launch/business/06-monetization-architecture.md`](../../01-product/launch/business/06-monetization-architecture.md)
  - [`docs/04-governance/adr/0001-monetization-architecture.md`](./0001-monetization-architecture.md)
  - [`docs/90-work/initiatives/0010-revenue-first-launch.md`](../../90-work/initiatives/0010-revenue-first-launch.md)

---

## Context and Problem Statement

ADR-0051 зафіксував модель Free + Pro з ціною \$7/міс / \$49/рік (USD), класичним 7-денним trial без картки і лімітом Free AI 5 повідомлень/день. Три конкретні рішення потребують перегляду перед production-rollout білінгу:

1. **Валюта:** USD-ціна суперечить принципу «UA-only на старті» і викликає конверсійний бар'єр — юзер бачить долари на UA-аудиторії. Ціна повинна бути зафіксована в гривні.
2. **Trial-модель:** класичний opt-in trial (7 днів безкоштовно, потім платиш) має нижчу activation rate, ніж reverse trial (нові юзери автоматично на Pro, downgrade при відмові). B2C дані показують +20–40 % до activation і кращий aha-moment у повному Pro-досвіді.
3. **Точні ліміти Free/Pro:** ADR-0051 не зафіксував повний перелік функцій Free-тіру (зокрема ручний трекінг без числових лімітів, cloud-sync 2 пристрої) і точне визначення Pro-функцій (AI memory, фото-AI, Mono/Privat auto-sync, multi-currency, PDF-export, weekly digest).

## Considered Options

1. **In-place patch ADR-0051** — дозаписати нові цифри у той самий ADR. Порушує принцип immutability ADR (README § Immutability): ADR — історичний запис рішення на момент ухвалення.
2. **Новий ADR-0068 з Supersedes: ADR-0051** — канонічний підхід згідно з lifecycle-таблицею (`Superseded by ADR-NNNN`).
3. **Do nothing** — запускати білінг із застарілим ADR. Неприйнятно: код буде суперечити governance-документу.

## Decision

Приймаємо **варіант 2: новий ADR-0068**, що замінює ADR-0051 в частині ціни, trial-механіки і лімітів тірів.

### Ціна

| Тір  | Місячний план | Річний план                |
| ---- | ------------- | -------------------------- |
| Free | ₴0            | —                          |
| Pro  | **₴199/міс**  | **₴1 490/рік** (~₴124/міс) |

Валюта — виключно UAH для UA-ринку. USD-ціни з'являться разом з EN-лендингом (Phase 6, поза цим ADR).

### Trial — reverse trial

Кожен новий зареєстрований юзер автоматично отримує **7 днів Pro** без прив'язки картки. Після закінчення trial — автоматичний downgrade до Free, якщо юзер не оформив підписку.

Відмінність від класичного trial:

- **Класичний trial:** юзер бачить Free, потім opt-in «спробуй Pro».
- **Reverse trial:** юзер одразу бачить повний Pro-досвід; downgrade — подія, яку він помічає і хоче уникнути.

### Ліміти тірів

#### Free

| Функція          | Ліміт                             |
| ---------------- | --------------------------------- |
| Модулі           | Всі 4 функціональні               |
| Ручний трекінг   | Без числових лімітів (необмежено) |
| AI-чат           | **15 повідомлень/день**           |
| Cloud-sync       | **2 пристрої**                    |
| Mono/Privat sync | Тільки ручне                      |
| AI memory        | —                                 |
| Фото-AI (їжа)    | —                                 |
| PDF-export       | —                                 |
| Weekly digest    | —                                 |
| Multi-currency   | —                                 |

#### Pro

| Функція                          | Ліміт                                                     |
| -------------------------------- | --------------------------------------------------------- |
| Усе з Free                       | +                                                         |
| AI-чат                           | **∞** (з tiered-деградацією моделі як cost-guard — day 1) |
| AI memory                        | ✅                                                        |
| Фото-AI (їжа)                    | ✅                                                        |
| Mono/Privat auto-sync + backfill | ✅                                                        |
| Multi-currency                   | ✅                                                        |
| PDF-export                       | ✅                                                        |
| Weekly digest                    | ✅                                                        |
| Cloud-sync                       | ∞ (необмежено пристроїв)                                  |

### Tiered-деградація моделі (незмінна передумова)

Деградація моделі (premium → standard → Haiku-3 floor) увімкнена з day 1 як cost-guard для Pro AI ∞. Деталі у відповідному PR і плані. Це рішення зафіксовано паралельно і не є scope цього ADR.

## Rationale

- **₴199 vs $7:** при ₴44/\$ ≡ ₴199 ≈ \$4.52 — нижче попередньої USD-ціни, але cognitively «менше двохсот» для UA-аудиторії; відповідає прайсингу Fabulous/Streaks у ₴-еквіваленті. Gross margin позитивна: \$3–5 Anthropic API cost при tiered-деградації → позитивна маржа навіть у песимістичному сценарії.
- **₴1490/рік:** ~₴124/міс — економія ₴900/рік порівняно з місячним планом. Річний pricing anchor підвищує ARPU і знижує churn.
- **Reverse trial:** industry-дані (Lenny Rachitsky, 2024; UserPilot, 2025) показують +20–40 % conversion до paid порівняно з класичним trial на аналогічних productivity apps. Юзер отримує повний Pro-досвід від першого дня → aha-moment наступає раніше → downgrade психологічно неприємніший за opt-in.
- **Free ручний трекінг без лімітів:** обмеження числа записів (транзакцій, тренувань) — friction на найнижчому рівні воронки і знижує activation rate. Обмеження у Free — лише на дорогі (AI) або sync-залежні функції.
- **Free AI 15 msg/day (не 5):** 5 повідомлень/день — надто мало для реального use case (юзер вичерпує за першу сесію і йде розчарований). 15 — достатньо для щоденного core-use, але стимулює upgrade для heavy users.
- **Free cloud-sync 2 пристрої (не 0):** повна відсутність sync у Free — сильний friction для multi-device юзерів. 2 пристрої = phone + laptop; достатньо для більшості, стимулює upgrade для розширених сценаріїв.

## Consequences

### Positive

- Чіткий і повний feature-matrix для реалізації `effectiveLimits()`.
- Reverse trial = менший cognitive load при signup (немає «яку картку прив'язати?»).
- AI-ліміт Free 15 → менший churn на стадії activation.
- ₴ ціна → менший конверсійний бар'єр для UA-аудиторії.

### Negative

- Reverse trial потребує автоматичного downgrade-logic і повідомлення юзеру на день 5 і день 7.
- `effectiveLimits()` має враховувати `trial_ends_at` з таблиці `subscriptions` для correct gating під час trial-вікна.
- Unit-economics у `01-monetization-and-pricing.md` § 9 (LTV/CAC) потребують оновлення під нову ціну (поза scope цього ADR).

### Neutral

- Stripe price IDs потребують перестворення — окремий ops-крок перед production rollout.
- Paywall-копія «Спробуй Pro — 7 днів» досі актуальна за UX-моделлю (reverse trial теж 7 днів), але тепер показується як попередження перед downgrade, а не як opt-in CTA.

## Compliance

- `effectiveLimits()` у `apps/server/src/modules/billing/` повертає `aiChatPerDay: 15` для Free, `aiChatPerDay: Infinity` для Pro/trial, `cloudSyncDevices: 2` для Free, `cloudSyncDevices: Infinity` для Pro.
- `subscriptions` таблиця містить `trial_ends_at TIMESTAMPTZ NULL` — NULL після trial або для юзерів, що одразу перейшли на платний план.
- Pricing page (`/pricing`) показує ₴199/міс і ₴1490/рік. Перевіряється у E2E Phase 4.2.
- `docs/01-product/launch/business/01-monetization-and-pricing.md` оновлено з маркером «Superseded by ADR-0068» для USD-цін і класичного trial.

## Links

- [ADR-0051](./0051-pricing-v3-single-tier.md) — попередній pricing ADR (superseded)
- [ADR-0001](./0001-monetization-architecture.md) — базова архітектура монетизації
- [`docs/01-product/launch/business/01-monetization-and-pricing.md`](../../01-product/launch/business/01-monetization-and-pricing.md)
- [`docs/90-work/initiatives/0010-revenue-first-launch.md`](../../90-work/initiatives/0010-revenue-first-launch.md)
