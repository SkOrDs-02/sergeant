# SPEC: «Чорнило» v3.1 — фікси після мерджу кроків 1–7

> **Last touched:** 2026-07-20 by @cursoragent. **Next review:** ніколи (read-only архів).
> **Status:** Archived (read-only). Fast-forward archived 2026-07-20 (90-day gate skipped за рішенням founder-а). Source: `docs/90-work/planning/specs/chornylo-post-merge-fixes.md`. Purpose: §§1–7 (PR A–D) shipped — ModuleShell MeshBackground, hero-ink Card, light §5 hero, Toast/Segmented/hub-primary.

<!-- Джерело: Claude Design проєкт «Оцінка дизайну Сержанта»
     (claude.ai/design/p/533ee825-ad53-40fc-80ec-21c74dcbf183), файл
     «Фікси після мерджу.dc.html» (Fix spec · «Чорнило» v3.1) — увесь його зміст
     (значення, файли, до/після) транскрибовано сюди дослівно, окремий asset не
     потрібен. Базова спека напряму: chornylo-visual-direction.md; еталони екранів:
     chornylo-assets/napryamy-vizualu.dc.html.
     Твердження «зараз» звірені з кодом origin/main (050c3fe82, 2026-07-11).
     Ця спека самодостатня. -->

## Проблема

Кроки 1–7 «Чорнила» змерджені (#235/#237): токени, `.dark`, mesh, Card, nav,
module-Button прийняті дизайном. Але лишилось **4 розриви зі специфікацією**,
знайдені в коді на main, плюс **3 закриті дизайн-рішення** (Toast, Segmented,
hub-Primary). Найпомітніший розрив: модульні екрани в dark досі сидять на старому
теплому charcoal-градієнті з dot-текстурою, а не на ink-mesh — хаб і модулі
виглядають як два різні застосунки.

## Мета

Усі 7 пунктів фікс-спеки закриті: модульні екрани на тому самому ink-mesh шарі, що
й хаб; hero-картки в dark — «тиха» тонована поверхня (ідентичність через бордер +
glow); hero в light — насичений §5-якір, ідентичний в обох темах; light mesh
притишений; Toast/Segmented/hub-Primary приведені до канону. API компонентів не
змінюється.

## Рішення дизайну

- **§5 Toast — гібрид, не «або/або»** (відповідь дизайну на відкрите питання):
  база `surface-hi`, смужка 3px + іконка беруть **семантичний** колір (success/
  danger, не module-акцент), текст — ink. Повна заливка скасовується.
- **§2 hero dark — «одна поверхня, модуль несе лише акцент»**: `-900` заливка
  ламає принцип; канон — заливка майже не відрізняється від surface, ідентичність
  несуть accent-бордер /25 + inset-glow. `-soft`-токени НЕ чіпати — вони лишаються
  для soft-кнопок і бейджів.
- **§3 hero light — «якір» бренду**: той самий насичений градієнт в обох темах,
  світлий текст `#fdf9f3`. Відкинуто пастель (не тримає екран).
- **§7 primary у хабі** — «Primary бере акцент контекстного модуля; у хабі —
  emerald»: tier-400 заливка + ink-текст + glow, ідентично module-кнопкам з #237.
  `primary-ink` лишається для контекстів без модуля (auth, settings, legal).
- **Пріоритет = порядок секцій**; групування у 4 PR (нижче).

## Пункти фіксів (canonical)

### §1 · module-bg: warm-charcoal → ink mesh (PR A — найбільший візуальний ефект)

**Файл:** `apps/web/src/styles/background.css`.

Зараз `.dark` має `--bg-gradient: linear-gradient(135deg, rgb(23 20 18), rgb(28 24 22), rgb(31 28 26))`

- dot-tile `rgba(255,255,255,0.02)` — теплий charcoal, не ink.

1. У `.dark` замінити `--bg-gradient` на mesh-еквівалент: ті самі 3 radial-глоу
   зі `--bg-mesh-1..3` поверх `#0d1512` — **або, кращий варіант**: перевести
   module shells з `.module-bg` на існуючий `.bg-mesh` (один фоновий компонент
   на весь застосунок).
2. Dot-tile у dark прибрати (alpha → 0): «Чорнило» не має текстурного шуму,
   фірмовий шар — глоу.
3. HC + reduced-motion вже колапсують mesh — перевірити, що module shells
   успадковують це через var-и.

Еталон «має бути»: `radial-gradient(75% 80% at 85% -10%, rgba(52,211,153,0.12), transparent 60%),
radial-gradient(65% 70% at 0% 80%, rgba(34,211,238,0.08), transparent 60%),
radial-gradient(70% 80% at 100% 110%, rgba(255,140,120,0.08), transparent 60%), #0d1512`.

### §2 · Hero card (dark): -900 заливка → тонований градієнт (PR B)

**Файли:** `apps/web/src/styles/theme.css` + `packages/design-tokens/tailwind-preset.js`

- `apps/web/src/shared/components/ui/Card.tsx`.

Зараз (Card.tsx, `MODULE_PROMINENCE`): hero dark = `dark:bg-finyk-soft` (emerald-900
`#064e3b`) — насичена пляма.

1. Додати 4 CSS-градієнти `--hero-ink-{module}` у `.dark` + Tailwind-утиліту
   `bg-hero-ink-{module}`:

   | module    | 160deg градієнт     |
   | --------- | ------------------- |
   | finyk     | `#12201a → #0f1a15` |
   | fizruk    | `#101d20 → #0e1719` |
   | routine   | `#1d1614 → #171110` |
   | nutrition | `#171f10 → #12180d` |

2. У Card.tsx hero: `dark:bg-finyk-soft` → `dark:bg-hero-ink-finyk` (замінює і
   `dark:bg-none` — background-image перекриває light-градієнт сам). Бордер
   `/25` та inset-glow — без змін. Аналогічно для 4 модулів.
3. `-soft`-токени не чіпати (soft-кнопки/бейджі).

### §3 · Hero card (light): пастель → §5-якір (PR C — найбільший за обсягом)

**Файли:** `theme.css` (`--hero-grad-{module}`) + Card.tsx hero (light-гілка).

Зараз light hero — бліда пастель `bg-hero-emerald` (`#ecfdf5→#a7f3d0`) з темним текстом.

1. Light hero переходить на `--hero-grad-{module}` (135deg): finyk `#047857→#10b981`,
   fizruk `#0e7490→#14b8a6`, routine `#c23a3a→#ff8c78`, nutrition `#567c0f→#b0e636`.
   Текст на hero — `#fdf9f3` (eyebrow — `rgba(253,249,243,0.75)`).
2. «Glow» у light = м'яка кольорова тінь вниз `0 8px 20px accent/22%`, не сяйво.
3. **УВАГА — найбільший пункт:** темний текст → світлий зачіпає контент усередині
   hero-карток. Пройтись по всіх консюмерах `prominence="hero"` (16 файлів на
   main) — вкладені елементи мають перейти на light-ink. Можна site-by-site.

### §4 · Mesh (light): warm-глоу → §5-палітра (PR D)

**Файл:** `theme.css` · `:root` `--bg-mesh-1..3`.

`--bg-mesh-1: rgba(16,185,129,0.14)` · `--bg-mesh-2: rgba(14,116,144,0.09)` ·
`--bg-mesh-3: rgba(249,112,102,0.10)` — tier-500/700 на кремі, дзеркало
dark-структури. Alpha нижчі за поточні (0.20/0.22/0.28) — light mesh має бути тихішим.

### §5 · Toast: гібрид — семантика лишається (PR D)

**Файл:** `apps/web/src/shared/components/ui/Toast.tsx` (зараз повна заливка
`bg-primary text-bg` / saturated).

- База `surface-hi` (`#17231d` dark / `#faf7f0` light) + бордер line 8%.
- Смужка 3px зліва + іконка + Undo-акція — **семантичний** колір (success
  `#34d399`, error `#f87171`; light — strong-tier).
- Текст — ink (`#e7f0ea`). Error додатково тримає бордер `red/35` по периметру.
- Кольорове кодування зчитується зі смужки+іконки, повна заливка не потрібна.

### §6 · Segmented: активний = інвертований (PR D)

**Файл:** `apps/web/src/shared/components/ui/Segmented.tsx` (зараз solid active =
`bg-{c}-strong text-white`).

Dark: активний сегмент — `bg-ink` (`#e7f0ea`) + текст `#0d1512` (fg-як-фон).
Light: інверсія — `#17201b` + світлий текст. Реалізація через `bg-ink text-bg`
(токени вже theme-aware) — зміна дешева.

### §7 · Primary у хабі (dark): emerald-заливка (PR D)

**Файл:** `apps/web/src/shared/components/ui/Button.tsx` (зараз primary =
`bg-brand-strong text-white`).

`variant="primary"` отримує `dark:bg-brand-400 dark:text-bg dark:shadow-glow-accent-emerald`
— ідентично module-кнопкам з #237. `primary-ink` лишається для контекстів без
модуля (auth, settings, legal). Light без змін.

## Поверхня змін

Owner-скіл: `sergeant-web-ui`.

| PR    | Пункти                                                   | Файли                                                   | Розмір                                                 |
| ----- | -------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| **A** | §1 module-bg → ink mesh                                  | `apps/web/src/styles/background.css`                    | S — CSS-фікс, найбільший ефект                         |
| **B** | §2 hero-ink градієнти (dark)                             | `theme.css`, `tailwind-preset.js`, `Card.tsx`           | S–M — токени + 4 рядки Card, API без змін              |
| **C** | §3 light hero §5-якір                                    | `theme.css`, `Card.tsx` + 16 hero-консюмерів            | L — контент усередині hero → light-ink, можна поетапно |
| **D** | §4 light mesh + §5 Toast + §6 Segmented + §7 hub primary | `theme.css`, `Toast.tsx`, `Segmented.tsx`, `Button.tsx` | M — 4 дрібні, одним PR                                 |

## Поза скоупом

- `-soft`-токени (лишаються для soft-кнопок/бейджів) — явно з §2.
- Light-дефолт/темна-дефолт — без змін (рішення власника з базової спеки).
- Мобільний застосунок, marketing/landing.

## Верифікація (обовʼязково)

1. **Гейти:** `pnpm --filter @sergeant/design-tokens test` (contrast/preset) +
   `pnpm --filter @sergeant/web typecheck && pnpm --filter @sergeant/web test`
   (ephemeral worktree → спершу `pnpm install --frozen-lockfile`).
   Оновити снапшоти/тести Card, Toast, Segmented, Button, що асертять старі класи.
2. **Click-through (dev-server, dark):** модульні екрани (Фінік/Фізрук/Рутина/
   Харчування) — фон ink `#0d1512` + 3 глоу, як у хабі, без dots; hero — тиха
   тонована поверхня з accent-бордером; Toast — surface-hi зі смужкою; Segmented —
   інвертований актив; primary у хабі — emerald-400 + ink + glow.
3. **Click-through (light):** hero — насичений §5-якір зі світлим текстом
   (перевірити всі 16 hero-консюмерів на читабельність вкладеного контенту);
   mesh тихіший.
4. **A11y:** контраст тексту на нових hero-поверхнях (dark ink-градієнти —
   fg 14+:1; light `#fdf9f3` на strong-градієнтах — AA); ESLint design-rules
   (#8/#9/#11/#13/#14) зелені.
5. **Фінал (з фікс-спеки):** після A–D — скріншоти обох тем з Vercel preview →
   звіряння з еталонами `chornylo-assets/napryamy-vizualu.dc.html` (екрани 5a–5f).

## Інструкція для виконавчої сесії

Промпт для чистої сесії: «Реалізуй фікси "Чорнило" v3.1 за спекою
`docs/90-work/planning/archive/specs/chornylo-post-merge-fixes.md` — вона самодостатня».

**Порядок і групування (не змінювати):**

1. **PR A** — §1 module-bg → ink mesh. Почни з нього: маленький CSS-фікс,
   найбільший візуальний ефект. Спершу спробуй варіант «module shells →
   `.bg-mesh`» (один фоновий компонент); якщо на iOS Capacitor конфліктить
   `background-attachment: fixed` — fallback: замінити `--bg-gradient` у `.dark`
   на mesh-еквівалент (еталон у §1).
2. **PR B** — §2 hero-ink градієнти (dark). Токени в `theme.css` +
   `tailwind-preset.js`, потім 4 заміни класів у `Card.tsx`. API не чіпати.
3. **PR C** — §3 light hero. НАЙБІЛЬШИЙ: спершу токени+Card, потім
   `grep -rl 'prominence="hero"' apps/web/src` і пройди КОЖЕН консюмер
   (16 на момент спеки) — вкладений контент на light-ink. Скріншот кожного
   екрана в light перед «готово». Можна поетапно (кілька PR).
4. **PR D** — §4 light mesh + §5 Toast + §6 Segmented + §7 hub primary —
   дрібні, одним PR. Оновлюй тести/снапшоти РАЗОМ зі зміною класів
   (Segmented/Button/Toast мають тести на старі `-strong text-white`).

**Зафіксовані рішення — не переобговорювати:** гібрид Toast (семантична смужка,
не module-акцент, не повна заливка); `-soft`-токени не чіпати; `primary-ink`
лишається для auth/settings/legal; light-дефолт без змін.

**Обмеження середовища:**

- Ephemeral worktree без node_modules → спершу `pnpm install --frozen-lockfile`
  (+ `pnpm --filter @sergeant/db-schema build` за потреби).
- Husky-хуки НЕ скіпати (`--no-verify` заборонено). Гілка від свіжого
  `origin/main`. Heavy node-команди — строго послідовно (Windows OOM).
- Commit scope: `web` (PR A/C/D), `web` або `design-tokens` за домінантною
  зміною (PR B). PR body строго по `.github/PULL_REQUEST_TEMPLATE.md`.

**Доказ готовності кожного PR (Iron Law — без свіжих доказів не «done»):**
гейти з § Верифікація п.1 + скріншоти dark/light відповідних екранів; для PR C —
скріншот кожного hero-консюмера в light.

## Ризики та відкриті питання

- **§3 — найбільший ризик:** інверсія тексту в hero зачіпає 16 консюмерів;
  пропустити один = темний текст на темному градієнті. Mitigation: grep
  `prominence="hero"` + скріншот кожного екрана в light.
- **Rule #9 (`-strong` companion):** light hero-градієнти — saturated fills за
  світлим текстом; переконатись, що ESLint-правило задоволене (текст `#fdf9f3`,
  не `text-white` — перевірити, чи правило тригериться).
- **§6/§7 — тести на старі класи:** Segmented/Button мають снапшоти й a11y-тести
  на `-strong text-white`; оновити разом зі зміною, не підганяти постфактум.
- **§1 варіант вибору:** «замінити --bg-gradient» vs «module shells → .bg-mesh».
  Дизайн рекомендує друге (один фоновий компонент); якщо `.bg-mesh` на модулях
  створює конфлікт із `background-attachment: fixed` на iOS Capacitor — лишити
  var-заміну як fallback (детектор `data-ios-capacitor` вже існує).
