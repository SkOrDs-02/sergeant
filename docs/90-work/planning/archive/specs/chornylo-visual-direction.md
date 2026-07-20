# SPEC: «Чорнило» — dark-first візуальний напрям для apps/web

> **Last touched:** 2026-07-20 by @cursoragent. **Next review:** ніколи (read-only архів).
> **Status:** Archived (read-only). Fast-forward archived 2026-07-20 (90-day gate skipped за рішенням founder-а). Source: `docs/90-work/planning/specs/chornylo-visual-direction.md`. Purpose: кроки 1–7 «Чорнило» змерджені (#235/#237); токени/theme.css/Card hero-ink у main.

<!-- Джерело: Claude Design проєкт «Оцінка дизайну Сержанта»
     (claude.ai/design/p/533ee825-ad53-40fc-80ec-21c74dcbf183), файли
     «Чорнило - система.dc.html» (design spec v3) + «Напрями візуалу.dc.html»
     (Хід 5 — 6 екранів на реальній структурі apps/web). Візуальний референс
     екранів збережено поруч: chornylo-assets/napryamy-vizualu.dc.html.
     Ця спека самодостатня: усі значення токенів вкладено нижче. -->

## Проблема

Поточна візуальна мова apps/web (v2, «glass/mesh», тепла кремова база) виглядає
м'яко й узагальнено — модулі не мають вираженого характеру, темна тема — вторинна
похідна світлої. Дизайн-напрям **«Чорнило»** дає dark-first систему з єдиною
глибокою поверхнею-«чорнилом» і люмінесцентним помодульним акцентом: продукт стає
впізнаваним і «преміальним» без візуального шуму (прибирає blur/скло на мобільних —
дешевше по перфу).

## Мета

`.theme-dark` рендериться як «Чорнило» (глибока зеленувато-чорна база, суцільні
surface, 3-глоу mesh, люмінесцентні tier-400 акценти), при цьому **API компонентів
не змінюється** — існуючі екрани (Hub, Фінік, Фізрук, Рутина, Харчування)
перефарбовуються через токени, без переписування. Світла тема лишається дефолтом і
паритетною парою (той самий скелет, strong-акценти, тінь замість сяйва).

## Рішення дизайну

Прийняті рішення (частина — з інтервʼю власника 2026-07-10, частина — з handoff §6):

- **Світла тема лишається дефолтом; «Чорнило» = opt-in `.dark`.** Власник обрав не
  міняти brand-first first-impression застосунку. Відкинуто «темна = default» зі
  spec §6 — це окреме продуктове рішення, не блокує токен-міграцію.
- **«Чорнило» — це нові значення наявної `.dark`, НЕ нова тема.** Жодного нового
  namespace: перезаписуємо surface/text/line у `.dark` та `.dark` v2-блоці
  `theme.css`. Відкинуто окремий `[data-theme="ink"]` — множив би matrix HC/preview.
- **Glass → суцільні surface.** `--surface-glass` / `--surface-strong-glass` /
  `--surface-soft-glass` та `backdrop-blur` deprecated → мапляться на суцільний
  `--ink-surface`. Глибину дає відтінок surface + accent-бордер + glow, не тінь-вниз.
- **Mesh 4 blur-плями → 3 radial-глоу.** Дешевше на мобільних (без blur), один шар
  лише на page-bg, ніколи на картках.
- **Помодульний акцент — єдиний люмінесцентний tone (~tier-400).** Модуль несе лише
  акцент на спільній поверхні; текст поверх акценту — завжди ink `#0d1512`, не білий.
- **Числа/гроші/метрики — JetBrains Mono 700 tabular-nums**, ніколи Manrope.
- **Фіксуємо-і-плануємо (ця сесія).** Коду не чіпаємо; імплементація — у чистій
  сесії/worktree, покроково (нижче), кожен крок — окремий PR зі своїм гейтом.

## Токени «Чорнило» (canonical — джерело для packages/design-tokens)

### 1 · Кольори

**Поверхні (dark):**

| Токен               | Значення      | Роль                     |
| ------------------- | ------------- | ------------------------ |
| `--ink-bg`          | `#0d1512`     | page background          |
| `--ink-surface`     | `#121c17`     | картки, рядки, nav, поля |
| `--ink-surface-hi`  | `#17231d`     | hover / input bg         |
| `--ink-line`        | `white / 6%`  | хайрлайн                 |
| `--ink-line-strong` | `white / 12%` | помітний дільник         |

**Текст (dark):** `--ink-fg-strong` `#f2f6f2` · `--ink-fg` `#e7f0ea` · `--ink-muted`
`#8a968e` (AA 5.6:1) · `--ink-subtle` `#5f6b64` (лише labels ≥12px). fg на bg = 14.9:1.

**Модульні акценти (люмінесцентні, tier-400):**

| CSS           | Hex       | Tailwind    | Модуль     |
| ------------- | --------- | ----------- | ---------- |
| `--finyk`     | `#34d399` | emerald-400 | Фінік      |
| `--fizruk`    | `#22d3ee` | cyan-400    | Фізрук     |
| `--routine`   | `#ff8c78` | coral-400   | Рутина     |
| `--nutrition` | `#b0e636` | lime-400    | Харчування |

Похідні на кожен акцент: `{accent}/10%` — tinted fill; `{accent}/25%` — border;
`glow = 0 0 12–28px {accent}/35–50%`. Текст поверх акценту — завжди `#0d1512`.

> Ці hex вже існують у `packages/design-tokens/tokens.js` як
> `brandColors.{emerald,cyan,coral,lime}[400]` — акценти не треба вигадувати,
> лише піднести їх у dark-tier ролі.

**Mesh (dark, фірмовий шар):** 3 radial-глоу на `#0d1512` — emerald 12% зверху-праворуч,
cyan 8% ліворуч, coral 8% знизу. Onboarding: інтенсивність ×2.

### 2 · Типографіка

Manrope (текст) + JetBrains Mono (числа). Display 40/800 · Headline 28/800 ·
Title 18/800 · Body 14/700 · Secondary 13/500 muted · Eyebrow 12/700 caps+accent ·
Числа — Mono 700 tnum (може мати glow `text-shadow 0 0 12px accent/40%`).

### 3 · Форма

Радіуси: `r-lg 16` (рядки, kpi) · `r-xl 18–20` (картки вибору) · `r-2xl 22`
(hero, bottom-nav) · `r-sheet 28` (верх bottom-sheet) · `r-full` (кнопки, pills, FAB).
**Глибина — glow, не тінь-вниз:** ієрархія = surface-відтінок → accent-бордер 25% +
inset-glow 40px/8% → glow активних 24–28px/35%. Спейсинг 4px-грід; поля екрана 24px;
gap списків 8–10px.

### 4 · Компоненти

- **Кнопки:** Primary = акцент контекстного модуля (у хабі emerald), ink-текст,
  h48–52, вага 800, glow 24px/35%. Secondary = line-бордер. Ghost = accent-текст.
  Danger = `#f87171`. Focus: ring 2px accent + offset 2px. Press: scale .97, glow ×.6.
- **Поля:** default surface-hi + line; focus accent-бордер + ring 15%; error `#f87171`
  - повідомлення під полем.
- **Картки, 3 prominence:** `default` (surface + line 6%) → `hero` (tinted grad +
  accent-бордер 25% + inset-glow, 1 на екран) → `selected/tinted` (accent/10% +
  accent/35% border).
- **Бейджі/чипи:** outline-бейдж = статус; текстовий AI-тег без рамки; сегмент-контрол
  активний = інвертований (fg-фон, ink-текст).
- **Прогрес/чек:** трек white/7%; заповнення = акцент + glow; чек = заливка акцентом +
  line-through тексту. Висота 4–6px.
- **Навігація:** один плаваючий pill (mx-16, mb-20) surface + line 7–9%; активний таб —
  квадратик r-12 з модульним акцентом + ink-іконка; FAB — sibling nav, акцент модуля,
  glow 24px/40%. Мін. touch-target 44px.
- **Оверлеї:** bottom-sheet surface r-28, grabber white/15%, скрим `rgba(5,10,8,.6)`,
  контент позаду opacity .4. Toast: surface-hi + accent-смужка 3px зліва, над nav,
  auto-dismiss 4s + Undo. Skeleton: shimmer white/6%→10%. Empty: іконка в tinted-колі
  accent/10%, title 18/800, 1 рядок + primary CTA.
- **Motion:** бюджети v2 (Ambient/Response/Celebrate) лишаються; glow не анімується в
  Ambient, пульс — лише Celebrate; reduced-motion → glow static.

### 5 · Світла тема (пара, для кроку 6)

Той самий скелет, інверсія: `--ink-bg` `#f2ecdf` · `--ink-surface` `#ffffff` ·
`--ink-surface-hi` `#faf7f0` · `--ink-line` `black/7%`. Текст `--ink-fg-strong`
`#0f1713` · `--ink-fg` `#17201b` · `--ink-muted` `#5c665f` · `--ink-subtle` `#98a09a`.
Акценти падають на **strong-tier** (AA): finyk `#047857` · fizruk `#0e7490` ·
routine `#c23a3a` · nutrition `#567c0f`. Деривати: tint accent/8%, border accent/30%,
«glow» = тінь-вниз `0 6–10px 16–24px accent/20–25%`. Текст на акценті `#fdf9f3`.
Hero-градієнт (135deg, напр. finyk `#047857→#10b981`) — ідентичний в обох темах, «якір»
бренду.

## Поверхня змін (маппінг на реальний код)

Порядок міграції зі spec §6, звірений з поточним кодом. Owner-скіл:
`sergeant-web-ui` (+ `sergeant-data-and-migrations` не потрібен — суто фронт/токени).

1. **`packages/design-tokens/tokens.js`** — додати `inkTheme` об'єкт (поверхні/текст
   з §1) + підтвердити tier-400 акценти (вже є у `brandColors`). Прогнати
   `packages/design-tokens/contrast.test.js` + `tokens.test.js`.
2. **`apps/web/src/styles/theme.css`** — «Чорнило» стає значеннями `.dark`:
   - Замінити у `.dark`: `--c-bg` (зараз `23 20 18` теплий) → `13 21 18` (#0d1512);
     `--c-panel` → `18 28 23` (#121c17); `--c-panel-hi` → `23 35 29` (#17231d);
     `--c-line`/`--c-border`, `--c-text`/`--c-muted`/`--c-subtle` за §1.
   - У `.dark` v2-блоці: glass-токени (`--surface-glass`, `--surface-strong-glass`,
     `--surface-soft-glass`) → суцільний `rgba(18,28,23,1)` (deprecated, back-compat
     alias). `--bg-mesh-*` → 3-глоу (крок 3).
   - **Обов'язково перевірити `html.hc.dark`** — AAA-контракт (≥7:1) не має зламатись
     на новій ink-базі; оновити overrides за потреби.
3. **`apps/web/src/shared/components/layout/MeshBackground.tsx`** + `.bg-mesh` у
   `theme.css` — 4 corner-градієнти → 3 radial-глоу (§1). Один компонент лишається.
4. **`apps/web/src/shared/components/ui/Card.tsx`** — prominence: `glass`→`default`
   (surface), `hero`→`hero` (tinted grad + accent border + inset-glow), `tinted`→
   `selected`. **API не змінюється.**
5. **`apps/web/src/shared/components/ui/ModuleBottomNav.tsx`** (+ `HubBottomNav.tsx`,
   `modules/routine/.../RoutineBottomNav.tsx`, `modules/nutrition/.../NutritionBottomNav.tsx`)
   — активний pill = модульний акцент, квадратик r-12 + ink-іконка. Оновити тести
   (`*BottomNav.test.tsx`, `ModuleBottomNav.stories.tsx`).
6. **Світла тема** — значення §5 у `:root` / `:root` v2-блоці; тінь замість glow.

## Поза скоупом v1

- **Не міняємо дефолтну тему** — світла лишається (рішення власника). Флip на dark =
  окремий продуктовий тікет + аудит усіх світлих поверхонь/скріншотів/лендінгів.
- **Не переписуємо екрани 5a–5f** — вони лише proof вигляду; компоненти вже їдять
  токени. Пер-екранний polish — після кроків 1–5, за потреби.
- **Mobile (apps/mobile) поза скоупом** — spec на `apps/web`; mobile-токени
  (`packages/design-tokens/mobile.js`) — окремий прохід.
- **Marketing/landing mockups** (`mockups/landing/*`) не чіпаємо цим напрямом.

## Верифікація (обовʼязково)

Оскільки міграція токен-рівнева, доказ = «весь застосунок у Чорнилі + гейти зелені»:

1. **Токени:** `pnpm --filter @sergeant/design-tokens test` — `contrast.test.js` +
   `tokens.test.js` + `tailwind-preset.test.js` зелені (ink-контрасти AA/AAA тримаються).
2. **Web gate:** `pnpm --filter @sergeant/web typecheck && pnpm --filter @sergeant/web test`
   (ephemeral worktree → спершу `pnpm install --frozen-lockfile` + `db-schema build`).
   ESLint design-rules (#8/#9/#11/#13/#14) зелені — жодного arbitrary-hex у className.
3. **Click-through (dev-server):** `pnpm dev:web` → toggle тему на dark → пройти Hub,
   Фінік Огляд, Фізрук Dashboard, Рутина, Харчування: фон `#0d1512`, hero-картки з
   accent-glow, nav-pill з модульним акцентом, числа — Mono. Порівняти з
   `chornylo-assets/napryamy-vizualu.dc.html` (екрани 5a–5f). Скріншот у PR.
4. **Перф:** `pnpm --filter @sergeant/web size` (mesh без blur не має роздути bundle) +
   Lighthouse LCP не гірше baseline.
5. **Нові/оновлені тести:** `*BottomNav.test.tsx` (активний акцент), Card prominence
   snapshot, будь-який contrast-case для нових ink-значень у `contrast.test.js`.

## Ризики та відкриті питання

- **HC dark AAA-контракт** (`html.hc.dark` у `theme.css`) — нова ink-база темніша за
  теплий charcoal; треба переміряти ≥7:1 для тексту/дільників. Закриває крок 2 +
  `contrast.test.js`.
- **Glass-споживачі** — grep `--surface-glass` / `backdrop-blur` / `bg-surface-glass`
  по apps/web перед deprecation; переконатись, що суцільний surface не ламає читабельність
  оверлеїв. Закриває крок 2.
- **Module-accent containment (Rule #12)** — люмінесцентні акценти мають лишатись у
  своєму module-subtree; nav-уніфікація (крок 5) не повинна протягти чужий акцент.
- **`-strong` companion (Rule #9)** — світлі strong-акценти §5 vs текст: перевірити,
  що saturated fills за `text-white`/`text-ink` мають AA-компаньйон.
- **Дефолтна тема** — якщо власник згодом захоче flip на dark: окремий спек, аудит
  усіх світлих first-impression поверхонь (Welcome, Auth, Pricing, landing, app-store
  скріншоти).
- **Хто виконує** — імплементацію робити в чистій сесії/worktree покроково (1 крок =
  1 PR), не одним махом (ризик регресій у ядрі дизайн-системи + CI-гейти).
