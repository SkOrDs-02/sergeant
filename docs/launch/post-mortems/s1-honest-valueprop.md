# S1 — Чесний value-prop · post-mortem (live)

> **Last validated:** 2026-05-04 by @Skords-01 (S1.3 + S1.4 виконані).
> **Status:** Active — спринт у роботі. Документ оновлюється після кожного S1.x merge-у.

> Зворотний зв'язок до [`docs/launch/ftux-sprint-plan.md` §3](../ftux-sprint-plan.md#3-sprint-1--честний-value-prop-2-тижні).
>
> Мета спринту: wizard → перший вхід в дашборд = чесний emotional contract. Прибрати fake-celebrations, fake-cifry, feature-orientation, "click here"-CTA.

---

## 1. Шкала виконання

| PR-id    | Назва                                                | Статус  | Дата       | Нотатка                                                                                                                                |
| -------- | ---------------------------------------------------- | ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **S1.3** | refactor(onboarding): remove wizard-confetti         | ✅ DONE | 2026-05-04 | [PR #1609](https://github.com/Skords-01/Sergeant/pull/1609). Mobile parity була раніше — mobile-wizard без CelebrationModal на finish. |
| **S1.4** | feat(welcome): peek backdrop disclaimer              | ✅ DONE | 2026-05-04 | [PR #1610](https://github.com/Skords-01/Sergeant/pull/1610). Web-only — mobile-wizard без peek-backdrop.                               |
| **S1.1** | feat(onboarding): rewrite hero copy (benefit-driven) | ❌ TODO | —          | Заблокований copy-reviewer-ом (founder-friend / маркетолог / ЦА).                                                                      |
| **S1.2** | feat(onboarding): outcome CTA on welcome             | ❌ TODO | —          | Залежить від S1.1.                                                                                                                     |
| **S1.5** | refactor(onboarding): rename "Налаштувати модулі"    | ❌ TODO | —          | Без deps і без copy-reviewer-а (фіксована copy у specs) — наступний кандидат у роботу.                                                 |

**Виконано:** 2/5. Активне працювання — S1.3 + S1.4 (cleanup-ланка), решта чекає copy-reviewer-а або має одного-два item-и роботи.

---

## 2. S1.3 — drop wizard-finish CelebrationModal

### Що змінилось

- `apps/web/src/core/onboarding/OnboardingWizard.tsx`:
  - Прибрано `useCelebration()` + виклик `confetti("Готово!", "Твій Sergeant налаштовано. Час діяти!", "high")` з `finish()`.
  - Прибрано `setTimeout(..., 3500)` навколо `onDone(...)` — більше немає чого "тримати на екрані".
  - Прибрано рендер `{CelebrationComponent}` з обох variants (`modal` / `fullPage`).
  - Інкрементальний фікс `useRef<number | null>(null)` + `Date.now()` всередині effect-у замість render-body — `react-hooks/purity` блокував lint-staged на staged-файлі (rule додано після останніх eslint-апдейтів). `durationMs` для першого render-у тепер `0` замість `Date.now() - mountTime` (декілька ms у попередній версії).
  - Аналітика та storage side-effects не зачеплені: `ONBOARDING_VIBE_PICKED`, `ONBOARDING_STEP_COMPLETED { step:"welcome", durationMs }`, `ONBOARDING_COMPLETED { intent }`, `markFirstActionStartedAt/Pending/markOnboardingDone/clearPersistedPicks`.

### Чому

Wizard-finish CelebrationModal був fake-reward: юзер тапає "Відкрити Sergeant" → бачить fireworks-modal → тільки після 3.5s потрапляє на дашборд. Це порушує честний value-prop: юзер ще нічого не зробив, а ми вже святкуємо. CelebrationModal лишається тільки на реальних entry-points (`useFirstEntryCelebration`, streak milestones).

### Mobile parity

Уже виконана раніше (mobile-wizard з минулого спринту без CelebrationModal, на finish тільки `hapticSuccess()`). Нічого не міняли.

### Метрика

Поки нема нової метрики. Очікуємо `wizard-finish → first-entry` time-to-action ↓ (раніше форсували +3.5s до hub-у). Перевіримо у наступному PostHog cohort report (D1+D7 dashboard зеленіє після S0.4 / S0.5 wiring-у).

---

## 3. S1.4 — peek-backdrop disclaimer

### Що змінилось

- `apps/web/src/core/app/WelcomeScreen.tsx` → `PeekBackdrop`:
  - Доданий muted single-line caption "Це приклад. Твій дашборд буде твоїм." pinned до safe-area top (`pt-[max(0.5rem,calc(env(safe-area-inset-top)+0.25rem))]`) — над blurred bento, не блокується filter-blur-ом.
  - Розмір тексту — `text-style-caption` (12px) per design-tokens floor (`text-2xs` зарезервовано для chart axes / decorative). Колір — `text-muted/80` для muted-state.
  - Pointer-events: вже відключено parent-ом (`pointer-events-none`), не блокує splash CTA.

### Чому

Blurred bento містить fake metrics (`-320 ₴`, `5 трен.`, `2/3 звичок`, fake nutrition card з калоріями) — на cold-load splash візуально обіцяє "у тебе вже є дашборд із цифрами". Disclaimer фіксує очікування: peek — це приклад, не account state.

### Mobile parity

Mobile-wizard сьогодні без peek-backdrop (single-splash без бенто позаду), тому disclaimer не потрібен. Якщо колись додамо mobile peek — закриємо хвостик у наступному спринті як cross-cutting.

### Метрика

Опосередкована: "rage-quit (close <30s)" rate ↓ (юзер бачить чесний contract і не закриває з roзчарування "ага, це тільки splash"). Перевіримо у next cohort report.

---

## 4. Що не зроблено в цьому циклі

- **S1.1** — copy-rewrite. Чекає copy-reviewer-а. Без review-у ризикуємо розкатати інженер-орієнтовану copy.
- **S1.2** — depends on S1.1.
- **S1.5** — простий лейбл-реней "Налаштувати модулі" → "Що це за модулі?". Без блокерів — наступний у черзі.
- **Mobile parity** для cross-cutting peek-backdrop — відкладено до того, коли в mobile додасться peek (якщо взагалі додасться).

---

## 5. Open follow-ups

- [x] Відкрити PR-и для S1.3 ([#1609](https://github.com/Skords-01/Sergeant/pull/1609)), S1.4 ([#1610](https://github.com/Skords-01/Sergeant/pull/1610)) і docs writeback ([#1611](https://github.com/Skords-01/Sergeant/pull/1611)).
- [ ] Підняти copy-reviewer-а для S1.1 (founder-friend / маркетолог / ЦА).
- [ ] Узяти S1.5 у роботу — без блокерів.
- [ ] Дочекатись post-S0 cohort report-у (PostHog) і додати before/after метрики для S1.3 і S1.4 (поки що — якісний impact, кількісний — після).

---

## 6. Reference

- Sprint plan: [`docs/launch/ftux-sprint-plan.md` §3](../ftux-sprint-plan.md#3-sprint-1--честний-value-prop-2-тижні)
- Audit джерело: [`docs/audits/2026-05-03-ftux-onboarding-roast.md`](../../audits/2026-05-03-ftux-onboarding-roast.md) (P0 рекомендації для S1)
- Funnel definitions: [`docs/launch/04-launch-readiness.md` §4.2](../04-launch-readiness.md)
- Activation baseline: [`docs/launch/01-monetization-and-pricing.md` §7](../01-monetization-and-pricing.md#7-activation-метрики)
