# Sergeant · мокапи

> **Що це.** Візуальна правда для дизайн-рев'ю і для передачі завдань у код.
> Не виробничий код, не частина `apps/`. Окремі HTML-файли — відкриваються
> одним кліком у браузері. Кожен файл — самодостатній; токени тягнуться з
> `_shared/tokens.css`.
>
> **Чому окрема папка.** Щоб malювати, переглядати й обговорювати дизайн
> без build-step і без TypeScript. Один источник правди для всього, що
> «виглядає так-то».

---

## Структура

```
mockups/
├ index.html              ← портал · 6 кластерів, фільтр і пошук
├ README.md               ← цей файл
│
├ _shared/                ← одне джерело токенів і стилів
│  ├ tokens.css           ← дзеркало docs/05-design/design/design-system.md
│  ├ marketing.css        ← кремові розкладки (лендинг, маркетинг)
│  ├ product.css          ← темні скляні v2-поверхні
│  ├ code-references.md   ← мапа: який мокап ↔ який файл коду
│  └ components/          ← шаред JS/JSX без build-step
│     ├ deck-stage.js     ← Web Component: slide-deck shell
│     ├ design-canvas.jsx ← pan/zoom canvas (Figma-подібний)
│     ├ tweaks-panel.jsx  ← in-deck tweak controls
│     └ motion-variants.jsx ← 5 анімованих сцен
│
├ pitch/                  ← pitch для інвесторів
│  ├ deck-v1.html         ← investor deck v1 (слайди + навігація)
│  ├ one-pager.html       ← pre-seed one-pager для VC
│  └ ph-launch-storyboard.html ← Product Hunt 90s walkthrough
│
├ motion/                 ← motion concepts
│  └ concepts.html        ← 5 зациклених сцен
│
├ landing/                ← лендинги
│  ├ pricing.html         ← сторінка тарифів
│  ├ directions/          ← 3 брендові напрямки
│  └ campaigns/           ← 8 рекламних варіантів
│
├ marketing/              ← поза-лендингові маркетинг-поверхні
│   (email-drip, social-posts, og-cards, brand-sheet, wrapped-2026, app-store-screens, …)
│
├ product/                ← екрани всередині застосунку
│  ├ index.html           ← легенда трьох станів + 4 модулі
│  ├ splash/              ← iOS + Android + in-app splash screens
│  ├ finyk/ fizruk/ routine/ nutrition/   ← по модулях
│  ├ onboarding/          ← первинне знайомство, 6 кроків
│  ├ states/              ← пустий / помилка / нуль на сьогодні
│  ├ hubchat/             ← AI-чат (планується)
│  ├ paywall/             ← платний доступ (планується)
│  ├ settings/            ← налаштування / приватність (планується)
│  ├ quick-add/           ← плаваюча кнопка + лист (планується)
│  └ push/                ← сповіщення (планується)
│
└ flows/                  ← діаграми послідовностей
   (signup, referral, n8n, telegram-bot)
```

**Правило іменування:** лише `kebab-case.html` (літери малі, через дефіс).
Без пробілів і Title Case — щоб посилання у URL не ламались.

---

## Як читати картки у порталі

`mockups/index.html` має легенду з 3 статусами + 3 пріоритетами.

### Статус — у трьох кольорах

| Маркер             | Що означає                                                                       |
| ------------------ | -------------------------------------------------------------------------------- |
| 🟢 **у продукті**  | Файл існує, відкривається. Готовий до перегляду або передачі у код.              |
| 🟡 **у роботі**    | Файл є, але текст або структура поки змінюються. Чернетка.                       |
| ⚪️ **заплановано** | Картка показує, що поверхня потрібна. Самого файлу ще немає. Штрихована заливка. |

### Пріоритет — для запланованих (3 рівні)

| Маркер              | Коли застосовується                                            |
| ------------------- | -------------------------------------------------------------- |
| 🔴 **1 — критично** | На launch-критичному шляху. Без цього beta-ціль не вистрілить. |
| 🟠 **2 — високо**   | Сильно покращує знайомство або повернення. Бажано до launch.   |
| 🔵 **3 — середньо** | Корисне, але можна після launch. Не блокує жоден шлях.         |

---

## Три стани продуктових екранів

Кластер **product/** і деякі переходи у **flows/** використовують
**3-state-формат**. Конвенція успадкована з `redesign-v2/handoff-package/`
і застосовується до кожного екрана:

| Стан                     | Що показує                                   | Звідки джерело                                                        |
| ------------------------ | -------------------------------------------- | --------------------------------------------------------------------- |
| **Зараз** _(coral)_      | Те, що користувач бачить сьогодні у проді    | Реальний код `apps/web/src/...`                                       |
| **Планується** _(green)_ | Те, що описано у планах, founder апрувнув    | `docs/01-product/launch/...`, `docs/05-design/design/redesign-v2/...` |
| **Рекомендую** _(cyan)_  | Мої доповнення поверх плану — на обговорення | Цей файл · обговорення з founder-ом                                   |

> **Важливо.** «Рекомендую» — пропозиція, **не** контракт. Її **не** треба
> імплементувати без додаткового погодження. Це матеріал для розмови.

Лендинги, маркетинг і flows використовують власну версійну схему
(`v1` / `v2` / `v3` як варіанти, не як часовий зріз).

---

## Робота з агентами (Claude Code тощо)

Мокапи — не «робочий backlog». Це **візуальна ціль на конкретне завдання**.
Точкове наведення працює, ціле «зроби як на мокапі» — ні.

### Шаблон 1 · Імплементувати один екран / компонент

```
Подивись на мокап:
  mockups/product/onboarding/index.html

Імплементуй крок 5 («Дашборд першого дня»), стан «Планується» —
HeroPromiseCard, що замінює ModuleChecklist + OnboardingProgress.

Контекст у коді:
  apps/web/src/core/hub/dashboard/
  apps/web/src/core/onboarding/

Поведінкові деталі (копія per-module, gate за feature flag
dashboard_outcome_card_v1) — у docs/01-product/launch/product-os/ftux-master-tracker.md
розділ 5 «Outcome card sketch».

НЕ роби стан «Рекомендую» — це окреме обговорення.
```

### Шаблон 2 · Знайти невідповідність дизайну і коду

```
Порівняй мокап стану «Зараз»:
  mockups/product/finyk/overview-mobile.html  (стан 0)

з реальним кодом:
  apps/web/src/modules/finyk/pages/Overview.tsx

Що відрізняється у markup, які компоненти у коді не показані у мокапі і
навпаки. Знайди розходження у дизайн-токенах (radii, glass, accent).
Підсумок у вигляді списку.
```

### Шаблон 3 · Спроектувати нову поверхню

```
Спершу — мокап.

Не пиши код. Згенеруй HTML-мокап під шляхом:
  mockups/product/<surface>/index.html

Дотримуйся:
  · 3 стани (Зараз → Планується → Рекомендую) для продуктового екрана,
    АБО v1/v2/v3 якщо це лендинг/маркетинг
  · кольорова легенда як у mockups/product/onboarding/index.html
  · токени з mockups/_shared/tokens.css (через relative import)
  · посилання на джерело-план у docs/

Після того як founder подивиться — створимо тікет на реалізацію.
```

### Шаблон 4 · Оновити мокап після зміни у коді

```
Подивись на код:
  apps/web/src/modules/routine/RoutineApp.tsx
  apps/web/src/shared/components/ui/Sheet.tsx

Онови стан «Зараз» у мокапі:
  mockups/product/routine/today.html

Тільки стан 0 — інші два (Планується / Рекомендую) не чіпай. Зміни:
  · скріни оновленого RoutineHeader
  · нові статус-ярлики у RoutineTimeline (Wave 1 PR #1742)
  · оновлене значення last-validated у нижньому колонтитулі

Бамп last-validated на сьогоднішню дату.
```

---

## Правила

- **Не імплементуй стан «Рекомендую» без апруву founder-а.**
  Це матеріал для обговорення, не contract.
- **Не редагуй `_shared/tokens.css` напряму.** Він — дзеркало
  `docs/05-design/design/design-system.md`. Зміна тут має йти разом зі зміною там.
- **Не змішуй marketing.css і product.css в одному файлі.** Кремовий папір
  для лендингу і темне glass-середовище для продукту — різні режими.
- **Імена файлів — лише `kebab-case.html`.** Без пробілів, без Title Case.
- **Кожен файл містить `last-validated` дату у footer.** Якщо вона стара
  &gt; 90 днів — стан міг розійтися з кодом, треба перевірити.
- **3-state — обов'язковий для product/.** Лендинг/маркетинг — за бажанням
  (там часто 3 варіанти, але це різні напрямки, не часовий зріз).
- **Якщо хочеш додати поверхню — спершу картка у `mockups/index.html`,
  потім файл.** Картка зі статусом «заплановано» — це сигнал «ми це
  обговорюємо», а не «ось готовий шматок роботи».

---

## Як додати новий мокап

1. **Картка у портал** (`mockups/index.html`) — `data-status="pending"`,
   `data-priority="p0|p1|p2"`. Файл ще можна не створювати.
2. **Файл** під правильним шляхом: `mockups/<cluster>/<surface>/index.html`
   або `<cluster>/<surface>.html`.
3. **`<link rel="stylesheet" href="../../_shared/tokens.css" />`** — токени
   завжди звідти. Якщо потрібно, додатково `marketing.css` або `product.css`.
4. **Footer з джерелами:** який план, який код у `apps/`, дата `last-validated`.
5. Коли файл готовий — змінити статус у портал-картці на `done`.

---

### Shared components

The `_shared/components/` folder holds vendored helpers used by multiple
mockup HTML files (deck-stage shell, design canvas, tweaks panel, motion
variants). These are pure JS/JSX with no build step — included via plain
`<script src>` tags relative to the mockup that uses them. Do not edit
without updating every consumer; see `_shared/components/README.md` for
the contract.

---

## Що НЕ є мокапами тут

- **Готовий код.** Це окремий світ. Якщо ти редагуєш мокап, ти не
  редагуєш продакшн.
- **Storybook.** У Sergeant є `apps/web/src/core/DesignShowcase/` як
  живий styleguide примітивів — це джерело правди для **компонентів**,
  не для **сценаріїв**.
- **Документи з обґрунтуванням.** Розгорнуті дискусії й decision logs
  лишаються у `docs/` (`docs/01-product/launch/`, `docs/05-design/design/`). Мокап посилається
  на них, але сам не є документом.

---

**Last validated:** 2026-05-18.
**Maintainer:** founder + Claude (designer-assistant).
**Канонічний токен-сорс:** `docs/05-design/design/design-system.md`.
**Беклог (що не зроблено / що далі):** `docs/05-design/design/mockups-backlog.md`.

---

## Коротка історія версій

| Дата       | Що додано                                                                                                                                                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-17 | Портал v0.2 · `product/states/` · `product/onboarding/`                                                                                                                                                                                                                           |
| 2026-05-18 | `product/paywall/` · `product/hubchat/` · цей README · `mockups-backlog.md`                                                                                                                                                                                                       |
| 2026-05-18 | `product/settings/` · `product/quick-add/` · `product/push/` · `flows/telegram-bot.html` — **вся первинна бібліотека закрита**                                                                                                                                                    |
| 2026-05-22 | `pitch/` (deck-v1, one-pager, ph-launch-storyboard) · `motion/concepts.html` · `marketing/wrapped-2026.html` · `marketing/app-store-screens.html` · `landing/pricing.html` · `product/splash/` · `_shared/components/` (deck-stage, design-canvas, tweaks-panel, motion-variants) |
