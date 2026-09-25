# Playbook: Червоний бандл-бюджет (size-limit / eager)

> **Last touched:** 2026-09-25 by @Skords-01. **Next review:** 2027-01-20.
> **Status:** Active
> **Runtime-specific:** no

**Trigger:** `pnpm --filter @sergeant/web size` або `size:eager` падає локально (CI-джоби `bundle-budgets` з 2026-09-23 немає) · зʼявилась спокуса підняти стелю в `apps/web/package.json` чи `check-eager-bundle.mjs`.

## Owner surface

- Primary surface: `apps/web` (бандл), `scripts/ci/check-eager-bundle.mjs`
- Coupled surface: `.github/workflows/ci.yml` (джоба `bundle-budgets`), `apps/web/vite.config.js`
- Governing skill: `sergeant-web-ui`
- Coupled skill: `sergeant-deploy-and-observability` (якщо правиш саму джобу)
- Обовʼязково прочитати перед кроком 5: [`AGENTS.md § Performance budgets`](../../../AGENTS.md#performance-budgets) (ліміти й уроки) і [журнал ратчетів](../../work/specs/tech-debt/bundle-budget-ratchet-log.md) з усіма замірами.

---

## Дві метрики, які плутають

| Метрика                  | Що міряє                                                                | Ліміт       | Команда                                       |
| ------------------------ | ----------------------------------------------------------------------- | ----------- | --------------------------------------------- |
| `size-limit` (JS усього) | **суму всіх** емітованих чанків `apps/server/dist/assets/*.js` (brotli) | **1.48 MB** | `pnpm --filter @sergeant/web exec size-limit` |
| `size-limit` (CSS)       | `apps/server/dist/assets/*.css` (brotli)                                | **40 kB**   | те саме                                       |
| **eager**                | лише те, що Vite вписав у `index.html` як `modulepreload`/`script src`  | **268 kB**  | `node scripts/ci/check-eager-bundle.mjs`      |

**Ці метрики рухаються від різних дій.** Lazy-split покращує досвід завантаження і НЕ рухає `size-limit` — той сумує і чанки, які більшість людей ніколи не завантажить (`vendor-zxing` — лише сканер, `NutritionApp` — лише при вході в модуль). Відчутну швидкість першого екрана корелює **eager**, і саме він ратчетнутий УНИЗ тричі (470 → 430 → 280 → 268). Тому червоний eager і червоний `size-limit` — це дві різні задачі, не одна.

---

## Steps

### 1. Зібрати й заміряти обидві метрики

```bash
pnpm --filter @sergeant/db-schema build
pnpm --filter @sergeant/web build          # без VERCEL=1 → вихід у apps/server/dist/
pnpm --filter @sergeant/web exec size-limit
node scripts/ci/check-eager-bundle.mjs     # запускати з КОРЕНЯ репо: dist резолвиться від cwd
```

`check-eager-bundle.mjs` без білда виходить із кодом `2` і каже, що збірки немає — не плутай це з провалом бюджету (`exit 1`).

### 2. Заміряти `main` ОКРЕМО — це не формальність

```bash
git stash -u && git checkout origin/main
pnpm --filter @sergeant/web build && pnpm --filter @sergeant/web exec size-limit
git checkout - && git stash pop
```

Майже щоразу в історії репо стеля виявлялась пробитою **ще до** гілки, яка це виявила: внесок гілки — сотні байтів, а на `main` запасу не лишалось (2026-08-18: внесок 296 B при перевищенні 1.4 kB; 2026-09-13: внесок 591 B при запасі 429 B). Поки ти не знаєш обох чисел, ти не знаєш, чию регресію лагодиш.

### 3. Перевірити, що перевищення не є сміттям, яке код вважає виключеним

Дешевша перевірка, ніж ратчет, і незворотність ратчету на практиці робить її обовʼязковою:

```bash
ls apps/server/dist/assets/*.js | wc -l
ls -S apps/server/dist/assets/*.js | head -12   # найважча дюжина
```

Верхня дюжина має складатись із навмисних важких фіч, кожна у власному `manualChunk`. Чужий чанк у списку = борг, а не привід підіймати стелю.

**Канонічний приклад (2026-09-01).** У прод-бандлі лежав `DesignShowcase` на 192 kB сирих, хоча `StandaloneRoutes.tsx` гейтує сторінку через `import.meta.env.DEV`. Ребро тягнув `useRoutePrefetch.ts` — **безумовним** `import()` у мапі префетчу. Після гейтування мапи факт упав 1.43 → 1.39 MB при незмінній стелі.

> **Правило:** гейт лінивості діє лише доти, доки жоден інший модуль не імпортує ту саму ціль безумовно.

### 4. Знайти важіль — заміром, а не здогадом

```bash
pnpm --filter @sergeant/web build:analyze   # ANALYZE=1 → apps/web/dist/bundle-report.html
```

`rollup-plugin-visualizer` (treemap, brotli) дає розподіл модулів усередині чанків. Він НЕ каже, які чанки eager — це окрема робота `check-eager-bundle.mjs`, звіряй два виводи.

**Скрипта, який атрибутує чанк до модулів із сорсмапи, у репо немає** — попередні розбори («53 модулі у `vendor-sqlite`, з них 52 з `drizzle-orm`», «128.4 з 147.1 kB чанку `cn` — UA-каталог») робились ad-hoc по `.map` (`build.sourcemap: "hidden"`, файли лежать поруч із чанками). Робиш такий розбір — поклади скрипт у `scripts/ci/` замість того, щоб винаходити його вчетверте.

Далі — за метрикою:

**Червоний eager.** Знайди eager-ребра з `index.html` і зніми **останнє**, а не частину (див. § Хибні діагнози). Типові джерела: статичні імпорти в `RootLayout.tsx` / провайдерах, барель-імпорт із пакета, catch-all у `manualChunks`.

**Червоний `size-limit`.** Тут lazy-split не допоможе за визначенням. Шукай або дубльований вендор, або цілий модуль, який не мав потрапити в прод (крок 3).

### 5. Тільки тепер — ратчет, і в тому ж PR

Підіймати стелю можна, коли (а) крок 3 нічого не знайшов, (б) крок 4 не дав дешевого важеля, (в) перевищення — накопичення продуктової роботи, а не новий важкий vendor.

- `size-limit` — число в `apps/web/package.json` → секція `"size-limit"`.
- eager — `DEFAULT_LIMIT_BYTES` у `scripts/ci/check-eager-bundle.mjs`.
- Запас: **1-2% над фактом** (практика всіх попередніх ратчетів). Більше — запрошення в «комфортну зону», менше — гейт червонітиме щотижня.
- У тому ж PR: рядок у таблиці `AGENTS.md § Performance budgets` + запис на початок [журналу ратчетів](../../work/specs/tech-debt/bundle-budget-ratchet-log.md) «чому підняли, а не різали» з обома замірами (`main` і гілка).
- Борг на скорочення — у [`docs/work/specs/tech-debt/frontend.md`](../../work/specs/tech-debt/frontend.md).

**Для eager дефолт протилежний: не підіймай.** Він ратчетнутий униз тричі, і щоразу важіль знаходився заміром. Підняти його — віддати назад роботу 2026-08-07 і 2026-09-12 по метриці, яку користувач відчуває.

### 6. Закріпити ранній сигнал

Гейт каже «бюджет пробито» вже після білда. Де можна — став юніт, який називає **точний файл**: [`uk.core.eagerImports.test.ts`](../../../apps/web/src/shared/i18n/uk.core.eagerImports.test.ts) падає на етапі юнітів, якщо eager-поверхня знову тягне повний UA-каталог.

Додаєш eager-поверхню — додай її відносний шлях у `EAGER_SURFACES` (список ручний: «eager» визначається графом збірки, якого в юніті немає). Такий тест — лише ранній сигнал; ФАКТ міряє тільки `check-eager-bundle.mjs`.

---

## Хибні діагнози, які вже пробували

Це найдорожча частина playbook-а: помилки тут коштували прогонів, а один фікс дав мінус.

| Діагноз                                                                | Чим виявився                                                                                                                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| «`vendor-sqlite` важкий через `kvStoreBoot.ts`, треба async-boot гейт» | Замір дав **+2.3 kB, тобто гірше**. Спробу відкотили.                                                                                                                          |
| «Вагу дають табличні визначення `@sergeant/db-schema/sqlite`»          | У чанку **нуль** модулів `db-schema` — 52 з 53 модулів це `drizzle-orm`. Табличні визначення важать ~6.5 kB і лише **мостять** граф.                                           |
| «Поділимо `db-schema` — стане легше»                                   | `manualChunks` склеює весь `drizzle-orm` в один чанк: поки лишається **бодай одне** eager-ребро, ті самі 69 kB лишаються на критичному шляху, а нові межі лише додають чанків. |
| «Динамічний `import()` уже зроблено, отже воно ліниве»                 | `posthog-js` їхав eager попри `await import()` за прапорцем: catch-all `return "vendor"` у `manualChunks` слухається Rollup-ом ПЕРШИМ. Catch-all живий — `vite.config.js:454`. |
| «Перевели всі eager-поверхні на `uk.core` — має бути зелено»           | Гейт лишався червоним: девʼятою поверхнею був `AuthContext.tsx` із **відносним** шляхом `../../shared/i18n/uk`, якого не бачив грep по `@shared/i18n`.                         |

**Три правила з цієї таблиці:**

1. Виграш дає зняття **останнього** ребра, не частини.
2. Грепаєш eager-ребра — грепай **обидві** форми шляху: аліас (`@shared/…`) і відносну (`../../shared/…`).
3. **Переміряй після кожного кроку.** Тут двічі поспіль стояв хибний діагноз, і одна «оптимізація» дала мінус.

## CI ↔ локально: розбіжність нестабільна

Для `size-limit` та сама голова дає різні числа в CI і локально — **то є, то немає**:

| Дерево     | CI      | Локально | Розбіжність |
| ---------- | ------- | -------- | ----------- |
| `a4fb7ca6` | 1376.6  | 1409.1   | 32.5 kB     |
| `dee22fa2` | 1429.75 | 1429.4   | 0.35 kB     |
| `fb5a1a2f` | 1399.7  | 1433.0   | 33.3 kB     |

Причина невідома (схоже на версію brotli/Node, бо розходження однакове на JS і CSS). Практичний наслідок: **ратчет УНИЗ для `size-limit` відкладено**, бо ліміт, зелений у CI, може бути червоним локально на тому ж коміті — а локальний прогін документований як pre-PR перевірка, і зробити його завжди червоним = повторити стан «червоний завжди = вимкнений». Стелю тримає **локальне (більше)** число.

Для eager розбіжність була 0.2 kB на тому ж заміряному дереві — тобто це проблема `size-limit`, не обох гейтів.

## Не чіпай форму джоби

З 2026-09-23 CI відсутній і ця джоба не виконується; форма важлива на випадок, якщо CI повернуть. Обидва гейти живуть у власній джобі `bundle-budgets` із власним прод-білдом — саме тому, що кроками в `check` вони мовчали тижнями (див. [`audit-ci-gates.md`](./audit-ci-gates.md)). Форму стереже [`scripts/__tests__/ci-bundle-budget-gates.test.mjs`](../../../scripts/__tests__/ci-bundle-budget-gates.test.mjs):

- обидва гейти — рівно по одному кроку, у джобі `bundle-budgets`, після кроку білда;
- у `check` їх немає;
- eager має `always()` і не залежить від зеленого `size-limit`;
- жоден не fail-open (`continue-on-error: true`, `|| true`, `if: false` — усе червонить тест).

Число ліміту цей тест не стереже — ратчет його не розбудить.

---

## Verification

- [ ] `pnpm --filter @sergeant/web build && pnpm --filter @sergeant/web exec size-limit` — зелено
- [ ] `node scripts/ci/check-eager-bundle.mjs` — зелено (запущено з кореня репо)
- [ ] Заміряно `origin/main` окремо; у PR названо внесок гілки в байтах
- [ ] Крок 3 пройдено: у найважчій дюжині немає чужого чанка
- [ ] Якщо був ратчет — число піднято в тому ж PR, `AGENTS.md § Performance budgets` і журнал ратчетів оновлено, борг записано у `frontend.md`
- [ ] `node --test scripts/__tests__/ci-bundle-budget-gates.test.mjs` — зелено (якщо чіпав `ci.yml`)
- [ ] `pnpm --filter @sergeant/web test` — зелено (якщо додавав eager-поверхню в `EAGER_SURFACES`)

## Коли НЕ використовувати цей playbook

- Червона джоба `Lighthouse CI` — це LCP/FCP/TBT, інша природа: див. [`apps/web/AGENTS.md § Lighthouse CI`](../../../apps/web/AGENTS.md).
- Червоний CI не через бандл — [`fix-failing-ci.md`](./fix-failing-ci.md).
- Гейт не впав, а **не виконався** — [`audit-ci-gates.md`](./audit-ci-gates.md).
- Додаєш важку залежність свідомо — спершу [`bump-dep-safely.md`](./bump-dep-safely.md), ратчет буде наслідком.

## See also

- [`AGENTS.md § Performance budgets`](../../../AGENTS.md#performance-budgets) - ліміти й уроки ратчетів
- [`bundle-budget-ratchet-log.md`](../../work/specs/tech-debt/bundle-budget-ratchet-log.md) - журнал усіх ратчетів із замірами
- [`audit-ci-gates.md`](./audit-ci-gates.md) — гейт, який мовчить замість того, щоб падати
- [`fix-failing-ci.md`](./fix-failing-ci.md) — загальний тріаж червоного CI
- [`cleanup-dead-code.md`](./cleanup-dead-code.md) — коли важіль виявився мертвим кодом
- [`docs/work/specs/tech-debt/frontend.md`](../../work/specs/tech-debt/frontend.md) — відкриті борги по розміру

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                              | Title                                                                                                           | Merged     |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------- |
| [#42](https://bitbucket.org/skords01/sergeant/pull-requests/42) | fix(web): фаза 0 аналітики Фініка v2: чесність чисел (Р4-Р7)                                                    | 2026-09-24 |
| [#13](https://bitbucket.org/skords01/sergeant/pull-requests/13) | docs(agents): вирівняти governance з фактом після переїзду на Bitbucket                                         | 2026-09-23 |
| [#57](https://github.com/zaebal-beep/sergeant/pull/57)          | fix(root): закрити знахідки наскрізного аудиту — валідація AI-шару, метрика конфліктів синку, браузерні дефекти | 2026-09-16 |
| [#51](https://github.com/zaebal-beep/sergeant/pull/51)          | docs(agents): пʼять нових playbook-ів під повторювані поломки і ревізія наявних                                 | 2026-09-15 |

_Auto-derived from `docs/governance/pr-ledger/index.json`. Top 4 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
