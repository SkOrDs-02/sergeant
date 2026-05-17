# Hidden tech-debt audit — поза backlog'ом

> **Створено:** 2026-05-17 з канви + grep по `apps/web/src/`.
> **Призначення:** Знайти v1 поверхні які НЕ зафіксовано в `../backlog.md` /
> `../execution-plan.md`. Скеровано на zero-cost-to-add polish items + structural gaps.

Кожен пункт має:

- **Файл** — точна локація v1 markup
- **Доказ** — конкретний рядок з grep'у
- **Чому це borg** — пояснення
- **Розмір** — XS/S/M/L
- **У backlog?** — yes (already known) / partial (covered тільки частково) / **NO** (новий gap)

---

## ⚠ Confirmed gaps NOT in backlog

### 1. `ModuleBottomNav` ще v1 (висвітлено в канві)

- **Файл:** `apps/web/src/shared/components/ui/ModuleBottomNav.tsx` + 4 module wires
- **Доказ:** `bg-panel/95 motion-safe:backdrop-blur-xl border-t border-line` + sliding top-pill 4px
- **Чому це borg:** Hub отримав v2 floating glass pill через PR-5, модулі лишилися v1. Один і той самий екран має v2 mesh+glass cards+AIPill зверху і v1 nav знизу — мозаїка.
- **Розмір:** M (full v2) або XS (chrome-only lift `shadow-nav` + `mx-3 mb-3 rounded-r-2xl`)
- **У backlog?** **NO** — `unified-bottom-nav.md` стверджує однакову форму, що було вірно ДО PR-5
- **Спец-кейс:** Routine має center FAB у nav — потребує FAB як sibling sibling (z-index >, top: -22)

### 2. Hub Insights cards — v1

- **Файл:** `apps/web/src/core/insights/AssistantAdviceCard.tsx:59`, `TodayFocusCard.tsx:183`
- **Доказ:** `bg-panel border border-line rounded-2xl shadow-card`
- **Чому це borg:** Це Hub-level surfaces які juxtapose'ують з v2 InsightCard / AIPill / WeeklyDigest. Backlog згадує `WeeklyDigestCard` (поряд) і `InsightCard` (новий primitive), але `AssistantAdviceCard` + `TodayFocusCard` пропущено.
- **Розмір:** S (~2 файли + Storybook)
- **У backlog?** **NO**

### 3. `core/hub/dashboard/dashboardCards.tsx` v1

- **Файл:** `apps/web/src/core/hub/dashboard/dashboardCards.tsx:266`
- **Доказ:** `shadow-card hover:shadow-float transition-...`
- **Чому це borg:** Окремо від `BentoCard` (який згаданий у backlog C1). Це додаткові dashboard widgets.
- **Розмір:** S — частина того ж PR-у що й C1
- **У backlog?** **partial** — C1 згадує BentoCard, але не цей файл

### 4. `CrossModulePreview` v1 chrome у insights story

- **Файл:** `apps/web/src/core/hub/CrossModulePreview.tsx:77`
- **Доказ:** `bg-panel border border-line rounded-2xl p-4 shadow-card overflow-hidden`
- **Чому це borg:** Згадується в execution-plan як cross-Hub MAJOR migration (Phase 2.4), але без explicit verification recipe.
- **Розмір:** XS (1 файл)
- **У backlog?** partial — у execution-plan не в backlog

### 5. `HubSettings` section cards — mixed state

- **Файл:** `apps/web/src/core/hub/HubSettingsPage.tsx:296-334`
- **Доказ:** Search + tabs uses `bg-surface-glass backdrop-blur-md` (v2), але section cards нижче — `bg-panel rounded-2xl shadow-card` (v1)
- **Чому це borg:** На ОДНІЙ сторінці змішано v2 search-bar і v1 section cards. Закриває C5 у плані.
- **Розмір:** S
- **У backlog?** **yes** (C5 у execution-plan), але як partial — не як новий gap

### 6. `Skeleton` components don't account for glass surfaces

- **Файл:** `apps/web/src/shared/components/ui/Skeleton.stories.tsx:56`
- **Доказ:** `<div className="bg-panel rounded-2xl p-4 ...">` як wrapper — і `Skeleton` примітив всередині використовує v1 `bg-panelHi` shimmer
- **Чому це borg:** Коли Card мігрує на glass, але всередині — v1 skeleton plate з `bg-panelHi`, виглядає як footprint. `Skeleton` має знати про parent surface (`bg-surface-glass`) і tint'итися відповідно.
- **Розмір:** S (1 primitive change + propagation)
- **У backlog?** **NO**

### 7. `PullToRefresh` stories — v1 cards

- **Файл:** `apps/web/src/shared/components/ui/PullToRefresh.stories.tsx:55,81,108`
- **Доказ:** `bg-panel rounded-2xl border border-line`
- **Чому це borg:** Storybook stories не виправлено — це або міграція v1 wrap-демо, або апплі-кошмар коли pull-to-refresh wrap'ає v2 glass card з v1 outer wrap.
- **Розмір:** XS (Storybook only)
- **У backlog?** **NO**

---

## 🤔 Speculative gaps (потребують 5-min code-review для підтвердження)

### 8. Periphery banners — IOS install / Offline

- **Файли:** `apps/web/src/core/app/IOSInstallBanner.tsx`, `OfflineBanner.tsx`
- **Підозра:** З'являються поверх mesh background; якщо ще на v1 panel — виглядатимуть як прибульці на v2 mesh.
- **Розмір:** XS each (2 файли)

### 9. WelcomeScreen — first-time experience

- **Файл:** `apps/web/src/core/app/WelcomeScreen.tsx`
- **Підозра:** Перше, що бачить новий user. Якщо v1 — поганий перший враження.
- **Розмір:** S

### 10. AuthPage / LoginForm / RegisterForm

- **Файли:** `apps/web/src/core/auth/`
- **Підозра:** Поза redesign-v2 scope зазвичай. Але це теж touchpoint — login screen на v1 поверх v2 mesh виглядатиме disjoint.
- **Розмір:** M (декілька форм)

### 11. Form controls у glass-card context

- **Файли:** `Input.tsx`, `Select.tsx`, `Switch.tsx`, `Slider.tsx`
- **Підозра:** Контракт design-system § Forms каже Input uses `bg-panelHi` background, який на glass card виглядатиме як "плата" замість "плавання". Потрібен Input variant for glass parents — або filled / ghost варіант перевірити.
- **Розмір:** S
- **Точно перевірити:** рендер Input на `bg-surface-glass` card

### 12. Banner component — status banners

- **Файл:** `Banner.tsx`
- **Підозра:** Used for success/warning/danger. Backlog оминає; може бути v1 panel chrome.
- **Розмір:** XS

### 13. Toast surface treatment

- **Файл:** `Toast.tsx` + `useToast.tsx`
- **Підозра:** Toast політика чітка, але сам surface chrome на v2 узгоджений?
- **Розмір:** XS

### 14. Tooltip / Popover surface

- **Файли:** `Tooltip.tsx`, `Popover.tsx`
- **Підозра:** Surface treatment у hub з glass mesh-фоном — чи Tooltip окремо?
- **Розмір:** XS each

### 15. PaywallModal / TrialBanner

- **Файли:** `apps/web/src/core/billing/`
- **Підозра:** Billing зазвичай поза redesign scope. Але якщо v1 — billing flow виглядатиме як інший app.
- **Розмір:** M
- **Рекомендація:** Поза v2 scope. Окремий «Premium v2» цикл.

### 16. HubChat (full-screen route) vs ChatSheet (bottom-sheet)

- **Файл:** `apps/web/src/core/hub/HubChat.tsx`, `HubChatPage.tsx`
- **Підозра:** Backlog згадує перетворення на modal-route. Ні `HubChat` ні `HubChatHistoryDrawer` не verified в v2 ще.
- **Розмір:** L (route restructure + Drawer migration)
- **У backlog?** **partial** (ChatSheet modal-route згадано; chat surface chrome — окремо)

### 17. HubBackupPanel

- **Файл:** `apps/web/src/core/hub/HubBackupPanel.tsx`
- **Підозра:** Утилітарна сторінка — backup/restore. Не в backlog. Якщо v1 — другорядно, але видно.
- **Розмір:** XS

### 18. Onboarding cards

- **Файли:** `apps/web/src/core/onboarding/` (path-guess), `ReEngagementCard.tsx`, `FirstActionSheet.tsx`, `DailyNudge.tsx`
- **Підозра:** Execution-plan каже Phase 2.4 «Onboarding cards» — але без перерахування всіх компонентів і їхніх стилів.
- **Розмір:** M (4-6 файлів)
- **У backlog?** **partial**

---

## 💡 Improvement ideas (не борги, але добавкою)

### A. Hub-level pull-to-refresh treatment

- На module pages — `RefreshControl` має v1 visual (top-of-page spinner). На v2 mesh — спеціальний glass overlay spinner може виглядати краще.

### B. Skeleton screens v2 — module-aware

- Module skeleton має дзеркалити module accent (наприклад, Finyk skeleton shimmer — emerald tint, Routine — coral).

### C. Long-press / swipe gestures без visual hint

- `undo-pattern.md` згадує swipe-to-delete, але немає systematic affordance hint (нема "drag to right" visual).

### D. Cmd+K + global search — поза v2 redesign

- Search shortcut є (`shortcuts.md`), але search surface (`hubSearchEngine.ts`) — chrome не задокументований у v2.

### E. Accessibility audit — focus order in glass nested cards

- Nested `<Card prominence="glass">` поверх mesh — tabbed focus order не verified. axe-core у CI ловить contrast, але не deep keyboard nav.

### F. Empty states — coverage matrix

- `empty-states.md` визначає tier 1/2/3 patterns. Але **які точно сторінки користуються яким tier'ом?** Аудит на consistency — корисний.

### G. Loading state coverage

- Skeleton existing screens — повний список? Map skeleton patterns to screens.

### H. Section header convention

- `SectionHeader` primitive із 5 sizes. Чи кожен модуль використовує консистентно?

---

## Приорізація для v2 close

| Що                                         | Чому                                             | Effort | Recommended                          |
| ------------------------------------------ | ------------------------------------------------ | ------ | ------------------------------------ |
| **1** ModuleBottomNav XS chrome-lift       | Single biggest visual mosaic                     | XS     | ✅ Ship у Phase 1 / 2                |
| **2** AssistantAdviceCard + TodayFocusCard | Hub mosaic — visible на main screen              | S      | ✅ Add to backlog Hub section        |
| **3** dashboardCards.tsx                   | C1 partial — extension                           | S      | ✅ Bundle з C1                       |
| **6** Skeleton glass-aware tint            | Polish on every loading state                    | S      | ✅ Add to Phase 0 (single primitive) |
| **7** PullToRefresh stories                | XS Storybook only                                | XS     | ✅ Bundle з C1                       |
| **11** Form controls glass audit           | Якщо Input "пливе" дивно на glass — потрібен fix | S      | ⚠ Verify first, ship if needed       |
| **8/9** Banners + WelcomeScreen            | Periphery, low traffic                           | S      | ⏳ Phase 7 v2.1                      |
| **10** AuthPage                            | Out of scope                                     | M      | ❌ Окремий цикл                      |
| **15** PaywallModal                        | Out of scope                                     | M      | ❌ Окремий цикл «Premium v2»         |
| **16** HubChat modal-route                 | Strategic, big                                   | L      | ⏳ Phase 7 v2.1                      |

---

## Що **немає** у плані але було б корисно

### Type system / tokens

- `--c-overlay-scrim` token — scrim для модалок на v2 mesh. Зараз inline `bg-black/40`.
- `--c-input-bg-glass` — Input background variant для glass-card parents.
- `text-style-button` ramp — Button typography контракт окремо від generic body.

### Component layer

- `<HeroSurface>` primitive — wraps `Card prominence="hero"` + ring/decoration/CounterReveal. Сьогодні кожен module re-implements.
- `<KpiRow>` primitive — KPI mini-grid, де кожен tile = label + tnum value + delta. Сьогодні inline в 4 модулях.
- `<ScanModePill>` primitive — Nutrition mode toggle. Recurring pattern.

### Process

- Visual regression tests — Playwright snapshot для кожного `<state-state>` пари в усіх 4 модулях. Зараз тільки HubBottomNav має visual test.
- Storybook v2 stories для кожного нового primitive (CounterReveal, HeroValueLine).

---

## Refs

- `../backlog.md` — official backlog (порівняти з цим аудитом)
- `../execution-plan.md` § Polish gaps — конкретні items для Phase 2
- `unified-bottom-nav.md` — застарілий доку (треба оновити після ModuleBottomNav v2)
- Canvas: 4 HTML файли у цьому handoff package
