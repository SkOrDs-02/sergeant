# SPEC: звірка `docs/` з кодом — закрити дрейф і поставити гейт на слуг репо

> **Last touched:** 2026-09-19 by @claude. **Next review:** 2026-12-18.
> **Status:** Active
> **Agent-ready:** yes — окрім PR-2 (потребує рішення власника, позначено окремо).

<!-- Spec-shape: секції Проблема / Мета / Поза скоупом / Верифікація — гейт `pnpm lint:specs`. -->

## Проблема

Звірка `docs/` з кодом 2026-09-19 знайшла один **блокуючий** дефект і вісім
відкритих боргів. Блокуючий: репо переїхало вчетверте (`Skords-01/Sergeant` →
`SkOrDs-02/sergeant` → `zaebal-beep/Sergeant` → `klas149/Sergeant`), і
`--strict-external` у джобі `markdown-links` воркфлоу
[`docs-automation.yml`](../../../.github/workflows/docs-automation.yml) падав на
**93 мертвих посиланнях** — на кожному PR, незалежно від змісту. Це рівно той
стан «червоний завжди = вимкнений», яким `AGENTS.md § Performance budgets`
обґрунтовує свої ратчети.

Причина структурна, і саме вона робить цю спеку потрібною. Слуг репо
розмазаний по трьох незалежних місцях: зашитий `LEGACY_PR_BASE` у
[`update-pr-backlinks.mjs:77`](../../../scripts/ci/update-pr-backlinks.mjs),
зашитий `LEGACY_REPO_SLUG` у
[`generate-status.mjs:67`](../../../scripts/docs/generate-status.mjs) і поле
`repo` в кожному записі
[`pr-ledger/index.json`](../../governance/pr-ledger/index.json). Останнє —
22 записи з `zaebal-beep/sergeant`, 18 із `SkOrDs-02/sergeant`, 20 без поля.
Жодне з трьох не питає `git remote`, тож кожен переїзд тихо ламає всі
self-посилання, а помічає це лише мережевий гейт — постфактум і оптом.
У markdown-і таких згадок 1757 у п'яти різних написаннях власника.

Решта знахідок нижче — не аварія, а борг, який видно лише коли дивишся.

## Мета

1. `pnpm docs:check-links --strict-external` зелений, і лишається зеленим
   після наступного переїзду репо — бо слуг береться з одного місця, а не
   зашитий у три.
2. Кожна команда, яку док пропонує виконати, виконується без правок.
3. Кожен датований дедлайн у гейтах або дотриманий, або свідомо перенесений
   рішенням, а не мовчки простроченим.

## Уже зроблено цим PR (не переробляй)

| Що                                                                             | Де                                                                                                                                  | Доказ                                                                                                         |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Allowlist розширено на всі чотири домівки репо + голий профіль власника        | [`external-link-allowlist.json`](../../governance/governance/external-link-allowlist.json) запис #64                                | `node scripts/docs/check-markdown-links.mjs --strict-external` → `✅ All markdown links resolve` (було 93 ❌) |
| `documentation-inventory.json` регенеровано                                    | [`data/documentation-inventory.json`](./data/documentation-inventory.json)                                                          | `pnpm docs:check-inventory` → exit 0 (був exit 1)                                                             |
| Канон nutrition §2 суперечив §2а про телеметрію                                | [`nutrition.md`](../../product/modules/nutrition.md) §2                                                                             | `NUTRITION_MEAL_LOGGED` у `useNutritionLog.ts:156`                                                            |
| Канон fizruk §11 цитував видалений `FizrukApp.tsx`                             | [`fizruk.md`](../../product/modules/fizruk.md) §11                                                                                  | каталог тепер `shell/fizrukRoute.ts:15-25` (`FIZRUK_PAGES`, 9 id)                                             |
| Канон routine §11 описував `RoutineTabPlaceholder.tsx` як «мертвий, але існує» | [`routine.md`](../../product/modules/routine.md) §11                                                                                | `find apps -iname "*RoutineTabPlaceholder*"` порожній                                                         |
| `AGENTS.md` посилався на неіснуючий workflow `Bundle size guard`               | [`AGENTS.md`](../../../AGENTS.md) § Performance budgets                                                                             | гейт живе джобою `bundle-budgets` у `ci.yml:359`                                                              |
| Чотири невиконувані команди в живих доках                                      | `apps/web/AGENTS.md:106`, `eslint-plugin-sergeant-design/README.md:33`, `tech-debt/backend.md:49`, `ai-eval-coverage-v3.md:112,142` | всі тепер із `--filter` або реальною назвою скрипта                                                           |

## Рішення дизайну

- **Слуг репо — один резолвер, джерело `git remote`, а не мережа.** Гейт
  звіряє написане в доках із фактичним `origin`, тому працює офлайн і ловить
  дрейф у момент коміту, а не через тиждень червоним CI. Відкинуто: лишити
  мережеву перевірку єдиним сторожем — вона за визначенням не бачить приватне
  репо (звірка 2026-09-19: анонімний HEAD дає 404 на **всі чотири** домівки,
  тож self-посилання не перевіряються ззовні в принципі).
- **Історичні посилання НЕ переписуємо.** PR-нумерація кожного дому своя,
  тож заміна власника не оживляє сторінку, а створює брехливе посилання.
  Переписуємо тільки записи леджера, чий `repo` дорівнює поточному дому.
- **Allowlist розширено, а не гейт послаблено.** Запис #64 несе причину, яка
  чесно каже, що саме цей гейт більше НЕ стереже self-backlink-и — цю роботу
  перебирає `lint:repo-slug`. Без такої передачі розширення allowlist-у було б
  тихою втратою покриття.

## Поверхня змін

- `scripts/docs/repo-identity.mjs` — новий; резолвер слуга (PR-1).
- `scripts/check-repo-slug.mjs` — новий; гейт (PR-1).
- [`scripts/ci/update-pr-backlinks.mjs`](../../../scripts/ci/update-pr-backlinks.mjs), [`scripts/docs/generate-status.mjs`](../../../scripts/docs/generate-status.mjs) — споживають резолвер замість зашитих констант (PR-1).
- [`package.json`](../../../package.json) — `lint:repo-slug` у ланцюжок `pnpm lint` (через `node …`, не `pnpm …` — `AGENTS.md § Verification before PR`).
- `docs/start/instructions/*.md` — 11 плейбуків без `**Trigger:**` (PR-7).
- Owner-скіл за routing-таблицею `AGENTS.md`: **`sergeant-tech-debt`**
  (`tools/**`, `scripts/**`, ops tooling). Для PR-6 — `sergeant-module-nutrition`.

## Готові до виконання задачі

Кожна — окремий PR (різні класи боргу не змішуємо, `sergeant-tech-debt`
§ «Separate PRs»). Порядок — за спаданням цінності.

### PR-1 — `lint:repo-slug`: один слуг, звірений з `git remote` · ✅ ЗРОБЛЕНО 2026-09-19

**Чому.** Чотири переїзди, три незалежні зашиті константи, 1757 згадок у
п'яти написаннях. Наступний переїзд повторив би аварію 1-в-1.

Що приземлилось:

- [`scripts/docs/repo-identity.mjs`](../../../scripts/docs/repo-identity.mjs) —
  резолвер: `GITHUB_REPOSITORY` → `git remote get-url origin` → `current` із
  реєстру. Плюс `knownSlugs()`, `prBaseForEntry()`, `slugForEntry()`.
- [`docs/governance/governance/repo-identity.json`](../../governance/governance/repo-identity.json) —
  реєстр домівок (`current` + `previous` + `legacyPrSlug`).
- [`scripts/check-repo-slug.mjs`](../../../scripts/check-repo-slug.mjs) — гейт
  із двома перевірками: реєстр проти живого `origin`, і кожне markdown-посилання
  на власне репо проти реєстру. Чужі репо не чіпає.
- [`scripts/__tests__/check-repo-slug.test.mjs`](../../../scripts/__tests__/check-repo-slug.test.mjs) — 20 тестів.
- Обидва споживачі (`update-pr-backlinks.mjs`, `generate-status.mjs`) тепер
  беруть слуг з резолвера; зашитих копій не лишилось.
- `lint:repo-slug` у `&&`-ланцюжку `pnpm lint` поруч із `check-canonical-hosts`
  (той самий клас — ідентичність проєкту), через `node …`, не `pnpm …`.

**Відхилення від початкового плану, обидва на краще.** По-перше, резолвер не
писався з нуля: робочий `currentRepoSlug()` уже жив в `update-pr-backlinks.mjs`
— його винесено й розширено, а не продубльовано втретє. По-друге, порівняння
слугів зроблено **регістронезалежним**: доки пишуть і `SkOrDs-02/sergeant`, і
`SkOrDs-02/Sergeant`, а GitHub регістр власника не розрізняє — реєстр на
кожне написання був би тим самим дублюванням, від якого ця задача й лікує.

**Перша знахідка гейта — власний текст цієї спеки.** Приклад
«вставити посилання на неіснуючого власника» з § Верифікація був цілим URL,
і скан `.md` його, звісно, знайшов. URL розбито на частини. Урок ширший за
випадок: гейт, що сканує всі доки, сканує й доку, яка його описує.

**Чого гейт свідомо не робить:** не вимагає переписати історичні посилання.
Це підтвердилось фактом того ж дня — перший PR у `klas149` отримав номер
**18**, тоді як у `zaebal-beep` номери йшли до 100. Нумерація нового дому
починається спочатку, тож заміна власника дала б брехливе посилання замість
мертвого. Відкрите питання «чи збереглися номери» з § Ризики — закрите: ні.

**Доказ:**

```
pnpm lint:repo-slug   → ✅ 4 відомих домівок, origin → klas149/Sergeant; 20/20 тестів
pnpm docs:check-status, docs:check-pr-ledger, docs:check-links, lint:governance-sync → OK
```

### PR-2 — один хендл maintainer-а · **needs-decision**

Доки називають власника трьома хендлами: `@SkOrDs-02` (таблиця власності
`AGENTS.md § Module ownership map` + фікстура
`scripts/__tests__/check-governance-sync.test.mjs:101`), `@zaebal-beep`
(заголовки 20+ воркфлоу і
[`vulnerability-sla.md:38`](../../governance/security/vulnerability-sla.md)),
`@Skords-01` (хук-хедери `scripts/claude-hooks/*.mjs`). Поточний `origin` —
`klas149`. **Який хендл чинний — рішення власника; агент не вгадує.** Після
відповіді: один `sed`-прохід + рядок у `repo-identity.json`.

### PR-3 — Hard Rule #10: burn-down спливає за 11 днів · Agent-ready

`node scripts/docs/check-lifecycle-markers.mjs` → покриття **40.9 %**
(556 із 1361 файлів `apps/web/src/**`), заявлений burn-down target —
**2026-Q3**, тобто 2026-09-30. Гейт non-blocking саме «на час burn-down».
Варіанти, обидва дають чесний стан: (а) добити маркери механічно —
805 файлів, більшість `@status Active`, `DesignShowcase/**` окремо як
`@scaffolded`; (б) свідомо перенести дату рішенням і записати перенос у
`rules/10-lifecycle-markers.md` та `check-lifecycle-markers.mjs:30,136`.
Чого не робити — лишити прострочену дату висіти.

### PR-4 — ратчет `lint:dead-doc-links` униз · Agent-ready

`node scripts/check-dead-doc-links.mjs` → «274 унікальних, мертвих 111 у
**255** згадках (бюджет **255**)». Вибрано 100 % бюджету: гейт пропустить
будь-яке нове мертве посилання рівно один раз і далі червонітиме завжди.
Полагодити найгучніші (доки, на які код шле читача з коментарів) і опустити
бюджет до факту мінус запас.

### PR-5 — `AI-LEGACY` без issue-посилань · Agent-ready

`pnpm lint:ai-legacy` → 9 маркерів, **9 без `#NNN`**: `auth.ts:483,587`,
`auth/accessGate.ts:7`, `env/env.ts:186` (рубильник закритої бети, expires
2026-11-30), `packages/shared/src/utils/date.ts:24` + `.test.ts:59`
(2026-11-07), три `scripts/{billing,telegram}/*.mjs` (2026-10-31). Без
issue-посилання маркер не має власника: коли дата спливе, нікому не прилетить.

### PR-6 — nutrition: беклог-пункт про телеметрію · Agent-ready

§2 канону виправлено цим PR, але беклог-пункт №8 і рядок «нуль подій» у
[`product-knowledge-nutrition.md`](./audits/product-knowledge-nutrition.md)
(питання B1/B3, severity «критично») усе ще описують стан до
`NUTRITION_MEAL_LOGGED`. Переписати знахідку на фактичну: дані є, відкритий
**критерій успіху**. Не чіпати `[ІНТЕРВ'Ю]`-секції.

### PR-7 — 11 плейбуків невидимі для роутингу · Agent-ready

`node scripts/docs/generate-playbook-index.mjs --check` мовчки пропускає
плейбуки без рядка `**Trigger:**`, тож вони відсутні і в
[`INDEX.md`](../../start/instructions/INDEX.md), і в
[`playbook-catalog.md`](../../start/instructions/playbook-catalog.md), а
3-way sync звітує «OK — 59 playbooks» при 74 файлах у теці. Серед невидимих —
операційні рунбуки: `operations-runbook.md`, `database-backup-restore.md`,
`encryption-key-rotation.md`, `security-events.md`,
`database-connection-pooling.md`, `postgres-read-replica.md`,
`db-index-audit-template.md`, `billing-payments-launch.md`,
`sync-client-e2e.md`, `modify-n8n-workflow.md`,
`rotate-openclaw-credentials.md`. Додати `**Trigger:**` кожному (для двох
retired — або тригер, або явне виключення зі списку), і перевести `[WARN]` у
`FAIL`: попередження, яке ніхто не читає, дорівнює його відсутності.

### PR-8 — 116 висячих посилань на файли · Agent-ready

`pnpm lint:governance-sync` Check 3 → 116 із 1927 конкретних посилань на
файли в aspirational-доках вказують на неіснуючі шляхи. Гейт свідомо
non-fatal (це плани, не поточний стан), але серед них є й просто застарілі:
`apps/web/tailwind-preset.js` (переїхав у `packages/design-tokens/`),
`apps/web/src/modules/nutrition/pages/NutritionDashboard.tsx`,
`apps/web/public/sw.js`. Розділити «плановане» і «переїхало», друге полагодити.

### PR-9 — `docs:check-inventory` не може бути зеленим за побудовою · Agent-ready

[`generate-documentation-inventory.mjs:199`](../../../scripts/docs/generate-documentation-inventory.mjs)
пише в артефакт `baseline_revision: SHA`, де `SHA` — `git rev-parse HEAD` на
момент генерації, а `--check` (рядок 212) вимагає **побайтової** рівності.
Тобто щойно згенерований файл потрапляє в коміт — HEAD змінюється, і артефакт
миттєво «застарілий». Зійтися він не може ніколи, і `--amend` цього не лікує.

Друга половина: гейт **нікуди не підключений** — `docs:check-inventory` немає
ні в `&&`-ланцюжку `pnpm lint`, ні в жодному воркфлоу, ні в
`pre-commit-derived-artifacts.mjs`. Саме тому файл і був простроченим на
початок цієї звірки: єдиний його сторож — людина, яка згадає запустити.

Лікування: прибрати `baseline_revision` із порівнюваної частини (лишити як
інформаційне поле поза `--check`, або писати SHA **попереднього** коміту, що
торкався `docs/`), а вже тоді підключити гейт у ланцюжок `pnpm lint`. Підключати
раніше означає зробити `pnpm lint` завжди червоним.

## Поза скоупом

- **Масове переписування 1757 markdown-посилань на новий слуг.** PR-нумерація
  кожного дому своя; заміна власника дає брехливе посилання замість мертвого.
  Повертатись — тільки якщо власник підтвердить, що номери збереглися.
- **Робити мережеву перевірку self-посилань знову блокуючою.** Поки репо
  приватне, анонімний HEAD не відрізнить «немає» від «не видно».
- **Продуктові канони finyk і hub-coach.** Звірка 2026-09-19 (агенти
  `canon-drift-auditor`) розбіжностей не знайшла, включно з числовими
  константами (78 тулів, TOOL_RISK 5+6, квота 5/добу, ротація 12/8 тижнів).
- Знахідки, які канони вже самі називають відкритим боргом
  (`weekDoneCount` у двох call-site, G1 reconciliation, ADR-0076 «Готівка на
  руках») — вони мають власні трекери.

## Верифікація

**Гейти, зелені зараз — регресія на них ламає спеку:**

```bash
node scripts/docs/check-markdown-links.mjs --strict-external   # ✅ All markdown links resolve
pnpm docs:check-inventory                                       # exit 0
pnpm lint:hard-rules-registry                                   # 17 rules in sync
pnpm lint:governance-sync                                       # Checks 1-2 green
pnpm docs:check-status && pnpm docs:check-open-work              # up to date
pnpm lint:specs                                                 # ця спека проходить shape-гейт
```

**Після PR-1:**

1. `pnpm lint:repo-slug` → exit 0 на чистому дереві.
2. Вставити в будь-який док посилання на `https://` + `github.com` +
   `/<вигаданий-власник>/Sergeant/pull/1` → гейт FAIL із назвою файла й
   рядка. Прибрати → знову зелений. (URL тут навмисно розбитий: гейт
   сканує всі `.md`, включно з цією спекою, і на цілому прикладі падав би
   на власному тексті — перша його знахідка була саме тут.)
3. `node --test scripts/__tests__/check-repo-slug.test.mjs` — три кейси
   (історичний слуг / вигаданий новий / слуг із `git remote`).
4. `pnpm docs:gen-status` на дереві з підміненим `origin` → посилання в
   `STATUS.md` ведуть на новий слуг без ручних правок.

**Після PR-7:** `pnpm docs:check-playbook-3way-sync` рапортує 70+ плейбуків
і жодного `[WARN] No **Trigger:**`.

## Ризики та відкриті питання

- **Хендл власника** (PR-2) — єдина задача, заблокована рішенням людини.
  Решта виконувана без нього.
- **`repo-identity.json` теж може застаріти.** Мітигація: `current`
  звіряється з `git remote` на кожному прогоні, розбіжність — FAIL із
  підказкою «додай попередній слуг у `previous`». Файл потрібен лише як
  фолбек там, де remote недоступний.
- **Ратчет PR-4 можна перетягнути.** Опускати бюджет треба з запасом
  (~5 %), інакше отримаємо ту саму «стелю вибрано на 100 %», яку цей PR і
  лікує.
- ~~**Чи збереглися номери PR після переїздів**~~ — **закрито 2026-09-19:
  ні.** Перший PR у `klas149` отримав номер 18, тоді як у `zaebal-beep`
  номери йшли до 100. Нумерація нового дому починається спочатку, тож масове
  переписування лишається поза скоупом остаточно: воно дало б брехливі
  посилання замість мертвих.
