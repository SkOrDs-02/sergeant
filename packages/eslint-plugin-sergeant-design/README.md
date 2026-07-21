# eslint-plugin-sergeant-design

Кастомні ESLint-правила для монорепо Sergeant. Кожне правило кодифікує hard-constraint з `AGENTS.md` або guardrail дизайн-системи, щоб порушення ловилися на lint-етапі, а не в рев'ю.

## Правила

### `sergeant-design/no-eyebrow-drift`

Забороняє комбінацію `uppercase`, `tracking-*` і `text-*` в одному className-рядку. Замість цього використовуй `<SectionHeading>` (або `<Label normalCase={false}>`). Severity: **error**.

### `sergeant-design/no-ellipsis-dots`

Забороняє три послідовні ASCII-крапки (`...`) у string-літералах і JSX-тексті. Використовуй типографський еліпсис `…` (U+2026). Auto-fixable. Severity: **error**.

### `sergeant-design/no-raw-tracked-storage`

Забороняє виклики `useLocalStorage` на mobile, коли ключ зареєстровано в `SYNC_MODULES` — використовуй `useSyncedStorage`, щоб запис віддзеркалювався у cloud-sync-чергу. Severity: **error** (скоуп: `apps/mobile/**`).

### `sergeant-design/no-raw-local-storage`

Забороняє прямий доступ до `localStorage.*` (та `window.localStorage.*`) у `apps/web`. Використовуй `safeReadLS` / `safeWriteLS`, `useLocalStorageState` або `createModuleStorage`. Severity: **error** (з allowlist-ом наявних call-site-ів у `eslint.config.js`).

### `sergeant-design/ai-marker-syntax`

Перевіряє, що AI-маркер-коментарі дотримуються канонічного синтаксису (`// AI-NOTE:`, `// AI-DANGER:`, `// AI-GENERATED:`, `// AI-LEGACY:`). Ловить друкарські помилки на кшталт `AI-NOTES`, `AINOTE`, `AI_NOTE` або відсутність двокрапки. Severity: **warn**.

### `sergeant-design/valid-tailwind-opacity`

Фаятиметься на Tailwind-`<color>/<N>`-opacity-модифікатори, де `N` не зареєстрований у `theme.opacity`. Незареєстровані кроки Tailwind тихо викидає, через що `dark:` / `hover:`-override-и ламаються. Severity: **error**.

### `sergeant-design/no-hex-in-classname`

Забороняє довільні `<utility>-[#hex]`-кольори в Tailwind-className-ах (`bg-[#10b981]`, `text-[#fff]/50`, `border-[#abc]`). Сирий hex обходить токен-шар дизайн-системи — dark-mode-адаптація, WCAG-AA-`-strong`-promotion і майбутні palette-міграції перестають працювати для таких літералів. Покриває всі color-aware-утиліти (`bg-`, `text-`, `border-`, `ring-`, `fill-`, `stroke-`, `from-`, `to-`, `via-`, `shadow-`, `outline-`, `divide-`, `placeholder-`, `caret-`, `decoration-`, `accent-`) і валідує довжину hex (3 / 4 / 6 / 8 цифр). Не-hex довільні значення (`bg-[oklch(…)]`, `border-[var(--foo)]`, `bg-[rgb(…)]`) навмисне залишаються — розшир preset, якщо потрібен справді одноразовий колір. Див. [AGENTS.md правило #11](../../AGENTS.md). Severity: **error**.

```tsx
// ❌ BAD — hex обходить токен-шар
<div className="bg-[#10b981] text-[#fff]/50" />

// ✅ GOOD — семантичний токен; і `bg-`, і `text-` адаптуються per-theme
<div className="bg-success-soft text-success-strong" />
```

### `sergeant-design/no-emoji-icon`

Забороняє emoji-гліфи в `icon`-object-property та JSX `icon=`-атрибутах. Sergeant має справжній SVG Icon-каталог (`@shared/components/ui/Icon`) з module-accented гліфами — сирий emoji замість системної іконки не успадковує accent-колір і виглядає inconsistent поруч з рештою іконок (design-audit F4). Правило дивиться лише на властивість/атрибут з іменем `icon` — emoji як user-content (власний emoji звички, AI-згенерований рекомендаційний гліф) — інша історія, не в скоупі. Severity: **error** (`apps/web/**`).

```tsx
// ❌ BAD — сирий emoji замість системної іконки
<div>{icon}</div>; // icon: "🏋️"
<Row icon="🥗" />;

// ✅ GOOD — ім'я з Icon-каталогу, accent-колір адаптується per-module
<Icon name="dumbbell" className="text-fizruk" />;
<Row icon="utensils" />;
```

### `sergeant-design/no-raw-dark-palette`

Забороняє className, що парує сиру palette-light-утиліту (`bg-amber-50`, `text-coral-100`, `border-teal-200/50`, …) з `dark:`-сирим palette-override-ом (`dark:bg-amber-500/15`, `dark:text-coral-900/30`, `dark:border-teal-800/30`). Обидві половини кодують palette-знання у call-site, тож наступна palette-міграція тихо викине одну половину, а навколишній override провалиться у неправильний колір (саме баг [#814](https://github.com/Skords-01/Sergeant/pull/814)). Фікс завжди той самий: підняти (light, dark)-пару у токен-шар дизайн-системи (`bg-success-soft`, `bg-finyk-surface`, `text-brand-strong`, `border-routine-soft-border`, …), щоб preset володів swap-ом, а call-site не мав жодного `dark:`-palette-override-у.

Правило фаятиметься лише коли **обидві** половини присутні на тому самому className-значенні: голий `<utility>-<PALETTE>-<SHADE>[/<opacity>]` І `dark:<utility>-<PALETTE>-<SHADE>[/<opacity>]`, де `<utility> ∈ { bg, text, border }`, а `<PALETTE>` — одна з 24 сирих Tailwind-родин (22 дефолтні Tailwind-палітри плюс Sergeant-аліаси `brand` / `coral` — обидва є theme-inert-сирими палітрами, попри brand-style-назву; per-theme-aware-утиліти — це `bg-brand-soft`, `bg-routine-surface` тощо). `<SHADE>` — числовий step (`50`, `100`, …, `950`), тож семантичні суфікси (`brand-soft`, `brand-strong`, `routine-soft-border`) НЕ фаятимуться. Dark-side-only-«патчі» (light уже семантичний) і bare-color-glass-wash-і (`dark:bg-white/10`) лишаються навмисно. Див. [AGENTS.md правило #13](../../AGENTS.md) і [`docs/05-design/design/dark-mode-audit.md`](../../docs/05-design/design/archive/dark-mode-audit.md). Severity: **error** (скоуп: лише `apps/web/**/*.{ts,tsx,js,jsx}` — семантичні заміни залежать від `--c-{family}-soft*` CSS-variable-ів, визначених у `apps/web/src/index.css`, а NativeWind їх не споживає).

```tsx
// ❌ BAD — обидві половини — сирі `brand-*`-palette-step-и
<a className="text-brand-600 dark:text-brand-400" />

// ✅ GOOD — `text-brand-strong` — WCAG-AA-companion, `dark:text-brand`
// — насичений DEFAULT для dark-панелей.
<a className="text-brand-strong dark:text-brand" />

// ❌ BAD — спарені сирі palette-border-и на hero-картці
<Card className="border border-teal-200/50 dark:border-teal-800/30" />

// ✅ GOOD — `border-fizruk-soft-border` — theme-adaptive
<Card className="border border-fizruk-soft-border/50" />
```

### `sergeant-design/prefer-focus-visible`

Забороняє `focus:`-color / border / ring / shadow-утиліти (`focus:bg-panel`, `focus:border-brand-400`, `focus:ring-2`, `focus:ring-brand-500/45`, `focus:shadow-float`, `focus:text-text`, `focus:text-brand-strong`, …). Видимі focus-індикатори мають використовувати варіант `focus-visible:` — `focus:` спрацьовує для будь-якого focus-стану, включно з pointer-кліком, що дає миготливий колір кожного разу, коли користувач клікає кнопку чи інпут; `focus-visible:` спрацьовує лише для keyboard / assistive-tech focus. Контракт дизайн-системи Sergeant ([`docs/05-design/design/design-system.md`](../../docs/05-design/design/design-system.md)) явно вказує `focus-visible:ring-2 ring-brand-500/45 ring-offset-2 ring-offset-surface` як канонічний focus-індикатор. Правило скоуповано на color / border / ring / shadow / fill / stroke / divide / placeholder / caret / decoration / accent / outline-offset-утиліти; non-color-`text-`-хвости (розміри шрифту `text-xs`–`text-9xl`, Sergeant-токени `text-mini` / `text-dialog`, вирівнювання `text-center`, трансформація `text-uppercase`, …) навмисно вилучені, бо це не color-блимання. Variant-prefixed-токени (`lg:focus:bg-panel`, `hover:focus:text-brand-strong`, `dark:focus:border-brand-400`, `group-focus:bg-panel`, `peer-focus:ring-2`) несуть додаткову умову, яку bare-token-контракт правила не моделює, тож їх пропускають. Єдина легітимна `focus:`-утиліта — **`focus:outline-none`** (і інертні `focus:outline-hidden` / `focus:outline-transparent`) — канонічний скид user-agent-outline, який паруємо з `focus-visible:ring-*`, щоб ring дизайн-системи перебрав керування. Див. [AGENTS.md правило #14](../../AGENTS.md) і [`docs/05-design/design/dark-mode-audit.md`](../../docs/05-design/design/archive/dark-mode-audit.md). Severity: **error** (скоуп: лише `apps/web/**/*.{ts,tsx,js,jsx}` — React Native (`apps/mobile`, NativeWind) не має еквівалента псевдокласу `:focus-visible`).

```tsx
// ❌ BAD — pointer-клік по інпуту блимає brand-ring-ом
<input className="focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30" />

// ✅ GOOD — лише keyboard / assistive-tech focus малює ring
<input className="focus:outline-none focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-500/30" />

// ❌ BAD — спарені сирі `focus:`-правила дублюють `focus-visible:`
<input className="focus-visible:border-brand-400 focus:border-brand-400" />

// ✅ GOOD — `focus-visible:` підтримується кожним сучасним браузером
<input className="focus-visible:border-brand-400" />
```

### `sergeant-design/no-foreign-module-accent`

Усередині піддерев `apps/<app>/src/modules/<X>/` можуть зустрічатися лише accent-утиліти `<X>` (`bg-<X>-surface`, `text-<X>-strong`, `ring-<X>`, `bg-<X>-500/15`, …). Чотири модульні акценти Sergeant (`finyk`/emerald, `fizruk`/teal, `routine`/coral, `nutrition`/lime) навмисно близькі за насиченістю — fizruk-екран, що випадково рендерить coral-`ring-routine`, читається користувачем як «Рутина» і є дизайн-багом, а не стилістичним вибором. Cross-module-оболонки (`core/`, `shared/`, `modules/shared/`, `stories/`, тестові файли) лишаються вільні посилатися на всі чотири. Variant-prefix-и (`dark:`, `hover:`, `lg:`), shade-суфікси (`-500`, `-soft`, `-strong`) і opacity-суфікси (`/15`) обробляються прозоро. Див. [AGENTS.md правило #12](../../AGENTS.md) і [`docs/05-design/design/module-accent.md`](../../docs/05-design/design/module-accent.md). Severity: **error**.

```tsx
// apps/web/src/modules/fizruk/pages/PlanCalendar.tsx
// ❌ BAD — coral focus-ring у Fizruk-сторінці
<button className="focus-visible:ring-routine" />

// ✅ GOOD — module-consistent focus-ring
<button className="focus-visible:ring-fizruk" />
```

### `sergeant-design/no-low-contrast-text-on-fill`

Забороняє насичені brand-`bg-*`-утиліти за `text-white` — використовуй `-strong`-companion (= 700/800-step), щоб пара пройшла WCAG AA 4.5 : 1. Severity: **error**.

### `sergeant-design/no-bigint-string`

Забороняє мапінг pg `.rows` в об'єктний літерал без `Number(…)`-coercion на колонках, що виглядають як `bigint` / `int8`. `pg`-драйвер повертає їх як рядки — див. [AGENTS.md правило #1](../../AGENTS.md) і [#708](https://github.com/Skords-01/Sergeant/issues/708). Severity: **error** (скоуп: `apps/server/src/**`).

**Евристика:** коли правило знаходить виклик `.rows.map(callback)`, де callback повертає об'єктний літерал, перевіряється кожна property, чий ключ збігається зі списком `numericColumns` (або закінчується на `_id` / `_at`). Якщо значення — звичайний member-expression (`r.id`, `row.amount`) без `Number(…)`, `+expr`, `parseInt(…)`, `parseFloat(…)` чи helper-а `toNumber*`, видається попередження.

Правило навмисно віддає перевагу false-negative-ам над false-positive-ами — фаятиметься лише на канонічну форму `rows.map(r => ({ id: r.id }))`.

#### Опції

```json
{
  "sergeant-design/no-bigint-string": [
    "error",
    {
      "numericColumns": [
        "id",
        "user_id",
        "amount",
        "balance",
        "count",
        "version"
      ]
    }
  ]
}
```

| Опція            | Тип        | Default                                                                                                                                                                                                                                                         |
| ---------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `numericColumns` | `string[]` | `["id", "user_id", "account_id", "transaction_id", "workout_id", "habit_id", "recipe_id", "meal_id", "subscription_id", "budget_id", "debt_id", "asset_id", "amount", "balance", "credit_limit", "count", "version", "created_at", "updated_at", "deleted_at"]` |

Окрім точних збігів, колонки, що закінчуються на `_id` чи `_at`, завжди вважаються відповідними, незалежно від списку.

#### Приклади

```ts
// ❌ BAD — bigint протікає клієнту як string
return rows.map((r) => ({
  id: r.id,
  amount: r.amount,
}));

// ✅ GOOD — явний Number() у serializer-і
return rows.map((r) => ({
  id: Number(r.id),
  amount: Number(r.amount),
}));

// ✅ GOOD — helper toNumberOrNull
return rows.map((r) => ({
  balance: toNumberOrNull(r.balance),
}));

// ✅ GOOD — тернарка з Number-fallback-ом
return rows.map((r) => ({
  deleted_at: r.deleted_at ? Number(r.deleted_at) : null,
}));
```

### `sergeant-design/rq-keys-only-from-factory`

Забороняє inline-array-літерали для React Query-`queryKey` / `mutationKey`. Усі ключі мають надходити з централізованої factory у `queryKeys.ts` ([AGENTS.md правило #2](../../AGENTS.md)). Severity: **error** (скоуп: `apps/web/src/**`).

Правило ловить inline-`ArrayExpression` у:

- **RQ-хуках:** `useQuery`, `useMutation`, `useInfiniteQuery`, `useSuspenseQuery`, `useSuspenseInfiniteQuery`
- **QueryClient-option-методах:** `invalidateQueries`, `cancelQueries`, `removeQueries`, `fetchQuery`, `prefetchQuery`, `refetchQueries`, `resetQueries`
- **QueryClient-direct-key-методах:** `getQueryData`, `setQueryData`, `getQueriesData`, `getQueryState`, `ensureQueryData`

Сам файл factory завжди звільняється — він легітимно визначає key-масиви.

#### Опції

| Опція               | Тип      | Default                                    | Опис                                                       |
| ------------------- | -------- | ------------------------------------------ | ---------------------------------------------------------- |
| `factoryModulePath` | `string` | `apps/web/src/shared/lib/api/queryKeys.ts` | Шлях до файлу factory query-ключів (відносно кореня репо). |

#### Приклади

```ts
// ❌ BAD — inline-array-літерал дрейфує від factory
useQuery({ queryKey: ["finyk", "transactions", accountId], queryFn: fn });
queryClient.invalidateQueries({ queryKey: ["finyk"] });
queryClient.getQueryData(["finyk", "mono"]);

// ✅ GOOD — factory-key з queryKeys.ts
import { finykKeys } from "@shared/lib/api/queryKeys";
useQuery({
  queryKey: finykKeys.monoTransactionsDb(from, to, accountId),
  queryFn: fn,
});
queryClient.invalidateQueries({ queryKey: finykKeys.all });
queryClient.getQueryData(finykKeys.mono);
```

### `sergeant-design/no-anthropic-key-in-logs`

Забороняє логування Anthropic API-ключів чи секретів через `console.*`, `logger.*`, `pino.*` чи `log.*`-методи. Ловить `process.env.ANTHROPIC_API_KEY`, переданий аргументом (завжди), і secret-like-ідентифікатори (`apiKey`, `anthropicKey`, `secret`), коли файл імпортує `@anthropic-ai/sdk`. Severity: **error** (скоуп: `apps/server/src/**` і `apps/web/src/**`).

#### Детекція

- **Завжди фаятиметься:** `process.env.ANTHROPIC_API_KEY` як прямий аргумент, всередині template-літералу або в string-конкатенації.
- **Фаятиметься з Anthropic-імпортом:** ідентифікатори, що збігаються з `/apiKey/i`, `/anthropicKey/`, `/secret/i` — лише коли файл імпортує `@anthropic-ai/sdk`.
- **Не фаятиметься:** string-літерали зі згадкою «ANTHROPIC_API_KEY» (наприклад, error-повідомлення), не-logger-функції, невідомі logger-об'єкти.

#### Опції

```json
{
  "sergeant-design/no-anthropic-key-in-logs": [
    "error",
    {
      "additionalSecretIdentifiers": ["Token$", "^credential"]
    }
  ]
}
```

| Опція                         | Тип        | Default | Опис                                                         |
| ----------------------------- | ---------- | ------- | ------------------------------------------------------------ |
| `additionalSecretIdentifiers` | `string[]` | `[]`    | Додаткові regex-патерни для збігу з іменами ідентифікаторів. |

#### Приклади

```ts
// ❌ BAD — логує реальне значення API-ключа
console.log(process.env.ANTHROPIC_API_KEY);
console.log(`Key is ${process.env.ANTHROPIC_API_KEY}`);
logger.info(apiKey); // коли файл імпортує @anthropic-ai/sdk

// ✅ GOOD — безпечне логування
console.error("ANTHROPIC_API_KEY is not set");
console.log(requestId);
```

### `sergeant-design/no-console-pii`

Забороняє передавати PII / secret-shaped значення у `console.{log,error,warn,info}` (S2, audit `docs/90-work/audits/2026-05-13-security-observability-roast.md`). `@sentry/react` за замовчуванням вмикає `console`-інтеграцію, тож усе, що йде через `console.*`, осідає Sentry-breadcrumb-ом; DevTools-консоль видно під час screen-share, а PostHog/Logpipe-екстеншни теж тапляться у `console.*`. Severity: **error**. Див. також [`docs/04-governance/security/logging-redaction-policy.md`](../../docs/04-governance/security/logging-redaction-policy.md).

#### Детекція

- **Методи в скоупі:** `log`, `error`, `warn`, `info`. `console.debug` / `console.table` — поза скоупом (dev-only / без PII-форми на практиці).
- **Фаятиметься:** string- або template-літерал, чий текст матчить `/email|phone|password|token|secret|auth/i`; template-substitution із identifier-/property-ім'ям, що матчить той самий regex (`${user.email}`, `${tokenValue}`); object-літерал, чий ключ (рекурсивно, включно з вкладеними) матчить regex.
- **Не фаятиметься:** aliased `const log = console.log; log({ email })` (AST-match свідомо консервативний), computed-ключі, spread (`...obj`).

#### Приклади

```ts
// ❌ BAD
console.log({ email: user.email });
console.log(`token=${value}`);
console.error("password is wrong");
console.info("user", { user: { phone: "+380" } });

// ✅ GOOD
console.log("Hello world");
console.info("event", { eventName: "x", timestamp: 1 });
console.debug("user email: bob@example.com"); // debug поза скоупом
```

### `sergeant-design/no-strict-bypass`

Забороняє type-safety-bypass-и в продакшн-коді (PR-6.E). Ловить чотири патерни:

1. `// @ts-expect-error`-коментарі
2. `// @ts-ignore`-коментарі
3. `as any`-cast-и
4. `as unknown as X`-double-cast-и

Severity: **error** (скоуп: `apps/web/src/**` і `apps/server/src/**`). Тестові файли звільнено. Наявні порушення allowlist-овано в `eslint.config.js` — див. [`docs/90-work/tech-debt/frontend.md`](../../docs/90-work/tech-debt/frontend.md) §no-strict-bypass.

#### Опції

| Опція                          | Тип       | Default | Опис                                         |
| ------------------------------ | --------- | ------- | -------------------------------------------- |
| `forbidPatterns.tsExpectError` | `boolean` | `true`  | Фаятися на `@ts-expect-error`-коментарях.    |
| `forbidPatterns.tsIgnore`      | `boolean` | `true`  | Фаятися на `@ts-ignore`-коментарях.          |
| `forbidPatterns.asAny`         | `boolean` | `true`  | Фаятися на `as any`-cast-ах.                 |
| `forbidPatterns.asUnknownAs`   | `boolean` | `true`  | Фаятися на `as unknown as X`-double-cast-ах. |

#### Приклади

```ts
// ❌ BAD — обходить систему типів
// @ts-expect-error
const x = badCall();
// @ts-ignore
const y = badCall();
const z = value as any;
const w = window as unknown as { webkitAudioContext: typeof AudioContext };

// ✅ GOOD — коректні типи
const x: ReturnType<typeof badCall> = badCall();
const z: SpecificType = value;
const el = document.getElementById("foo") as HTMLDivElement;
```

### `sergeant-design/prefer-text-style`

Пропонує семантичні `text-style-*`-утиліти замість руками-сплетеної пари `(text-{size}, font-{weight})`. Дивись `docs/05-design/design/design-system.md § Typography`. Severity: **warn**.

### `sergeant-design/no-arbitrary-text-size`

Забороняє Tailwind arbitrary-size-літерали виду `text-[Npx]` / `text-[Nrem]` / `text-[Nem]`. Усі шрифтові розміри мають проходити через канонічну шкалу (`text-display`, `text-h1..h3`, `text-body`, `text-body-sm`, `text-caption`, `text-eyebrow`, `text-meta`, `text-micro`, `text-display-stat`, `text-display-hero`, `text-style-*`) або preset-розміри Tailwind (`text-xs..text-5xl`). Закриває vertical-rhythm-drift і регресії підпорогових (≤8px) міток. Severity: **error**. DS-примітиви (`Button`, `Input`, `Badge`, `Stat`, `SectionHeading`, `Label`, `Toast`, `Skeleton`, `Tabs`, `Segmented`, `Card`) звільнено — вони володіють raw-px-токенами.

### `sergeant-design/no-flat-shared-lib`

Блокує imports, що резолвляться у top-level flat-файл усередині `apps/web/src/shared/lib/`. Після reorg-у (PR #1479) утиліти живуть у п'яти тематичних піддиректоріях (`api/`, `storage/`, `modules/`, `adapters/`, `ui/`) — будь-який новий top-level файл re-flattens namespace і стирає grouping. Правило резолвить як `@shared/lib/<x>` (alias), так і відносні `./lib/<x>` / `../lib/<x>` / `../../shared/lib/<x>`, тож воно переживає будь-який майбутній рефактор стилів імпортів. Дозволені top-level імена: `index` (barrel), `api`, `storage`, `modules`, `adapters`, `ui` (subdirs themselves). Scope: тільки `apps/web/src/**`. Severity: **error**.

### `sergeant-design/no-hash-router-in-modules`

Канарка міграції на `react-router@7` ([initiative 0006](../../docs/90-work/initiatives/0006-frontend-routing-and-code-split.md)). Підсвічує hash-router callsite-и у `apps/web/src/modules/**`: імпорти з модулів, що містять `useHashRouter` / `useHashRoute` у шляху (включно з ре-експортом), іменовані `ImportSpecifier`-и `useHashRouter` / `useHashRoute`, прямі call-expression-и тих самих хуків і assignment-и `window.location.hash = ...` (та `location.hash = ...`). Тестові файли (`*.test.{ts,tsx}` / `*.spec.{ts,tsx}` / `__tests__/`) ігноруються — там legacy-shim навмисно мокаємо. Scope: тільки `apps/web/src/modules/**` (не `core/`, не `shared/`, не `apps/server/`). Severity: **warn** під час міграції, переходить у **error** після Phase 2 (per-domain route migration).

### `sergeant-design/no-bare-fixed-inset-modal`

Підсвічує JSX-елементи, що використовують overlay-className `fixed inset-0` (з опційним `z-*` / `pointer-events-*` сусідом), але не оголошують себе як dialog для assistive tech: на тому самому елементі немає `role="dialog"` / `role="alertdialog"` / `role="presentation"` АБО `aria-modal`. Канонічні модальні примітиви (`Modal`, `Sheet`, `ConfirmDialog`, `InputDialog`, `KeyboardShortcutsModal`, `OnboardingWizard`) інкапсулюють focus-trap + scroll-lock + a11y-атрибути всередині — вони у `options.allow`. Парсить `className`-літерали, template-літерали і аргументи `cn(...)` / `clsx(...)` / `classnames(...)` / `twMerge(...)`. Variable-resolved classNames навмисно поза скоупом. Audit: [`docs/90-work/audits/2026-05-13-web-frontend-ergonomics-roast.md`](../../docs/90-work/audits/archive/2026-05-13-web-frontend-ergonomics-roast.md) § F2. Severity: **warn** (поки відкриті legacy offender-и; partII — file fixes + axe prop-tests — окремий PR).

```tsx
// ❌ BAD — overlay без `role` / `aria-modal` на тому самому елементі
<div className="fixed inset-0 z-50 bg-black/40" />
<div className={cn("fixed inset-0", isOpen && "animate-in")} />

// ✅ GOOD — інлайн a11y або канонічний примітив
<div className="fixed inset-0 z-50" role="dialog" aria-modal="true" />
<div className="fixed inset-0" role="presentation" />
<Modal isOpen={open} onClose={close}>…</Modal>
```

### `sergeant-design/sri-on-third-party-script`

Вимагає `integrity="sha(256|384|512)-…"` **і** `crossorigin="anonymous"` на кожному cross-origin `<script src="https://…">` (а також schema-relative `//cdn…`) у HTML-shell-ах застосунків (`apps/**/index.html`). Парсить сирий HTML через `parse5`, тож працює як справжнє ESLint-правило на `.html`-файлах (через HTML-processor) і юніт-тестується подачею HTML напряму у експортовані хелпери. Локальні / відносні джерела (`src="/src/main.tsx"`, `src="./x.js"`) та inline-`<script>` (без `src`) навмисно НЕ флагуються — вони контролюються нашим Vite-build + CSP `'self'`. Закриває STRIDE-row _Tampering → CDN supply-chain_: CSP-allowlist у `apps/web/vercel.json` пропускає `*.posthog.com` / `*.sentry-cdn.com`, тож без SRI компроміс будь-якого CDN = одношаговий XSS повз CSP. Companion path-based gate — `pnpm lint:html-sri`. Audit § S3, докладніше у [`docs/04-governance/security/hardening/sri-on-third-party-scripts.md`](../../docs/04-governance/security/hardening/archive/sri-on-third-party-scripts.md). Severity: **error** (чистий на main — PostHog/Sentry йдуть через npm-bundle).

```html
<!-- ❌ BAD — сторонній CDN-скрипт без SRI -->
<script src="https://cdn.example.com/x.js"></script>

<!-- ✅ GOOD — SHA-384-відбиток + crossorigin для CORS-перевірки -->
<script
  src="https://cdn.example.com/x.js"
  integrity="sha384-<base64>"
  crossorigin="anonymous"
></script>
```

## Запуск тестів

```sh
pnpm --filter eslint-plugin-sergeant-design exec node --test
```

Або через monorepo-скрипт:

```sh
pnpm lint:plugins
```
