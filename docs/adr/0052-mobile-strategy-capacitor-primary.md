# ADR-0052: Mobile strategy — Capacitor primary, Expo parallel (no deprecation)

- **Status:** Accepted
- **Date:** 2026-05-06
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Superseded sections (non-ADR):** sunset-direction sections in [`docs/initiatives/0002-mobile-platform-decision.md`](../initiatives/0002-mobile-platform-decision.md) (sunset schedule T₀/T₁/T₂ reference as "active outcome")
- **Related:**
  - [`docs/initiatives/0010-revenue-first-launch.md`](../initiatives/0010-revenue-first-launch.md)
  - [`docs/initiatives/0002-mobile-platform-decision.md`](../initiatives/0002-mobile-platform-decision.md)
  - [ADR-0010 Mobile dual-track](0010-mobile-dual-track-capacitor-expo.md)

---

## Context and Problem Statement

[ADR-0010](0010-mobile-dual-track-capacitor-expo.md) і [ініціатива 0002](../initiatives/0002-mobile-platform-decision.md) зафіксували sunset schedule для Capacitor shell (T₀ — 2026-09-01, T₁ — 2026-11-30, T₂ — 2026-12-30). Однак у контексті revenue-first пріоритетів 0010 власник ухвалив інше рішення: обидва стеки підтримуються паралельно без активного sunset-треку, поки Expo не досягне feature parity з web.

Без формалізації цього рішення:

- Lint-правило `forbid-shell-only-feature` з ініціативи 0002 потенційно блокує легітимні shell-PR-и.
- ADR-0010 з `accepted-with-sunset` статусом сигналізує команді про sunset, якого не буде.
- Відсутня чітка відповідь: «коли Expo стане primary?» — тригер лишається відкритим.

## Considered Options

1. **Capacitor primary, Expo parallel — без активного sunset** (owner decision для MVP period) — обидва підтримуються; Expo стає primary, коли досягне feature parity; окремий ADR тоді.
2. **Залишити поточний sunset schedule (T₀ 2026-09-01)** — Capacitor freeze → Expo-only; вимагає завершення RN-порту до вересня.
3. **Expo-only зараз** — ігнорувати поточний shell і зосередитись виключно на Expo; ризик: shell вже у store, користувачі є.

## Decision

Приймаємо **варіант 1: Capacitor залишається primary mobile shell до завершення Expo feature parity з web.**

**Конкретно:**

- `apps/mobile-shell/` — активний, отримує підтримку (security patches, Capacitor bumps).
- `apps/mobile/` (Expo + RN) — активний, продовжує RN-порт паралельно.
- **Deprecation жодного зі стеків не активується** до окремого ADR, що фіксує Expo feature parity.
- Sunset-дати T₀/T₁/T₂ з ADR-0010 / ініціативи 0002 **не є active commitments** на період 0010 launch; вони лишаються як reference, але не enforcement deadline.
- Lint-правило `forbid-shell-only-feature` (з ініціативи 0002) лишається активним — нові shell-only модулі без RN-mirror блокуються; але **legitimні shell-glue PR-и** дозволяються через allowlist у `packages/eslint-plugin-sergeant-design/`.

**Тригер для наступного ADR («Expo becomes primary»):**

- Expo `apps/mobile/` має feature parity з web за матрицею у `docs/architecture/platforms.md` (≥18 з 22 рядків = ✅).
- Коли умова виконана → окремий ADR фіксує перехід Expo → primary і активує sunset-трек.

## Rationale

- Revenue-first: billing, auth, landing — чотири тижні роботи. Вкладати ресурс у shell sunset зараз = відволікатись від P0.
- Expo RN-port має 3/3 Exit-маяки ще не зеленими (RN-Nutrition, RN-Voice, Detox e2e — з Outcome 0002). Примусовий freeze до 2026-09-01 = нереалістично.
- Capacitor shell вже у store з реальними users → deprecation без parity = UX регресія.
- Обидва стеки share `@sergeant/shared` та `@sergeant/api-client` — підтримка не вимагає дублювання business логіки.

## Consequences

### Positive

- Команда не витрачає час на shell sunset під час 0010 sprint.
- Shell users отримують безперебійну підтримку.
- Expo RN-порт продовжується без тиску дедлайну, якість вища.

### Negative

- Dual-track maintenance cost лишається (34 shell-commits/30 днів — з shell-tax baseline 2026-05-03).
- Рішення «коли Expo стає primary» відкладено → потребує майбутнього ADR і дисципліни.

### Neutral

- `shell-tax-report.yml` cron (з PR #1633) продовжує збирати baseline — корисний для майбутнього ADR.
- `docs/architecture/platforms.md` feature-parity матриця залишається source of truth; next review — 2026-08-01.

## Compliance

- `docs/initiatives/0002-mobile-platform-decision.md` — додано note «Update 2026-05-06» про те, що sunset-дати не є active commitments (цей ADR supersedes).
- `apps/mobile/README.md` і `apps/mobile-shell/README.md` — freshness header оновлено з посиланням на цей ADR.
- Тригер для наступного ADR (feature parity): `docs/architecture/platforms.md` §0 — Exit dashboard.

## Links

- [`docs/initiatives/0002-mobile-platform-decision.md`](../initiatives/0002-mobile-platform-decision.md) — ініціатива, яку це рішення supersedes у частині sunset-direction
- [ADR-0010](0010-mobile-dual-track-capacitor-expo.md) — dual-track original decision
- [`docs/architecture/platforms.md`](../architecture/platforms.md) — feature-parity матриця (Exit dashboard)
- [`docs/initiatives/0010-revenue-first-launch.md` § Phase 1.2](../initiatives/0010-revenue-first-launch.md)
