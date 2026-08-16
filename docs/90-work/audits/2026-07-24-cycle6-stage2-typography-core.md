# Цикл 6, стадія 2 — сирі Tailwind-розміри в `core/**`

> **Last touched:** 2026-08-16 by @claude. **Next review:** 2026-11-21.
> **Status:** Reference — звіт про виконання наряду циклу 6, стадія 2; baseline
> скорингу — [`2026-07-21-design-audit.md`](./2026-07-21-design-audit.md).

> Наряд: `cycle-6-stage-2-task-for-claude-code.md` (Claude Design).
> Метод: `design-audit-sergeant-web.md § Уроки`. Стек: dev `localhost:5175`,
> demo+FTUX, Chromium/Playwright, piксель-дифф fullPage, computed-проби, axe-core.

## Headline 26 vs 34.6 — fluid-scale, не баг

`.text-style-headline` = `clamp(1.625rem, 1.446rem + 0.893vw, 2.25rem)`: **26px** min
(mobile floor, 375px), **36px** ceiling. На 1280px: `1.446rem + 0.893·12.8 = 34.57px`
(у межах clamp). Тобто «26» у таблиці Rule #16 — нижня межа, «34.6» — computed саме на
1280, «36» — стеля. Токен коректний; таблиця показує min→max, computed завжди між ними.

## Результат

**0 сирих `text-<size>` у текстових ролях `core/**`.** ~357 переведено на семантичні
ролі. Залишок 21 — навмисні винятки (кожен обґрунтований, див. §Винятки).

## Виконання

**8 web-агентів** по диз'юнктних піддеревах (кожен читав канон Rule #16 як єдине
джерело): hub (48), settings (47), profile (30), onboarding (32), stories (20),
insights (33), DesignShowcase (~94 real), решта-core (45).

**4 директорії, що саби не покрили — доробив сам:** `billing/TrialBanner`,
`feedback/FeedbackSection`, `whatsNew/WhatsNewModal` (×2), `hub/chat/ChatEmpty` (×3).

**1 over-mapping виправлено:** `WeeklyDigestCard` акордеон-рядок модуля — саб змапив
у `title` (22px), але це компактний рядок (py-2.5, 24px іконка), не секційний
заголовок → повернув на `label`, summary під ним → `caption`. Візуально підтверджено
чистим (кадр `after/insights--light`).

## Вага (важлива системна примітка)

- **Числа зберегли `font-bold`** (перевірено ExpensesCard: `text-style-body font-bold`
  = 16px/700, як було `text-base font-bold`). Регресії ваги на цифрах немає.
- **Заголовки / eyebrow / CTA:** саби прибирали дублюючий `font-bold`/`font-semibold`,
  щоб роль несла вагу (title 600, overline 600, label 500). Це узгоджено з каноном
  Rule #16 («утиліта задає вагу, щоб не було дрейфу») — але де `font-bold`(700)
  перекривав, рендер став на тир легшим (600). Свідома нормалізація, не регресія;
  це і є мета переходу на ролі.

## Гейти

- **Лічильник:** 0 сирих у текст-ролях (скрипт). ✅
- **typecheck:** чисто. ✅
- **lint:** 0 errors. 3 unused `eslint-disable no-eyebrow-drift` (саби сконвертували
  eyebrows у showcase, лишивши file-level disable) — прибрано `eslint --fix`. ✅
- **axe** (hub/insights/settings/status/welcome/chat × light/dark): **0 нових порушень**.
  3 pre-existing serious (не від свіпу — зміна лише токена розміру не створює
  color-contrast, бо не перетинає межу 18px великого тексту):
  - status «Серйозна проблема» span — **незмінний** свіпом (Banner danger-variant на dark);
  - status timestamp `text-xs`→`caption` (обидва 12px, `opacity-80` — колір);
  - dark-chat кнопка (`h-9`) — колірний контраст.
    Той самий клас боргу, що finyk MonthlyPlanCard (stage 1) — поза скоупом типографіки.
- **Тести:** `src/core` — 3114 pass / 7 fail (4 файли). **0 регресій від свіпу:**
  доведено — зі стешеними змінами (чистий origin/main) ті самі файли падають так само
  (`HubChatHeader` «No QueryClient» — тест без QueryClientProvider; `sqlite.init`
  crossOriginIsolated; `PageLoader` skeleton; `lockStorage` 156s brute-force timeout).
  Три з чотирьох файлів навіть не в дифі; `HubChatHeader` diff — суто className.
- **Піксель-дифф** (7 core-екранів × 2 теми): hub 13.6% / insights 12.4% — reflow від
  line-height ролей (fullPage амплітудить) + content-dynamism на хабі (час доби,
  adaptive-bento). Спот-чек insights/status — ієрархія чиста, не регресії.

## Винятки (21 лишок, навмисно)

- **DesignShowcase `Typography.tsx` TEXT_SIZES** (8) — `{ cls: "text-4xl", … }` демо-дані,
  що РЕНДЕРЯТЬ клас для показу шкали (предмет showcase, не UI-типографіка).
- **stories eyebrows** (12) — `text-xs uppercase tracking-[0.3em] font-bold` з file-level
  `eslint-disable no-eyebrow-drift`. Bespoke трекінг 0.3em не мапиться на overline
  (0.08em); конвертація змінила б стилістику слайдів. Документований exemption Rule #16.
- **`hub/OutcomeCard.tsx:108`** (1) — pre-existing deferred tech-debt з
  `eslint-disable prefer-text-style`; не чіпав.

## Флаги для дизайн-звірки

1. **stories eyebrows** — лишені з 0.3em трекінгом (не overline). Рішення: чи форсувати
   overline (втратить wide-tracking стилістику слайдів), чи лишити exemption.
2. **NutritionSlide macro-значення** 20px → `title` (size-match, не role-match — це не
   «заголовок»). Кандидат на окреме рішення.
3. **BrandLogo/wordmark** lg/md (20/18px) → єдиний `title` (fluid 18-22) — втрата
   двотирної різниці.
4. **DesignShowcase `index.tsx`** top-bar h1 → `label` (компактний sticky-логотип, не
   page-H1) — навмисне відхилення від «H1→headline».
5. **DeleteAccountDialog** h2 16px → `title` (18-22, +вага-нормалізація).

## Не в скоупі (stage 3)

Модульні поверхні `finyk/fizruk/routine/nutrition/**`, включно з MonthlyPlanCard
`text-subtle` контрастом. Pre-existing color-contrast борг (status/chat) — окремо.
