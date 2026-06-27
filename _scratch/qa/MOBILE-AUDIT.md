# Mobile device-emulation QA pass — apps/web

> **Статус:** Active. **Дата:** 2026-06-28. **Гілка:** `qa/web-mobile-emulation` (свіжа від origin/main `2bdc4ef5b`).
> **Що це:** новий вимір QA-петлі — попередня петля (`LOOP-FINAL-REPORT.md`, 200 stories) ганялась на десктопі. Цей прохід емулює **телефон** (iPhone 15 + Pixel 7) через Playwright device-descriptors і ловить viewport-залежні дефекти, яких десктоп не бачить.

## Метод

- Harness: `_scratch/qa/mobile-audit.mjs` (reusable). `node _scratch/qa/mobile-audit.mjs http://127.0.0.1:5173`.
- Контекст per-device з `devices["iPhone 15"]` / `devices["Pixel 7"]` (touch, viewport, DPR, mobile UA).
- Demo-режим засівається раз (`/?demo=1`), персистить у localStorage (kvvfs); далі hard-nav по роутах із розумним очікуванням гідрації (skeleton cleared, не fixed-timeout — це була вада v1).
- Автоперевірки per route: **touch-target ≥44×44** (Hard Rule, з виключенням sr-only skip-links + hidden-input→label), **horizontal overflow**, **typography floor <12px** (Hard Rule #16).
- Скриншоти: `_scratch/qa/mobile-shots/*.png` (viewport, у файл — MCP-raster тут таймаутить). Звіт: `mobile-shots/audit-report.json`.
- Покрито 10 роутів × 2 девайси: hub, finyk, fizruk, fizruk/workouts, nutrition, nutrition/log, nutrition/menu, routine, insights, settings.

## Результати (iPhone 15 і Pixel 7 — ідентичні)

- ✅ **Horizontal overflow: ніде немає** — responsive layout тримається на 375–393px.
- Знахідки нижче згруповані за severity.

## Статус фіксів (2026-06-28, верифіковано наживо)

Усі знайдені дефекти опрацьовані; верифікація — `_scratch/qa/mobile-verify.mjs` у трьох режимах
(**anon**, **authed** через свіжого тест-юзера `qa.mobile@sergeant.local`, **demo**) × iPhone 15 + Pixel 7,
проти **реальної апки** (не лише demo). Артефакти: `mobile-shots/verify-{anon,authed,demo}.json`.

| Дефект                                | Дія                                                                         | Верифікація                                                                                                                                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M-001** demo-pill перекриває хедер  | mobile → `top-16` (нижче хедер-банди), desktop лишився `top-2`              | badge top:64 чисто нижче settings-search (8–58) і хедерів модулів; `overlapsSearch:false`                                                                                                                                                      |
| **M-002** heatmap 8px                 | `fontSize: 8 → 10` (день+місяць)                                            | `<10px = 0` скрізь; routine-лейбли рівно 10px (санкціонований axis-tick)                                                                                                                                                                       |
| **M-003** settings touch-targets      | `touch-target` на time/number-інпутах + label-рядках чекбоксів              | settings `small = 0`; ефективні тап-таргети 44px                                                                                                                                                                                               |
| **M-004** StatusStrip 11px            | label `text-meta → text-caption` (12px), **локально** (не глобальний токен) | fizruk `10-11px = 0`                                                                                                                                                                                                                           |
| **M-005** FAB-overlap + обрізана таба | **by-design / won't-fix**                                                   | FAB-over-content — стандартний патерн усіх модулів (`page-tabbar-pad` дає clearance кінця контенту, StatusStrip у середині сторінки → перекриття лише транзитне при скролі); обрізана таба — scrollable strip (аудит сам позначив «прийнятно») |

**Зведено по всіх режимах × девайсах:** `small=0`, `<10px=0`, horizontal-overflow ніде; єдиний `10-11px` —
heatmap-лейбли (10px, санкціоновано). Authed-сесія підтверджена (`/api/auth/get-session` → тест-юзер,
без demo-badge/«Увійти»). Login потребує origin `http://localhost:5173` (не `127.0.0.1` — Better Auth
`INVALID_ORIGIN`, бо `ALLOWED_ORIGINS=http://localhost:5173`).

**Змінені файли:** `DemoModeBadge.tsx`, `HabitHeatmap.tsx`, `NotificationsSection.tsx`,
`DashboardSection.tsx`, `FinykSection.tsx`, `StatusStrip.tsx`. ESLint на всіх — clean.

## Дефекти

### M-001 — Demo-pill «Демо · Вийти» перекриває хедер на мобілці (P1 — onboarding-конверсія, mobile)

> **Severity перекваліфіковано (2026-06-28):** не «demo-only low». Demo = головний pre-signup funnel; overlap б'є по кожному потенційному юзеру, що дивиться приклад із телефону — найконверсійніший момент. Не бачать pill лише вже-сконвертовані авторизовані юзери.

- **Де:** `core/onboarding/DemoModeBadge.tsx:41` — `fixed top-2 left-1/2 -translate-x-1/2 z-300`, глобально в AppShell на КОЖНОМУ роуті.
- **Симптом:** на вузькому viewport центрований fixed-pill налазить на повноширинний хедер:
  - `settings` — перекриває пошукову стрічку (placeholder «Пошук на…» обрізаний).
  - `fizruk` / модулі — перекриває заголовок модуля («ФІЗ… / Тренування»).
  - `hub` — OK (центр хедера вільний).
- **Чому десктоп не зловив:** широкий хедер лишає центр порожнім; колізія тільки на mobile.
- **Scope:** лише demo (`if (!demo) return null`) — реальні юзери не зачеплені. Але demo = вітрина «Подивитись приклад» → псує перше враження на телефоні.
- **Фікс (потребує рішення по розміщенню):** на mobile прибрати pill із зони хедера — варіанти: (a) опустити нижче хедера; (b) перенести в кут, що гарантовано вільний; (c) inline у хедер замість fixed-center. Десктоп лишити як є.

### M-002 — HabitHeatmap axis-лейбли 8px, нижче floor (Medium, Rule #16)

- **Де:** `modules/routine/components/HabitHeatmap.tsx:225,247` — `style={{ fontSize: 8 }}` на лейблах днів тижня (Пн/Ср/Пт/Нд) і місяців (черв./лип./…).
- **Порушення:** Rule #16 дозволяє axis-ticks максимум `text-2xs` (10px); 8px off-scale. Inline-стиль обходить лінт (тому CI зелений).
- **Mobile-вплив:** 8px підписи на телефоні майже нечитабельні.
- **Фікс:** 8px → `text-2xs` (10px), реверифікувати, що сітка heatmap не їде.

### M-003 — settings: touch-targets <44px (Low)

- `button "Увімкнути push-сповіщення"` — 44×**24** (висота).
- `input[type=time]` — 112×**41** (−3px, borderline).
- `input[type=checkbox]` — 16×16 (без label-wrapper; перевірити, чи обгорнутий у клікабельний рядок ≥44).
- **Scope:** під-форми settings; не на головному списку.

### M-004 — fizruk StatusStrip stat-лейбли 11px, off-scale (Low)

- «Готовність / Серія / Тиждень» рендеряться 11px (між `text-2xs` 10 і `text-xs` 12). −1px під floor. Мінор.

### M-005 — дрібні overlap-и (Low)

- FAB (асистент) перекриває крайню stat-картку «Тиждень» на fizruk.
- Крайня таба модуль-світчера («Харчув…») обрізана праворуч (scrollable strip — прийнятно).

## Залишок / не покрито цим проходом

- Інтеракції (відкриття sheet-ів, свайпи, bottom-nav переходи) — прохід статичний (скриншот + DOM-аудит на роут). Інтеракційний mobile-pass — наступний крок за потреби.
- Real-account мобільні флоу (auth/onboarding/billing на телефоні) — стек піднятий, але Anthropic-ключ ревокнуто (401) → AI-стрім BLOCKED (як і в десктоп-петлі).
- apps/mobile (Expo) — поза Playwright; інший інструментарій.
