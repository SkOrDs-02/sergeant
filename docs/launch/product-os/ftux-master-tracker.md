# FTUX Master Tracker — стан, проблеми, план

> **Last validated:** 2026-05-05 by @Skords-01 / Devin. **Next review:** 2026-08-03.
> **Status:** Active — **single source of truth** для First-Time User Experience.

> **Що це.** Один документ, що об'єднує **стан** (що зашиплено, що відкрито), **проблеми** (з audit-trail), **план** (sprint-i + PR-плани), **копії й макети** (hero copy variants, outcome-card sketch), **метрики** (PostHog dashboards + SLO), **рішення** (Q&A log).
>
> **Замінює (як SSOT для FTUX):**
>
> - [`docs/audits/2026-05-03-ftux-onboarding-roast.md`](../../audits/2026-05-03-ftux-onboarding-roast.md) — оригінальна прожарка (історія, frozen).
> - [`docs/launch/ftux-sprint-plan.md`](./ftux-sprint-plan.md) — sprint-roadmap (історія, frozen).
> - Зовнішня прожарка 2026-05-05 (`reports/sergeant-onboarding-ux-roast-2026-05-05.md`) — новий зріз, **інкорпорований** сюди.
>
> **Cross-refs:**
> [`01-monetization-and-pricing.md` §7](../business/01-monetization-and-pricing.md#7-activation-метрики) — activation baseline ·
> [`04-launch-readiness.md` §4.2](../business/04-launch-readiness.md) — funnel definitions ·
> [`docs/observability/posthog-ftux-dashboards.md`](../../observability/posthog-ftux-dashboards.md) — PostHog dashboards runbook ·
> [`docs/governance/feature-flags.md`](../../governance/feature-flags.md) — flag conventions ·
> [`docs/playbooks/add-onboarding-step.md`](../../playbooks/add-onboarding-step.md) — додавання кроку у `ONBOARDING_STEPS` ·
> [`docs/design/empty-states.md`](../../design/empty-states.md) — 3-tier empty states ·
> `docs/governance/audit-freeze-2026-05-05.md` — freeze правила (4 тижні; з'явиться у PR-01).

> **Audit-freeze contract.** Цей документ — **legal during freeze** (2026-05-05 → 2026-06-02), бо це **consolidation**, не нова прожарка. У freeze-period дозволено:
>
> - оновлювати статуси у §2 (sprint registry)
> - додавати retro-нотатки у §7 (decisions log)
> - інкорпорувати завершені PR-и у §3 (PR plan progress)
>
> **Заборонено** під час freeze: нові аудиторські файли в `docs/audits/`, нові ініціативи в `docs/initiatives/`. Виняток — post-mortems завершених PR-серій (1 page max, в `docs/launch/sprint-retros/`).

---

## Зміст

1. [TL;DR](#1-tldr)
2. [Sprint registry — поточний стан](#2-sprint-registry)
3. [PR-план на 6 тижнів (2026-05-05 → 2026-06-16)](#3-pr-план)
4. [Hero copy variants (PR-04)](#4-hero-copy-variants)
5. [Outcome card sketch (PR-09)](#5-outcome-card-sketch)
6. [Метрики, FTUX SLO (PR-14)](#6-метрики-ftux-slo)
7. [Decisions log — 2026-05-05 mega-roast Q&A](#7-decisions-log)
8. [Audit findings registry — все ще відкрите](#8-audit-findings-registry)
9. [Архівні джерела й історія](#9-архівні-джерела)

---

## 1. TL;DR

> **PR-status (snapshot 2026-05-05 23:25 UTC):** PR-00, PR-01, PR-02 + status-bump #1939 — merged. PR-03 (`pnpm bootstrap`) і PR-04 (`disciplined hero copy`) — open. Детально — §3 PR-план.
>
> **Module-readiness update 2026-05-05:** Fizruk shipped progress charts + exercise catalog + workout notes ([PR #19](https://github.com/Skords-01/Sergeant/pull/19)) і Workouts/Dashboard refactor + journal pagination ([PR #20](https://github.com/Skords-01/Sergeant/pull/20)) — інкорпоровано у §3.5 (FTUX-relevant infra) + §5.3 / §5.4 (Fizruk visual references); §4.1 розширено 6 hero copy variants для наступної ротації + §4.2 selection rubric.

**Стан 2026-05-05:**

- **Sprint 0 (analytics транспорт):** ✅ web — done. ❌ mobile — open (PR-15 заплановано).
- **Sprints 1-3 (UX-зсуви):** **27 з 35 sprint-items закрито** в `main`. 8 open, з них 5 — у Sprint 6 cleanup batch.
- **Activation funnel:** 8-step funnel живе у PostHog для web (`onboarding_started → step_viewed → step_completed → vibe_picked → first_action_picked → ftux_preset_picked → first_real_entry → celebration_shown`). D1/D7 retention dashboards присутні.
- **Real-world activation conversion:** **TBD** — потребує 14+ днів живої когорти (web cohort started ~2026-04-28).
- **6 P0-проблем з 2026-05-03 roast:** 3 закрито (peek disclaimer, wizard-confetti remove, S3 reward-cluster). 3 open у поточних PR-планах (hero copy benefit-driven, goal-aware first action для preset-cluster, demo-mode як first-class).
- **2026-05-05 мега-прожарка** додала 12 нових спостережень (meta-process / brand naming / orchestrator / paywall у FTUX / a11y manual / install prompt / SLO). Усі трансформовані в PR-план Хвиль 1–4 нижче.

**Найголовніша мета 6-тижневого плану:** `Wizard → first_real_entry conversion ≥ 30%` (24h window) як declarative SLO + alert.

**Найбільший свідомий ризик:** parallel робота на `0010-revenue-first-launch` Stripe-billing і FTUX-PR-ами. Audit-freeze (PR-01) знижує процес-розширення на 4 тижні, щоб product velocity повернулася в норму.

---

## 2. Sprint registry

> **Закриті sprint-items** (27): S0.1, S0.2, S0.3 (web), S0.3 (mobile parity), S0.4, S0.5, S1.3, S1.4, S1.5, S2.1, S2.3 (web), S2.3 (mobile parity), S2.4, S3.1, S3.2, S3.3a, S3.3b, S3.3 (mobile parity #1905), S3.4, S3.5, S4.1, S4.3, S4.4, S4.5, S6.1, S6.2, S6.4 (web #1875), S6.4 (mobile parity #1907), S6.6 (#1854), S6.7 (#1852), S6.9 (#1870).
>
> **Open sprint-items** (8): S1.1 (hero copy benefit-driven, blocked on copy-reviewer), S1.2 (CTA на welcome, blocked by S1.1), S2.2a/S2.2b (PresetSheet prefill — blocked by S1.1 copy), S5.1-S5.3 (goal-first wizard, optional), S6.3, S6.5, S6.8, S6.10-S6.13 (Sprint 6 cleanup carryovers).

### 2.1. Глобальна карта спринтів

| Спринт         | Тема                                         | Гіпотеза                                                                | Метрика успіху                                                        | Стан                                                                                                    |
| -------------- | -------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **S0** (1 т.)  | Аналітика наживу                             | Funnel-метрики ~80% точності → можемо приймати рішення                  | 14+5 events пишуться в PostHog · D1/D7 dashboard зеленіє              | ✅ Done                                                                                                 |
| **S1** (2 т.)  | Чесний value-prop + чесні обіцянки           | Hero benefit-copy + усунення confetti-обману + disclaimer на peek       | Wizard→first-entry conversion ↑ 5pp · "rage-quit" (close < 30s) ↓ 30% | 🚧 Partial — S1.3, S1.4, S1.5 done; **S1.1 + S1.2 open** (blocked by copy-reviewer)                     |
| **S2** (2 т.)  | Goal-aware first action + чесний PresetSheet | Primary action слідує за intent; nutrition/fizruk без "пустого sheet'у" | First-entry rate per active module ↑ 10pp · TTV p50 < 90 sec          | 🚧 Partial — S2.1, S2.3 (web+mobile), S2.4 done; **S2.2a/S2.2b open** (blocked by S1.1)                 |
| **S3** (2 т.)  | Reward у правильний момент + value-progress  | Confetti на real entry · CelebrationModal → next-action promise         | Day-1 retention ↑ 5pp · % users з 2+ entries у session 1 ↑ 8pp        | ✅ Done — 6/6                                                                                           |
| **S4** (2 т.)  | Demo-first + day-1-7 retention loop          | "Подивитись приклад" як first-class · push day-2/3 · email drip 0/1/3   | D7 retention ↑ 3pp · share-of-traffic що пройшов demo ≥ 15%           | 🚧 Partial — S4.1, S4.3, S4.4, S4.5 done; **demo-first CTA → PR-05** (Wave 1); **email drip → backlog** |
| **S5** (1 т.)? | Goal-first wizard A/B (опц.)                 | Onboarding починається з outcome, модулі — під ціль                     | A/B виграв ≥5pp retention → раскат                                    | ⏳ Open — **PR-13** у Wave 2                                                                            |
| **S6** (2 т.)  | Cleanup batch — раніше прогавлене            | 13 пунктів, прогавлених у S1-S5                                         | Activation funnel ↑ 2-4pp (cumulative)                                | 🚧 Partial — S6.1, S6.2, S6.4, S6.6, S6.7, S6.9 done; **S6.3, S6.5, S6.8, S6.10-S6.13 open**            |

### 2.2. Sprint 6 cleanup batch — статус 2026-05-05

| ID    | Тема                                           | Стан    | PR / Reference                                                                                                                               |
| ----- | ---------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| S6.1  | feat(onboarding): default-picks experiment     | ✅ Done | (in-tree, see ftux-sprint-plan.md §7a)                                                                                                       |
| S6.2  | feat(onboarding): tour-replay improvements     | ✅ Done | —                                                                                                                                            |
| S6.3  | _(P2-15 на CelebrationModal CTA promise)_      | ⏳ Open | _Sprint 6 carryover_                                                                                                                         |
| S6.4  | feat(onboarding): web parity for mobile        | ✅ Done | [PR #1875](https://github.com/Skords-01/Sergeant/pull/1875) (web) + [#1907](https://github.com/Skords-01/Sergeant/pull/1907) (mobile parity) |
| S6.5  | _(B-2 на «~10 сек» badge removal)_             | ⏳ Open | _Sprint 6 carryover_                                                                                                                         |
| S6.6  | feat(onboarding): hint-orchestrator priority   | ✅ Done | [PR #1854](https://github.com/Skords-01/Sergeant/pull/1854)                                                                                  |
| S6.7  | feat(welcome): static peek refresh             | ✅ Done | [PR #1852](https://github.com/Skords-01/Sergeant/pull/1852)                                                                                  |
| S6.8  | _(P2-19 на DailyNudge primary)_                | ⏳ Open | _Sprint 6 carryover — переходить у PR-12 (orchestrator state)_                                                                               |
| S6.9  | feat(insights): cross-module insight surfacing | ✅ Done | [PR #1870](https://github.com/Skords-01/Sergeant/pull/1870)                                                                                  |
| S6.10 | _(B-10 на insights timing)_                    | ⏳ Open | _Sprint 6 carryover_                                                                                                                         |
| S6.11 | _(B-11 на CelebrationModal «Що далі» tips)_    | ⏳ Open | _Sprint 6 carryover_                                                                                                                         |
| S6.12 | _(P2-14 на streaks-as-mechanism)_              | ⏳ Open | _Sprint 6 carryover — частково покривається PR-09 (outcome-card)_                                                                            |
| S6.13 | _(P2-19 на push permission timing)_            | ⏳ Open | _Sprint 6 carryover_                                                                                                                         |

> Деталі sprint-items та status оригінально жили в [`ftux-sprint-plan.md`](./ftux-sprint-plan.md) §3-7a — там залишається **frozen reference**. Оновлення статусів — тут.

---

## 3. PR-план

> **Контекст:** PR-план з мега-прожарки 2026-05-05 (зовнішнім reviewer-ом / Devin). 22 PR, 4 хвилі, 6 тижнів, ~3850 LOC. Solo trail для перших 3 PR → потім parallel sub-Devin sessions.
>
> **Лімити:** PR-cap 300 LOC / 5-8 PR/тиждень / mixed dev+UX order.

### 3.1. Хвиля 1 — Quick wins (Week 1, 8 PR)

| PR        | Назва                                                        | LOC          | Deps  | Метрика                                                    | Стан                                                                                               |
| --------- | ------------------------------------------------------------ | ------------ | ----- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **PR-00** | docs(launch): consolidate FTUX into master tracker           | ~530         | —     | SSOT існує; redirect-stub-и у старих файлах                | ✅ [Merged #1934](https://github.com/Skords-01/Sergeant/pull/1934)                                 |
| **PR-01** | chore(docs): audit freeze + PR-template warning              | ~320         | —     | 0 нових audit/initiative-доків 4 тижні                     | ✅ [Merged #1936](https://github.com/Skords-01/Sergeant/pull/1936)                                 |
| **PR-02** | docs(readme): hero image + GIF + product overview            | ~95 (struct) | —     | First-impression 60s test                                  | ✅ [Merged #1937](https://github.com/Skords-01/Sergeant/pull/1937) (struct only; assets у PR-02b)  |
| **PR-03** | feat(root): pnpm bootstrap one-shot setup                    | ~510         | —     | First-run from clone до browser ≤ 5 хв                     | 🚧 [Open #1943](https://github.com/Skords-01/Sergeant/pull/1943) (seed-dev-user → PR-03b)          |
| **PR-04** | feat(shared): hero copy A/B variants — disciplined helper    | ~107         | —     | Wizard→first-entry conversion + 5pp за 14 днів             | 🚧 [Open #1944](https://github.com/Skords-01/Sergeant/pull/1944) (v2 split, 4-way 0.4/0.2/0.2/0.2) |
| **PR-05** | feat(welcome): demo mode as first-class CTA                  | ~60          | PR-04 | Demo share-of-traffic ≥ 15%                                | ⏳ Wave 1                                                                                          |
| **PR-06** | feat(brand): canonical Cyrillic naming sweep                 | ~150         | —     | UI label uniformity (Фінік / Фізрук / Рутина / Харчування) | ⏳ Wave 1                                                                                          |
| **PR-07** | feat(pwa): install prompt banner                             | ~140         | —     | `pwa_installed / first_real_entry ≥ 8%`                    | ⏳ Wave 1                                                                                          |
| **PR-08** | chore(docs): cleanup — archive stale audits + delete .replit | -2200        | —     | `find docs/audits -maxdepth 1 -name '*.md'` ≤ 6            | ⏳ Wave 1                                                                                          |

### 3.2. Хвиля 2 — Product UX (Week 2-3, 6 PR)

| PR        | Назва                                               | LOC  | Deps         | Метрика                                             |
| --------- | --------------------------------------------------- | ---- | ------------ | --------------------------------------------------- |
| **PR-09** | feat(hub): cold-start outcome-card behind FF        | ~280 | PR-06        | First-real-entry rate per active module ↑ 10pp      |
| **PR-10** | feat(empty): empty-state copy A/B per module        | ~150 | PR-06, PR-09 | 14-day winner за `first_real_entry conversion`      |
| **PR-11** | feat(onboarding): goal-aware first-action priority  | ~100 | —            | Per-module first-entry rate variance ↓              |
| **PR-12** | refactor(onboarding): OnboardingState shared store  | ~290 | —            | Single-hero rule enforced: ≤1 prompt-card одночасно |
| **PR-13** | feat(experiments): goal-first wizard variant (S5.1) | ~250 | PR-11        | D7 retention за goal-first arm vs current ≥ +5pp    |
| **PR-14** | feat(observability): FTUX SLO + dashboard + alert   | ~100 | —            | Self-referential — alert fires when SLO breaches    |

### 3.3. Хвиля 3 — Platform parity (Week 3-4, 4 PR)

| PR        | Назва                                                    | LOC  | Deps | Метрика                                             |
| --------- | -------------------------------------------------------- | ---- | ---- | --------------------------------------------------- |
| **PR-15** | feat(mobile): posthog-react-native parity                | ~280 | —    | PostHog mobile-cohort > 0 events/day у production   |
| **PR-16** | chore(a11y): screen-reader audit + fix sweep (5 mini-PR) | ~250 | —    | 0 axe-core violations + manual recording            |
| **PR-17** | chore(licenses): auto-generated THIRD_PARTY_LICENSES.md  | ~120 | —    | License doc drift-free у наступному PR              |
| **PR-18** | feat(whats-new): in-product release notes modal          | ~200 | —    | `d7_returning_user_engagement_with_whats_new ≥ 30%` |

### 3.4. Хвиля 4 — Paywall + Polish (Week 5-6, 4 PR)

| PR        | Назва                                                       | LOC      | Deps                        | Метрика                                      |
| --------- | ----------------------------------------------------------- | -------- | --------------------------- | -------------------------------------------- |
| **PR-19** | docs(paywall): UX placement sketch + decision doc           | ~250 doc | —                           | Paywall placement clearly defined            |
| **PR-20** | feat(paywall): in-product placement (post-FTUX moment)      | ~400+    | PR-19, 0010 Stripe scaffold | Paywall conversion ≥ 3% за перші 30 днів     |
| **PR-21** | feat(mobile): FTUX parity sweep                             | ~350     | PR-09, PR-11, PR-15         | Mobile FTUX coverage ≥ 90%                   |
| **PR-22** | docs(agents): TOC + read-time annotations + quick-reference | ~180     | —                           | New-agent first-PR success rate (subjective) |

### 3.5. Module-level інфраструктура — вже в `main` (FTUX-relevant context)

> Не FTUX-PR-и, але вже-merged інфраструктура, яку FTUX-флоу (cold-start outcome-card §5, mobile FTUX parity §3.3) лінкуватиме напряму. Перелік оновлюється по мірі того, як модулі шиплять value-surface, що ми хочемо teaser-ити у FTUX.

| Модуль | Що з'явилось                                                                                                                                                                                                                                                                                                | PR                                                                                                 | FTUX-споживач                                                                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fizruk | `MiniLineChart` (SVG line chart для weight / body-fat trends) + `WellbeingChart` (grouped bar chart для energy/mood per workout); pushup stats widget; 65+ exercises у catalog (chest/back/shoulders/arms/core/legs/glutes/cardio/full_body); workout-notes textarea на active workout + display у history. | [PR #19](https://github.com/Skords-01/Sergeant/pull/19) (catalog + charts + notes)                 | **PR-09 (outcome-card)** §5.3 Fizruk visual / §5.4 post-first-entry transformation; **PR-21 (mobile FTUX parity)** §3.3 (mobile-side chart parity).                                      |
| Fizruk | Zero-input forms + grouped picker (categories) на Workouts; quick-start CTA вилучено; weekly chart перенесений у Progress; journal «show more» pagination.                                                                                                                                                  | [PR #20](https://github.com/Skords-01/Sergeant/pull/20) (Workouts/Dashboard refactor + pagination) | **PR-09 (outcome-card)** §5.3 Fizruk CTA «Запланувати тренування →» тепер веде на чистіший grouped-picker UX; **PR-12 (orchestrator)** — менше дублюючих CTA на Dashboard після cleanup. |

> **Принцип:** перш ніж писати FTUX-сюрфейс для модуля, перевір тут — можливо, потрібний компонент вже існує і його достатньо обгорнути у FTUX-обгортку (FF, copy-A/B, empty-state).

### 3.6. Свідомі НЕ-роблення

- ❌ AGENTS.md split на 3 файли (per Q7 — overkill для solo+agents).
- ❌ Mobile-shell deprecation deadline (per Q8 — skip).
- ❌ I18n runtime з EN-baseline (per Q4 — UA-only до launch).
- ❌ Radical orchestrator rewrite (per Q13 — incremental через PR-12).
- ❌ Нові audit/initiative documents у freeze-period.
- ❌ S5.2/S5.3 decision logic — після результатів S5.1 (PR-13).

---

## 4. Hero copy variants

> Theme: «Дисциплінований помічник». Tone: спокійна влада, без пафосу, без надмірних обіцянок.
> PR: **PR-04** ([#1944](https://github.com/Skords-01/Sergeant/pull/1944)). PostHog FF: `onboarding_hero_copy_v2` (id-bump v1→v2 в PR-04 через додавання disciplined arm). 4 arms (`outcome` / `safe` / `bold` / `disciplined`), weights `[0.4, 0.2, 0.2, 0.2]` (outcome — carry-over mainline 40%, три альтернативи по 20%), 14-day measurement, winner promote через flip weights без чергового id-bump-у.

### Variant A — Calm authority

- **Hero:** «Тримай життя в строю — без пафосу.»
- **Sub:** «Гроші, тіло, звички, харчування. Тихо, але постійно.»
- **CTA primary:** «Почати з малого»
- **CTA secondary:** «Подивитись приклад»

### Variant B — Functional outcome

- **Hero:** «Менше хаосу. Більше зробленого.»
- **Sub:** «Один хаб для фінансів, тренувань, звичок і харчування. Працює офлайн, без зайвої реклами.»
- **CTA primary:** «Зайти в стрій»
- **CTA secondary:** «Подивитись приклад»

### Variant C — Promise + first action

- **Hero:** «Один день. Один запис. Це вже більше, ніж учора.»
- **Sub:** «Sergeant супроводжує тебе у фінансах, тренуваннях, звичках і харчуванні. Без надмірних повідомлень.»
- **CTA primary:** «Почати»
- **CTA secondary:** «Подивитись приклад»

### 4.1. Drafts для наступної ротації (post-PR-04 winner)

> Не в активному 4-way A/B зараз. Кандидати на наступну ротацію після того, як PR-04 promote-не winner. Tone match — той самий disciplined-helper («спокійна влада, без пафосу, без надмірних обіцянок»), різні axis-i: brand, empathy, friction acknowledgment, privacy, identity. Усі — UA-only (per Q4).

#### Variant D — Brand-aligned (military-light, без overdoing)

- **Hero:** «Дисципліна — не покарання, а ритм.»
- **Sub:** «Sergeant веде облік: гроші, тіло, звички, їжа. Без сварок за пропуски — лише чесна картина тижня.»
- **CTA primary:** «Стати в стрій»
- **CTA secondary:** «Подивитись приклад»

#### Variant E — Empathetic / anti-guilt coaching

- **Hero:** «Ти вже досить себе картаєш. Тепер — рахуємо.»
- **Sub:** «Один запис на день — і вже наступного тижня побачиш, на що дійсно йшли твої гроші, час і сили.»
- **CTA primary:** «Один запис сьогодні»
- **CTA secondary:** «Демо без акаунта»

#### Variant F — Pragmatic friction acknowledgment

- **Hero:** «5 додатків — забагато. Sergeant — один.»
- **Sub:** «Гроші, фітнес, звички, харчування — в одному хабі. Local-first, без cloud-залежності за замовчуванням.»
- **CTA primary:** «Почати з одного модуля»
- **CTA secondary:** «Подивитись приклад»

#### Variant G — Self-sovereignty / privacy-first

- **Hero:** «Твої дані — у тебе. Звіт — про тебе.»
- **Sub:** «Sergeant працює офлайн і нічого не відправляє без дозволу. Запиши день — побачиш свій pattern сам, без третіх сторін.»
- **CTA primary:** «Записати свій день»
- **CTA secondary:** «Подивитись приклад»

#### Variant H — Identity / «завтрашнє Я»

- **Hero:** «Твоє «завтрашнє Я» питає, де гроші, де тренування, де звички.»
- **Sub:** «Один хаб без зайвих сповіщень — щоб у п'ятницю не доводилось вгадувати, що сталося за тиждень.»
- **CTA primary:** «Дати відповідь»
- **CTA secondary:** «Подивитись приклад»

#### Variant I — Outcome-as-evidence (для пост-FTUX cohort, дисциплінована альтернатива до C)

- **Hero:** «Тиждень — це 7 шансів побачити себе.»
- **Sub:** «Sergeant збирає твої щоденні записи у тижневий зріз: фінанси, тренування, звички, їжа. Без оцінок — лише дані.»
- **CTA primary:** «Зібрати свій тиждень»
- **CTA secondary:** «Подивитись приклад»

> Усі — UA-only (per Q4 answer). Перш ніж рекрутувати у наступний 4-way A/B — мають пройти copy-reviewer (S1.1 unblock) і не повторювати вже-програшні axis-и попередніх раундів.

### 4.2. Selection rubric (для copy-reviewer)

При виборі наступного 4-way A/B-set із §4.1 кандидатів — мінімум 1 кандидат на кожну вісь:

- **Tone:** spectrum від `safe` (тиха влада) до `bold` (action-driven). Якщо winner PR-04 був `disciplined` — наступний раунд має 1 `safe` + 2 `disciplined-adjacent` + 1 `bold`.
- **Promise type:** `feature-led` ↔ `outcome-led` ↔ `identity-led`. Не дублюй два variant-и однієї категорії в одному раунді.
- **CTA pair:** `primary CTA` має різнитися дієсловом від попереднього winner-а (anti-fatigue правило — користувач, що повертається, не має бачити той самий CTA двічі за 14 днів).
- **A11y:** жоден варіант не повинен покладатись на metaphor, що ламається при VoiceOver/TalkBack озвученні (S6 a11y-sweep guidance, PR-16).

---

## 5. Outcome card sketch

> PR: **PR-09**. Behind FF `dashboard_outcome_card_v1`. Замінює `<ModuleChecklist />` + `<OnboardingProgress />` на cold-start.

### 5.1. Поточний cold-start dashboard

```
┌─────────────────────────────────────┐
│ [Progress bar: 0/4 модулів готові]  │  ← obsoleteness, не value
├─────────────────────────────────────┤
│ [ModuleChecklist: TODO лист]        │  ← ще один TODO
├─────────────────────────────────────┤
│ [Bento 2×2 — 4 порожні картки]      │  ← peek-без-data
└─────────────────────────────────────┘
```

### 5.2. Запропонований cold-start

```
┌─────────────────────────────────────┐
│  ★ HeroPromiseCard (per primary)    │
│                                     │
│  Заголовок: «Твій тиждень тут»      │
│                                     │
│  ┌──────────────────────────────┐   │
│  │ [faded weekly calendar       │   │
│  │  з 1 highlighted cell]       │   │
│  └──────────────────────────────┘   │
│                                     │
│  Тіло: «Обери звичку → виконай     │
│         завтра → стрік запалився»   │
│                                     │
│  [Створити звичку зараз →]          │
│                                     │
├─────────────────────────────────────┤
│ [Bento 2×2 — лише обрані модулі     │
│  (примарний модуль emphasized)]     │
└─────────────────────────────────────┘
```

### 5.3. Per-module promise content

| Module primary | Заголовок                       | Body                                                         | Visual                                                                                                                                                                             | CTA                                                                                                                       |
| -------------- | ------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Routine        | «Твій тиждень тут»              | «Обери звичку → виконай завтра → стрік запалився.»           | Faded weekly calendar з 1 highlighted cell                                                                                                                                         | «Створити звичку зараз →»                                                                                                 |
| Finyk          | «Твоя зарплата на радарі»       | «Додай суму витрати → побачиш скільки лишилося до зарплати.» | Faded line-chart балансу                                                                                                                                                           | «Записати першу витрату →»                                                                                                |
| Fizruk         | «Сили вистачить — якщо рахуємо» | «Признач 1 тренування → у п'ятницю побачимо, що зробив.»     | Faded weekly schedule з 1 cell (зараз — `WeeklyChart` у Progress, перенесений у [PR #20](https://github.com/Skords-01/Sergeant/pull/20); cold-start FTUX-обгортка над ним — PR-09) | «Запланувати тренування →» (веде на grouped-picker workouts UX з [PR #20](https://github.com/Skords-01/Sergeant/pull/20)) |
| Nutrition      | «Що з'їв сьогодні?»             | «Скани штрих-код → і за тиждень побачиш свій pattern.»       | Faded daily timeline                                                                                                                                                               | «Сьогоднішній прийом їжі →»                                                                                               |

### 5.4. Post-first-entry transformation

Після `first_real_entry` `<HeroPromiseCard />` перетворюється на `<HeroOutcomeCard />` з реальними значеннями:

- Routine: «3 з 7 днів — ти на півдорозі. Стрік: 3 дні.»
- Finyk: «Цього тижня витратив: 1240 ₴. До зарплати: 8 760 ₴.»
- Fizruk: «На цьому тижні: 1 з 3 запланованих тренувань.» _(real-data рендер тепер може лінкувати `MiniLineChart` для weight/fat trend і `WellbeingChart` для energy/mood per workout — обидва в `apps/web/src/modules/fizruk/components/`, додані [PR #19](https://github.com/Skords-01/Sergeant/pull/19); PR-09 wrap-iть їх у HeroOutcomeCard)._
- Nutrition: «Сьогодні: 1 200 ккал. Тиждень: середнє 1 580.»

---

## 6. Метрики, FTUX SLO

> PR: **PR-14**. Декларативний `docs/observability/ftux-slo.yml` + PostHog dashboard + Sentry/PostHog alert.

### 6.1. Канонічні events (за `posthog-ftux-dashboards.md`)

```
onboarding_started        → wizard mounted
onboarding_step_viewed    → user saw step N
onboarding_step_completed → user completed step N
vibe_picked              → vibe + goals chosen
first_action_picked      → primary first-action selected
ftux_preset_picked       → preset chosen (or skipped)
first_real_entry         → first user-data write
ftux_time_to_value       → ms from start to first_real_entry
celebration_shown        → CelebrationModal rendered
```

### 6.2. Поточні дашборди (PostHog)

5 saved insights (per `posthog-ftux-dashboards.md`):

1. **Activation funnel** — 8-step funnel з drop-off per step.
2. **TTV histogram** — `ftux_time_to_value` distribution.
3. **Vibe → first-entry per module** — heatmap.
4. **D1/D7 retention by signup-cohort.**
5. **Celebration drop-off** — `celebration_shown / first_real_entry`.

> **Web cohort:** активний з ~2026-04-28. **Mobile cohort:** TBD до PR-15.

### 6.3. Запропонована FTUX SLO (PR-14)

```yaml
# docs/observability/ftux-slo.yml (proposed)
slos:
  - name: ftux_activation_conversion
    target: ">= 30%"
    metric: "first_real_entry / onboarding_started"
    window: "24h"
    alert_threshold: "< 25% for 3 days"

  - name: ftux_time_to_value_p50
    target: "<= 90 sec"
    metric: "ftux_time_to_value (p50)"
    window: "7d"
    alert_threshold: "> 120 sec for 3 days"

  - name: ftux_d1_retention
    target: ">= 25%"
    metric: "d1_returning_user / first_real_entry"
    window: "7d cohort"
    alert_threshold: "< 20% for 1 cohort"
```

Алерти: PostHog Alerts + Sentry (через webhook).

---

## 7. Decisions log

> Q&A з мега-прожарки 2026-05-05. 28 запитань. Тут — лише фінальні рішення; повна транскрипція — у `reports/sergeant-onboarding-ux-roast-2026-05-05.md` (поза репо).

### Стратегічні

- **Audit-freeze:** ON до 2026-06-02. Дозволено: edit existing files, post-mortems завершених PR-ів. Заборонено: нові audit/initiative-документи.
- **Q3 2026 launch:** target, не deadline. Можна зсунути.
- **Solo + agents:** founder = primary, AI = parallel workers. AGENTS.md лишається SSOT (без split — overkill для solo+agents).
- **UA-only:** до launch. I18n runtime — у backlog post-launch.

### Onboarding-Dev

- **README:** додаємо hero-image + GIF + production URL (PR-02).
- **Bootstrap:** новий `pnpm bootstrap` script з verify-versions + docker + migrate ([PR-03 #1943](https://github.com/Skords-01/Sergeant/pull/1943)). Seed dev-user (`SERGEANT_DEV_USER=1`) і auto-open-browser виносяться у PR-03b — потребують server-side зміни (Better Auth password hashing, idempotent INSERT user).
- **AGENTS.md:** не розколюємо, лише додаємо TOC + `quick-reference.md` (PR-22).
- **Mobile-shell deadline:** parked.

### Onboarding-Product

- **Demo mode:** secondary CTA на `/welcome` (PR-05).
- **Hero copy:** disciplined-helper variant («Менше хаосу. Більше зробленого.») в існуючий 4-way A/B ([PR-04 #1944](https://github.com/Skords-01/Sergeant/pull/1944), див. §4). Experiment id bumped `v1`→`v2`, weights re-balanced на `[0.4, 0.2, 0.2, 0.2]`.
- **Wizard confetti:** **вже видалено** (S1.3 / PR #1609). CelebrationModal лишається тільки на `first_real_entry` (S3.2 / PR #1630). Manual QA треба прогнати.
- **Goal-first wizard:** робимо (PR-13, S5.1).
- **Orchestrator:** incremental — `useOnboardingState()` shared store + `usePrimaryAffordance()` priority queue, **не** видаляємо 14 компонентів (PR-12).
- **Brand naming:** Cyrillic без emoji (Фінік / Фізрук / Рутина / Харчування). Latin codenames лишаються в коді (paths, vars, type-id-и). PR-06.

### UX-поза-FTUX

- **PWA install prompt:** додаємо (PR-07).
- **Cold-start outcome-card:** додаємо behind FF (PR-09). Incremental: 4 bento лишаються, але TODO + Progress прибираються.
- **Empty-state A/B:** 3 варіанти, PostHog FF (PR-10).
- **A11y manual:** Devin — web (Linux + Orca). Founder — mobile (1× recording). PR-16.
- **Paywall:** sketch session founder ↔ Devin → `paywall-ux-placement.md` (PR-19) → impl (PR-20).

### Документація

- **`THIRD_PARTY_LICENSES.md`:** автогенерація через `license-checker` (PR-17).
- **Архів стейл audit-tracker-ів:** `2026-04-28-ux-ui-audit.md`, `2026-04-28-ux-improvement-plan.md`, `2026-04-28-implementation-roadmap.md` → `docs/audits/archive/` (PR-08).
- **`.replit`:** видалити (PR-08).
- **What's new:** `docs/whats-new/` + `<WhatsNewModal />` (PR-18).

### Метрики

- **FTUX SLO:** declarative `ftux-slo.yml` + PostHog dashboard + Sentry alert (PR-14).
- **Mobile PostHog parity:** до launch (PR-15).

### PR-стратегія

- **Темп:** 5-8 PR/week.
- **Order:** mixed dev + product UX (Week 1: PR-00..PR-08).
- **Trail:** solo до перших 3 PR merged → parallel sub-Devin далі.

---

## 8. Audit findings registry

> Усі знахідки з 2026-05-03 roast + 2026-05-05 mega-roast зведено сюди. Status reflects code state у `main` на 2026-05-05.

### 8.1. P0 з 2026-05-03 roast

| #   | Проблема                                          | Файл                           | Стан         | Кроки                                                                                       |
| --- | ------------------------------------------------- | ------------------------------ | ------------ | ------------------------------------------------------------------------------------------- |
| 1   | Hero copy продає features, не результат           | `OnboardingWizard.tsx:237-264` | 🚧 In flight | [PR-04 #1944](https://github.com/Skords-01/Sergeant/pull/1944) (disciplined arm у v2 split) |
| 2   | Confetti до першої цінності (wizard finish)       | `OnboardingWizard.tsx:388-401` | ✅ Closed    | S1.3 / [PR #1609](https://github.com/Skords-01/Sergeant/pull/1609)                          |
| 3   | «Відкрити Sergeant» закидає на порожній dashboard | post-wizard navigation         | ⏳ Open      | PR-09 (outcome-card replaces empty TODO)                                                    |
| 4   | Жорсткий пріоритет `routine` ігнорує goals        | `FirstActionSheet.tsx:59-75`   | ✅ Closed    | S2.1 / [PR #1740](https://github.com/Skords-01/Sergeant/pull/1740)                          |
| 5   | Peek backdrop disclaimer                          | `WelcomeScreen.tsx:78-81`      | ✅ Closed    | S1.4 / [PR #1610](https://github.com/Skords-01/Sergeant/pull/1610)                          |
| 6   | PresetSheet bait-and-switch                       | `PresetSheet.tsx:80-145`       | 🚧 Partial   | S2.2a/S2.2b — blocked by S1.1 copy-reviewer                                                 |

### 8.2. P1 з 2026-05-03 roast

| #   | Проблема                                         | Стан       | Кроки                                                                                                            |
| --- | ------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| 7   | Cry-wolf confetti (CelebrationModal перед value) | ✅ Closed  | S3.2 / [PR #1630](https://github.com/Skords-01/Sergeant/pull/1630). Manual QA треба прогнати у PR-09 acceptance. |
| 8   | «~10 сек» обіцянка-капкан (B-2)                  | ⏳ Open    | S6.5 (Sprint 6 carryover)                                                                                        |
| 9   | OnboardingProgress = obsoleteness, не value      | ⏳ Open    | PR-09 (видаляється на cold-start)                                                                                |
| 10  | MotivationalFooter на пустому дашборді           | ✅ Closed  | S3.4 / [PR #1619](https://github.com/Skords-01/Sergeant/pull/1619)                                               |
| 11  | Cross-module USP показано **останнім**           | 🚧 Partial | S6.9 / [PR #1870](https://github.com/Skords-01/Sergeant/pull/1870); insight-timing (B-10/S6.10) ⏳ open          |

### 8.3. P2 з 2026-05-03 roast

| #   | Проблема                                       | Стан       | Кроки                                                                        |
| --- | ---------------------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| 12  | D2-D7 re-engagement gap                        | 🚧 Partial | Push permission (S4.x) done. Email drip — backlog.                           |
| 13  | Soft-Auth fear-based copy                      | ✅ Closed  | S3.5 / [PR #1623](https://github.com/Skords-01/Sergeant/pull/1623)           |
| 14  | DailyNudge — три кнопки одного рангу           | 🚧 Partial | S6.8 (Sprint 6 carryover) — переходить у PR-12 (orchestrator priority queue) |
| 15  | Permission denied → reminders сильно ламаються | ⏳ Open    | Sprint 6 carryover                                                           |

### 8.4. 2026-05-05 mega-roast — нові знахідки

| #    | Знахідка                                                                 | Стан                    | Кроки                                                                                 |
| ---- | ------------------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------- |
| M-1  | **Audit hyperloop** (12 ініціатив, 12 audit-доків, 334 markdown)         | 🚧 Mitigation in flight | PR-01 (audit-freeze) + PR-08 (archive 3 stale tracker-и) + цей master tracker (PR-00) |
| M-2  | Brand-naming inconsistency (Latin / Cyrillic / English / emoji-prefixed) | ⏳ Open                 | PR-06                                                                                 |
| M-3  | 14 onboarding-adjacent компонентів — guidance bloat                      | ⏳ Open                 | PR-12 (incremental orchestrator)                                                      |
| M-4  | Demo mode прихований за `?demo=1`                                        | ⏳ Open                 | PR-05                                                                                 |
| M-5  | UA-only product UI без runtime i18n                                      | 🗄️ Deferred             | UA-only до launch (per Q4)                                                            |
| M-6  | Mobile FTUX parity gap                                                   | ⏳ Open                 | PR-15 (PostHog) + PR-21 (FTUX components)                                             |
| M-7  | Paywall placement у FTUX — повна відсутність UX-плану                    | ⏳ Open                 | PR-19 (sketch) → PR-20 (impl)                                                         |
| M-8  | AGENTS.md 81 КБ — read-tax 6×                                            | 🚧 Mitigation           | PR-22 (TOC + quick-reference, без split)                                              |
| M-9  | PWA install prompt відсутній                                             | ⏳ Open                 | PR-07                                                                                 |
| M-10 | FTUX SLO відсутні                                                        | ⏳ Open                 | PR-14                                                                                 |
| M-11 | A11y manual audit не проведений                                          | ⏳ Open                 | PR-16                                                                                 |
| M-12 | What's new modal відсутній                                               | ⏳ Open                 | PR-18                                                                                 |

---

## 9. Архівні джерела

> **Frozen references** (NE редагуємо вище ↑ — вищі відмітки оновлюються тут).

- [`docs/audits/2026-05-03-ftux-onboarding-roast.md`](../../audits/2026-05-03-ftux-onboarding-roast.md) — оригінальна прожарка з повним body. Цитати в §8.1-8.3 — з неї. Має redirect-banner на цей master tracker.
- [`docs/launch/ftux-sprint-plan.md`](./ftux-sprint-plan.md) — оригінальний sprint-plan з повним PR-розписом (Sprint 0-5 + 6 cleanup batch). Деталі implementation per sprint-item — там. Має redirect-banner на цей master tracker.
- `reports/sergeant-onboarding-ux-roast-2026-05-05.md` (поза репо) — мега-прожарка 2026-05-05. Інкорпорована в §8.4.
- `reports/sergeant-pr-plan-2026-05-05.md` (поза репо) — PR-план. Інкорпорований в §3.

> **Чому frozen, а не deleted.** Багато incoming-link-ів (~20+ файлів) посилаються на старі шляхи. Видалення → broken-links shower → `pnpm docs:check-links` fail. Frozen redirect-banner — менш-impact-ний path forward.

---

## Editing rules (для майбутніх агентів)

1. **Редагуй тут** — оновлення статусів, нові findings (post-freeze), нові decisions.
2. **Не редагуй frozen sources** ([`2026-05-03-ftux-onboarding-roast.md`](../../audits/2026-05-03-ftux-onboarding-roast.md), [`ftux-sprint-plan.md`](./ftux-sprint-plan.md)) — вони лишаються як history. Виняток — bump `Last validated:` (через `bump-last-validated.mjs`) і додання redirect-banner.
3. **Status legend:**
   - ✅ Closed — shipped to `main`
   - 🚧 Partial / Mitigation — частково або в роботі
   - ⏳ Open — заплановано, не стартовано
   - 🗄️ Deferred — свідомо відкладено
4. **PR-link конвенція:** `[PR #NNNN](https://github.com/Skords-01/Sergeant/pull/NNNN)`.
5. **Audit-freeze гарда:** під час freeze (до 2026-06-02) НЕ створюй нові файли в `docs/audits/`. Якщо знаходиш нову проблему — додавай в §8.4 з ID `M-XX`.

---

_Кінець master tracker. Питання, оновлення, нові findings → PR проти цього файлу + лінк у §3 на відповідний PR._
