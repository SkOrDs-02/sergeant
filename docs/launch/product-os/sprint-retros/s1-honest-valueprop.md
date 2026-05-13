# S1 — Чесний value-prop · post-mortem (live)

> **Last validated:** 2026-05-04 by @Skords-01 (S1.3 + S1.4 + S1.5 виконані; cherry-pick S2.4 + S3.4 також).
> **Status:** Active — спринт у роботі. Документ оновлюється після кожного S×.× merge-у.

> Зворотний зв'язок до [`docs/launch/ftux-sprint-plan.md` §3](../ftux-sprint-plan.md#3-sprint-1--честний-value-prop-2-тижні).
>
> Мета спринту: wizard → перший вхід в дашборд = чесний emotional contract. Прибрати fake-celebrations, fake-cifry, feature-orientation, "click here"-CTA.

---

## 1. Шкала виконання

| PR-id    | Назва                                                | Статус  | Дата       | Нотатка                                                                                                                                      |
| -------- | ---------------------------------------------------- | ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **S1.3** | refactor(onboarding): remove wizard-confetti         | ✅ DONE | 2026-05-04 | [PR #1609](https://github.com/Skords-01/Sergeant/pull/1609). Mobile parity була раніше — mobile-wizard без CelebrationModal на finish.       |
| **S1.4** | feat(welcome): peek backdrop disclaimer              | ✅ DONE | 2026-05-04 | [PR #1610](https://github.com/Skords-01/Sergeant/pull/1610). Web-only — mobile-wizard без peek-backdrop.                                     |
| **S1.1** | feat(onboarding): rewrite hero copy (benefit-driven) | ❌ TODO | —          | Заблокований copy-reviewer-ом (founder-friend / маркетолог / ЦА).                                                                            |
| **S1.2** | feat(onboarding): outcome CTA on welcome             | ❌ TODO | —          | Залежить від S1.1.                                                                                                                           |
| **S1.5** | refactor(onboarding): rename "Налаштувати модулі"    | ✅ DONE | 2026-05-04 | [PR #1617](https://github.com/Skords-01/Sergeant/pull/1617). Web-only — mobile-wizard показує description інлайн, без expand-toggle.         |
| **S2.4** | refactor(finyk): preset sub-tile copy hints          | ✅ DONE | 2026-05-04 | [PR #1618](https://github.com/Skords-01/Sergeant/pull/1618). Cherry-pick зі Sprint 2 — без deps. «їжа · введи суму» → «як правило ~60–95 ₴». |
| **S3.4** | refactor(hub): MotivationalFooter conditional        | ✅ DONE | 2026-05-04 | [PR #1619](https://github.com/Skords-01/Sergeant/pull/1619). Cherry-pick зі Sprint 3 — римується з S1 (drop fake-reassurance).               |

**Виконано у S1:** 3/5. Плюс cherry-pick S2.4 і S3.4 (всього 5 PR у 2026-05-04 cluster-і). S1.1 + S1.2 чекають copy-reviewer-а.

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

## 4. S1.5 — rename "Налаштувати модулі" → "Що це за модулі?"

### Що змінилось

- `apps/web/src/core/onboarding/OnboardingWizard.tsx:311` — single-string реней тоггла під module-checkbox-ами. Через рендер ходив `expanded ? "Згорнути" : "Налаштувати модулі"` → тепер `expanded ? "Згорнути" : "Що це за модулі?"`.

### Чому

Action-orientation («Налаштувати») обіцяє юзеру роботу — хоча по факту картки вже all-on і клік на тоггл просто розгортає description + teaser. Info-orientation («Що це за модулі?») точніше відбиває, що відбувається після кліку і не видумує «role» для юзера.

### Mobile parity

Не потрібна. `apps/mobile/src/core/OnboardingWizard.tsx` показує `ONBOARDING_MODULE_DESCRIPTIONS` завжди inline, без expand toggle — єквівалентної лейбл-копії не існує.

### Метрика

Oпосередкована: «вже все робоче out-of-the-box, ти не запряжений налаштовувати». Очікуємо вищий wizard→first-entry conversion (менше friction-у від фальшивої обіцянки "в тебе є робота").

---

## 5. Cherry-pick — S2.4 + S3.4 (один цикл з S1.5)

Чому одним батчем: обидва PR-и — сравнивають філософію S1 (чесні обіцянки) в сусідніх спринтах, без deps і без copy-reviewer-а. Деляти їх до "своїх" спринтів не має сенсу — навіть якщо S1.1 є блокованим, вони вже є продуктово готовими.

### S2.4 — finyk preset sub-tile copy hints

- `apps/web/src/core/onboarding/PresetSheet.tsx:80-117` — desc на 3 фіник-пресетах (Кава / Таксі / Обід).
- Було: «їжа · введи суму» / «транспорт · введи суму» / «їжа · введи суму» — taxonomy + дублювання «введи суму» (яке вже є у sheet-заголовку).
- Стало: «як правило ~60–95 ₴» / «як правило ~80–200 ₴» / «як правило ~150–250 ₴» — хінт є hint, не lie. `~` і range — чесний orientation для Києва.
- `data.category` далі прокидається у форму модуля — логіка не зачеплена.

### S3.4 — hide MotivationalFooter до першого real entry

- `apps/web/src/core/hub/dashboard/dashboardCards.tsx:228-238` — `MotivationalFooter` повертає `null`, якщо `entryCount === 0`. Вже був фолбек-месидж «Sergeant працює для тебе офлайн 🔒» — прибраний.
- Вирівнюється з філософією S1.3: не святкуємо до того, як є причина. Real engagement-маркер живе вище у виді `<StreakIndicator />`.
- AC опціонально згадує preview-card «Ось що ти побачиш через тиждень» — відкладено (окрема історія, може сама перетворитися на fake-reward).

---

## 6. Що не зроблено в цьому циклі

- **S1.1** — copy-rewrite. Чекає copy-reviewer-а. Без review-у ризикуємо розкатати інженер-орієнтовану copy.
- **S1.2** — depends on S1.1.
- **S2.1 / S2.2 / S2.3** — deps від S1.1 або від S2.1.
- **S3.1 / S3.2 / S3.3 / S3.5** — наступні кандидати (S3.5 особливо — single-hero rule strengthening, без deps).
- **Mobile parity** для cross-cutting peek-backdrop — відкладено до того, коли в mobile додасться peek (якщо взагалі додасться).

---

## 7. Open follow-ups

- [x] Відкрити PR-и для S1.3 ([#1609](https://github.com/Skords-01/Sergeant/pull/1609)), S1.4 ([#1610](https://github.com/Skords-01/Sergeant/pull/1610)) і docs writeback ([#1611](https://github.com/Skords-01/Sergeant/pull/1611)).
- [x] Узяти S1.5 у роботу — PR [#1617](https://github.com/Skords-01/Sergeant/pull/1617).
- [x] Cherry-pick S2.4 — PR [#1618](https://github.com/Skords-01/Sergeant/pull/1618).
- [x] Cherry-pick S3.4 — PR [#1619](https://github.com/Skords-01/Sergeant/pull/1619).
- [ ] Підняти copy-reviewer-а для S1.1 (founder-friend / маркетолог / ЦА).
- [ ] Дочекатись post-S0 cohort report-у (PostHog) і додати before/after метрики для всіх 5 PR-ів цього циклу (поки що — якісний impact, кількісний — після).
- [x] Наступний батч кандидатів — S3.5 ([#1623](https://github.com/Skords-01/Sergeant/pull/1623)), S3.1 ([#1626](https://github.com/Skords-01/Sergeant/pull/1626)), S3.2 ([#1630](https://github.com/Skords-01/Sergeant/pull/1630)). Деталі — у [`s3-reward-moments.md`](./s3-reward-moments.md).

---

## 8. Reference

- Sprint plan: [`docs/launch/ftux-sprint-plan.md` §3](../ftux-sprint-plan.md#3-sprint-1--честний-value-prop-2-тижні)
- Audit джерело: [`docs/audits/archive/2026-05-03-ftux-onboarding-roast.md`](../../../audits/archive/2026-05-03-ftux-onboarding-roast.md) (P0 рекомендації для S1)
- Funnel definitions: [`docs/launch/04-launch-readiness.md` §4.2](../../business/04-launch-readiness.md)
- Sister post-mortem (S3 reward moments): [`s3-reward-moments.md`](./s3-reward-moments.md) — S3.4/3.5/3.1/3.2 деталі
- Activation baseline: [`docs/launch/01-monetization-and-pricing.md` §7](../../business/01-monetization-and-pricing.md#7-activation-метрики)
