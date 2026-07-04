# ADR-0073: Generic dual-write framework для 4 модульних пайплайнів

> **Last touched:** 2026-07-04 by @dimastahov16012003. **Next review:** 2026-10-02.
> **Status:** Accepted

- **Status:** Accepted
- **Date:** 2026-07-03
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/90-work/tech-debt/tech-debt-assessment-2026-07-01.md`](../../90-work/tech-debt/tech-debt-assessment-2026-07-01.md) § Група 4 — рекласифікація dualWrite/residualImport: не дублікати, а кандидат на усвідомлене архітектурне рішення
  - [`docs/04-governance/adr/0064-syncv2-modular-refactor.md`](./0064-syncv2-modular-refactor.md) — серверний прецедент: реєстр таблиць + per-module apply-функції
  - [`docs/04-governance/adr/0004-cloudsync-lww-conflict-resolution.md`](./0004-cloudsync-lww-conflict-resolution.md) — базова LWW-семантика
  - [`docs/04-governance/adr/0011-local-first-storage.md`](./0011-local-first-storage.md) — local-first контекст, у якому живе dual-write
  - [`docs/02-engineering/architecture/domain-invariants.md`](../../02-engineering/architecture/domain-invariants.md) — Kyiv time, day keys, identity
  - [`apps/web/src/shared/lib/dualWrite/core.ts`](../../../apps/web/src/shared/lib/dualWrite/core.ts) — існуючий мінімальний shared core (Stage 10, PR #070-dualwrite-refactor)

---

## Context and Problem Statement

У монорепо живуть **4 незалежні dual-write пайплайни** (finyk, fizruk, nutrition, routine), кожен — це LS/MMKV→SQLite дзеркало: `diff(prev, next)` → op-stream → adapter з ідемпотентними `ON CONFLICT` upsert-ами під LWW-guard-ом → parity-probe → телеметрія. Кожен пайплайн має web-копію (`apps/web/src/modules/<m>/lib/dualWrite/`) і mobile-копію (`apps/mobile/src/modules/<m>/lib/dualWrite/`), плюс супутній boot-time `residualImport.ts` (дренаж legacy LS-ключів зі стейл-таймстемпом `1970-01-01T00:00:00.000Z`, щоб LWW-guard завжди давав перемогу існуючим SQLite-рядкам).

Assessment 2026-07-01 (§ Група 4) верифікаційним агентом **спростував** стару гіпотезу F-004/F-005 «це дублікати»: pairwise diff копій `residualImport.ts` = 209–467 рядків на файлах 110–310 LOC (2–4× власного розміру), а dualWrite-пайплайни (1442–2170 LOC кожен за виміром assessment-у; наш повторний вимір 2026-07-03 по web-копіях без тестів: finyk 2193, fizruk 1764, nutrition 1491, routine 1491) мають **різну структуру каталогів і різну семантику** — спільним є лише архітектурний патерн: best-effort try/catch, `ON CONFLICT ... DO UPDATE ... WHERE excluded.updated_at > <table>.updated_at`, soft-delete з `updated_at < ?`. Отже «вилучення у спільний фреймворк» — це **побудова generic-фреймворку** (архітектурне рішення), а не механічний dedup.

Додатковий факт: мінімальний shared core **вже існує** (`apps/web/src/shared/lib/dualWrite/core.ts`, 102 LOC, з тестами `core.test.ts`), але фактично мертвий як框架: його цикл `applyDualWriteOps` не використовує **жоден** адаптер; лише web-fizruk імпортує звідти типи і `toIntOrNull`/`toRealOrNull`. Кожен інший адаптер тримає локальні копії типів, дефолтного логера і apply-циклу.

Проблема, яку вирішуємо: (1) кожен новий op-kind чи 5-й модуль повторює той самий скелет; (2) інваріанти (LWW-guard `>` строго, tombstone-семантика, best-effort контракт) захищені лише конвенцією і копі-пейстом — регресію в одній копії тести інших копій не ловлять; (3) web і mobile копії одного модуля вже дрейфують (див. inventory нижче: web-fizruk транзакційний, mobile-fizruk — ні).

### Inventory: 4 пайплайни і що саме в них різне

Спільний контракт усіх чотирьох: `apply*(client, ops, {userId, clientTs, logger?}) → {applied, errored, skipped}`; той самий `SqliteMigrationClient` (`{exec, run, all}`) для sqlite-wasm (web) / expo-sqlite (mobile) / better-sqlite3 (тести); orchestrator із registration-pattern-контекстом (`getUserId` / `getMigrationClient` / `getNow`), який ніколи не reject-ить; Sentry-теги через `recordDualWriteOutcome` / `recordParityCheck` / `recordReadFallback`.

| Вісь                               | finyk                                                                                                                                                                                                                                                                                      | fizruk                                                                                                                                                                                                                                                         | nutrition                                                                                                                                                                                                                                                                                 | routine                                                                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Error policy (web)**             | best-effort per-op (try/catch на кожен op)                                                                                                                                                                                                                                                 | **атомарний батч**: `BEGIN`/`COMMIT`/`ROLLBACK`, на будь-якій помилці весь батч відкочується, `errored = ops.length`                                                                                                                                           | best-effort per-op                                                                                                                                                                                                                                                                        | best-effort per-op; промис адаптера ніколи не reject-ить                                                                                                                                |
| **Error policy (mobile)**          | best-effort                                                                                                                                                                                                                                                                                | **best-effort** (НЕ транзакційний — розходиться з web-копією!)                                                                                                                                                                                                 | best-effort                                                                                                                                                                                                                                                                               | best-effort                                                                                                                                                                             |
| **Table registry / форми таблиць** | 5 сімейств: id-таблиці (composite PK `user_id+account_id/transaction_id`, tombstone), blob-таблиці (`data_json`), per-tx мапінги (`finyk_tx_categories/splits/mono_debt_links`), time-series (`finyk_networth_history`, PK `user_id+month`, regex-валідація `YYYY-MM`), singleton prefs    | плоскі entity-таблиці; ops розбиті по файлах `ops/*.ts`, diff по файлах `diff/*.ts` (єдиний з каталожною структурою на web); mobile має **додаткові op-kinds**: `programs-set`, `plan-template-set`, `wellbeing-*`, `active-workout-set` (KV-ключ, не таблиця) | entity + **parent/child** (`nutrition_pantries` + `nutrition_pantry_items`: reconciliation через `softDeleteRemovedChildren`, `sort_order` з індексу масиву) + derived-колонка `eaten_at` (`composeEatenAt(dateKey, time)`) + singleton-и без `created_at` (`water_log`, `shopping_list`) | 8 таблиць; composite row id `buildCompletionRowId(habitId, dateKey)`; денормалізований name-cascade `habit-rename` через `LIKE '<habitId>:%'`                                           |
| **Conflict policy / LWW guard**    | upsert: `excluded.updated_at > t.updated_at`; soft-delete: `updated_at < ?`; **виняток:** per-tx мапінги — **hard `DELETE` без guard-а** (absence = "no override", by design за коментарем)                                                                                                | стандартні guard-и; web-копія додатково під атомарним батчем                                                                                                                                                                                                   | стандартні guard-и + cascade soft-delete children при видаленні parent-а                                                                                                                                                                                                                  | стандартні guard-и; `habit-rename` — guard на **множині** рядків через LIKE; `habit-upsert` зберігає `h.createdAt ?? clientTs` (інші пайплайни пишуть `clientTs` у `created_at` завжди) |
| **Side effects в adapter-і**       | немає (усі — в orchestrator-і)                                                                                                                                                                                                                                                             | немає                                                                                                                                                                                                                                                          | немає                                                                                                                                                                                                                                                                                     | **`enqueueOutboxUpsert` у sync-v2 outbox** прямо в `completion-add`/`completion-remove` (fire-and-forget, помилка ковтається)                                                           |
| **Orchestrator extras**            | найтовстіший: single-flight черга (DCRUD-007), mutation-window gate (`__open/__closeFinykSqliteMutationWindow`), cache refresh + notify після apply, off-React entry `applyFinykDualWriteOpsViaContext` + 4 fire-and-forget mirror-тригери для chat-actions, `chatBridge.ts`, `extract.ts` | стандартний                                                                                                                                                                                                                                                    | стандартний                                                                                                                                                                                                                                                                               | стандартний                                                                                                                                                                             |
| **Default logger**                 | web logger wrapper                                                                                                                                                                                                                                                                         | web: shared core types + web logger; mobile: `console.warn`                                                                                                                                                                                                    | web logger wrapper                                                                                                                                                                                                                                                                        | web logger wrapper                                                                                                                                                                      |
| **residualImport**                 | 17 LS-ключів (14 доменних + showBalance + 2 prefs-slices Stage 13), покейова збірка стану                                                                                                                                                                                                  | web 179 LOC; mobile 514 LOC (найбільший)                                                                                                                                                                                                                       | 232/318 LOC                                                                                                                                                                                                                                                                               | один ключ `hub_routine_v1`, 110/107 LOC                                                                                                                                                 |

Ключовий висновок з inventory: параметризувати треба **(1) error policy, (2) форму conflict-target-а і LWW-guard-а (включно з "guard відсутній"), (3) soft-delete vs hard-delete vs cascade, (4) реєстр таблиць/op-kinds, (5) side-effect hooks, (6) джерело `created_at`, (7) логер**. Все інше (diff-семантика, склад op-kinds, LS-ключі residualImport) — доменне і у фреймворк не входить.

## Considered Options

1. **Generic dual-write framework** — розширити існуючий `dualWrite/core` до повноцінного параметризованого фреймворку (op-loop з error-policy, SQL-білдери для повторюваних форм, orchestrator-фабрика), мігрувати пайплайни по одному з гейтом байт-ідентичності SQL.
2. **Copy-paste dedup** — механічно звести файли до спільного тексту. Спростовано assessment-ом: текстуального спільного майже немає (diff 2–4× розміру файлів), «dedup» насправді означав би написання того самого фреймворку без визнання цього рішенням.
3. **Залишити як є (do nothing)** — 4 пайплайни живуть незалежно; інваріанти охороняються тестами кожної копії.

## Decision

Обираємо **Option 1** у консервативній формі: фреймворк **параметризує механіку, не семантику**, і впроваджується поетапно з гейтом «SQL байт-ідентичний, поведінка незмінна» на кожному кроці.

### Що будуємо (sketch, не фінальні файли)

Розміщення: нейтральний до платформи пакет (робоча назва `packages/dualwrite-core`, `@sergeant/dualwrite-core`) — web `@shared/lib/dualWrite/core` **не підходить** як дім фреймворку, бо mobile не може імпортувати з `apps/web` (саме тому mobile сьогодні тримає копії). Точне ім'я/межі пакета — через `sergeant-monorepo-boundaries` (див. Open questions). Пакет без DOM/RN-залежностей: логер і `crypto.randomUUID` — ін'єктовані.

**1. Ядро: op-loop з параметризованою error policy** (узагальнення сьогоднішніх двох варіантів — best-effort циклу і fizruk-web атомарного батча):

```ts
// packages/dualwrite-core/src/apply.ts — SKETCH
export type ApplyOutcome = "applied" | "skipped";
export type ErrorPolicy = "best-effort" | "atomic-batch";

export interface ApplyDualWriteResult {
  readonly applied: number;
  readonly errored: number;
  readonly skipped: number;
}

export interface DualWriteRuntime {
  readonly userId: string;
  readonly clientTs: string; // ISO-8601; джерело — ctx.getNow(), НЕ Date.now() у ядрі
  readonly logger: DualWriteLogger;
}

export interface PipelineSpec<Op extends { readonly kind: string }> {
  readonly module: "finyk" | "fizruk" | "nutrition" | "routine";
  readonly errorPolicy: ErrorPolicy;
  /** Один handler на op-kind; exhaustiveness перевіряється типом Record. */
  readonly handlers: {
    readonly [K in Op["kind"]]: (
      client: SqliteMigrationClient,
      op: Extract<Op, { kind: K }>,
      rt: DualWriteRuntime,
    ) => Promise<ApplyOutcome>;
  };
}

export function createApplyOps<Op extends { readonly kind: string }>(
  spec: PipelineSpec<Op>,
): (
  client: SqliteMigrationClient,
  ops: readonly Op[],
  options: ApplyDualWriteOptions,
) => Promise<ApplyDualWriteResult>;
// errorPolicy === "best-effort"  → сьогоднішній try/catch-цикл (finyk/nutrition/routine + весь mobile)
// errorPolicy === "atomic-batch" → BEGIN/COMMIT/ROLLBACK, на помилці errored = ops.length (web-fizruk)
```

**2. SQL-білдери для повторюваних форм таблиць** — декларативний `TableSpec`, який фіксує conflict-target, guard і delete-семантику. Guard-и — **enum, не довільний рядок**, щоб `>` не міг «випадково» стати `>=`:

```ts
// packages/dualwrite-core/src/tableSpec.ts — SKETCH
export interface TableSpec {
  readonly table: string;
  /** ON CONFLICT(...) target. */
  readonly conflictTarget: readonly string[]; // ["id"] | ["user_id","transaction_id"] | ["user_id","month"] | ...
  /** Колонки, що оновлюються з excluded.* при конфлікті. */
  readonly updateColumns: readonly string[];
  /**
   * LWW guard:
   *  - "strictly-newer" → WHERE excluded.updated_at > <table>.updated_at (канон, ADR-0004)
   *  - "none"           → без guard-а (finyk per-tx мапінги; свідоме рішення, не дефолт)
   */
  readonly upsertGuard: "strictly-newer" | "none";
  /**
   * Delete-семантика:
   *  - "soft"  → UPDATE ... SET deleted_at=?, updated_at=? WHERE ... AND updated_at < ?
   *  - "hard"  → DELETE FROM ... WHERE <pk-match> (без guard-а — finyk мапінги)
   */
  readonly deletePolicy: "soft" | "hard";
  /** Чи має таблиця created_at і звідки він береться. */
  readonly createdAt: "clientTs" | "entity-or-clientTs" | "absent";
}

export function buildLwwUpsert(spec: TableSpec): SqlTemplate; // → { sql, bind(entity, rt) }
export function buildDelete(spec: TableSpec): SqlTemplate;
/** nutrition parent/child: children, що зникли з keepIds → soft-delete. */
export function buildReconcileChildren(spec: ChildTableSpec): SqlTemplate;
```

**3. Orchestrator-фабрика** — узагальнення 4 майже однакових `index.ts` (registration-контекст, skip-reasons, parity-probe, телеметрія), з hook-ами для finyk-специфіки:

```ts
// packages/dualwrite-core/src/orchestrator.ts — SKETCH
export interface OrchestratorSpec<State, Op extends { kind: string }> {
  readonly module: ModuleName;
  readonly diff: (prev: State, next: State) => readonly Op[]; // доменний, НЕ у фреймворку
  readonly apply: ReturnType<typeof createApplyOps<Op>>;
  readonly parityProbe?: (client, userId, next: State) => Promise<ParityReport>;
  /** finyk: refreshFinykSqliteState + notify; інші — undefined. */
  readonly afterApply?: (client, rt) => Promise<void>;
  /** finyk: "single-flight" (DCRUD-007); інші — "microtask". */
  readonly scheduling: "microtask" | "single-flight";
  readonly telemetry: DualWriteTelemetry; // ін'єкція record* — ядро не тягне Sentry
}
export function createDualWriteOrchestrator<S, Op>(
  spec,
): {
  register(ctx: DualWriteContext): () => void;
  isRegistered(): boolean;
  run(prev: S, next: S): Promise<DualWriteOutcome>;
  trigger(prev: S, next: S): void;
  applyOpsViaContext(ops: readonly Op[]): Promise<DualWriteOutcome>; // finyk chat-bridge
};
```

**4. residualImport-скелет** (мінімальний): shared константа `STALE_TIMESTAMP = "1970-01-01T00:00:00.000Z"` + функція-обгортка `drainResidual({read, diff, apply, cleanup})` із контрактом «apply впав → LS-ключі зберігаються, повертаємо `{imported:false, cleaned:false}`». Покейова збірка стану (17 finyk-ключів тощо) лишається модульною.

### Чого фреймворк НЕ робить

- НЕ генерує diff — це чиста доменна семантика.
- НЕ уніфікує error policy пайплайнів — політика лишається полем spec-а зі значенням, яке сьогодні має кожна копія.
- НЕ додає guard там, де його свідомо немає (finyk hard-DELETE).
- НЕ зливає web- і mobile-копії одного модуля в один файл на першому етапі — лише переводить обидві на спільне ядро.

## Rationale

- **Прецедент уже в репо:** ADR-0064 зробив те саме на сервері — `OP_LOG_TABLE_REGISTRY` + per-module apply-функції; клієнтський dual-write — дзеркальна задача.
- **Інваріанти стають типами:** сьогодні строгість `>` у LWW-guard-і захищена 8 текстовими копіями SQL; після фреймворку — одним `buildLwwUpsert` під прямими тестами (розширення вже наявного `core.test.ts`).
- **Дрейф уже стався** (web-fizruk транзакційний, mobile-fizruk — ні; mobile-логер — `console.warn` повз редакційну політику) — без явного spec-а такі розходження невидимі.
- **П'ятий модуль** (наступна поверхня зі стору) отримує пайплайн ціною handlers + TableSpec-ів замість ~1.5k LOC копіювання.
- Проти Option 2: доведено, що текстуального дублювання немає — «dedup» неможливий за визначенням.
- Проти Option 3: прийнятний short-term (усе зелене, Knip чистий), але кожна зміна інваріанту (напр., майбутня зміна LWW на HLC чи vector-clock) вимагатиме 8 синхронних правок без механічного гейта.

## Статус виконання (жива відмітка — оновлюй з кожним кроком)

> **Для наступної сесії/харнеса:** це єдине місце істини про прогрес. Відкрий таблицю → перший рядок зі статусом ⏳/🔍 і є твоєю наступною роботою. Перед стартом: `git pull`, і **онови відповідний рядок у тому ж PR, що закриває крок** (Hard Rule #15). Номери PR — на `github.com/Skords-01/Sergeant`. Кроки суто послідовні для одного пайплайна, але web-кроки (2–5) незалежні від mobile (6–9) — можна паралелити різні пайплайни, якщо примітиви вже в `main`.

| Крок      | Опис                                                                                         | Статус                   | PR       |
| --------- | -------------------------------------------------------------------------------------------- | ------------------------ | -------- |
| 0         | SQL-snapshot гейти (8 адаптерів: 4 web + 4 mobile)                                           | ✅ merged                | pre-#103 |
| 1         | пакет `@sergeant/dualwrite-core` (core + web re-export)                                      | ✅ merged                | #103     |
| 2         | nutrition web + примітиви `createApplyOps`/`TableSpec`/білдери                               | ✅ merged                | #107     |
| 3         | routine web (+ `alignSetColumns` вісь у `buildLwwUpsert`)                                    | ✅ merged                | #109     |
| Open Q #1 | web-fizruk `atomic-batch`→`best-effort` (**semantic**, передумова кр.4)                      | ✅ merged                | #112     |
| 4         | fizruk web (мехмиграція на білдери; після Open Q #1)                                         | 🔍 in review             | #116     |
| 5         | finyk web (5 сімейств таблиць, hard-DELETE `upsertGuard:"none"`, single-flight orchestrator) | 🔍 in review             | #116     |
| 6         | mobile finyk                                                                                 | 🔍 in review             | #116     |
| 7         | mobile nutrition                                                                             | 🔍 in review             | #116     |
| 8         | mobile routine                                                                               | 🔍 in review             | #116     |
| 9         | mobile fizruk (власні op-kinds: `active-workout-set` → KV)                                   | 🔍 in review             | #116     |
| 10        | ~~residualImport skeleton~~                                                                  | ❌ скасовано (Open Q #6) | —        |

Легенда: ✅ у `main` · 🔍 PR відкритий, чекає review/merge · ⏳ ще не почато · ❌ не робимо.

## Migration plan (pipeline-by-pipeline, з verification gate на кожному кроці)

Порядок — від найпростішого до найризиковішого; **один PR = один крок**; scope-и `shared`/`web`/`mobile` за touched surface. Спільний гейт кожного кроку: `pnpm check` зелений; `apps/web/src/shared/lib/dualWrite/core.test.ts` і всі per-module `adapter/diff/parity/integration` тести проходять **без змін у самих тестах** (тести — специфікація поведінки; правити їх у міграційному PR заборонено, крім додавання нових).

**Крок 0 — SQL-snapshot гейт (передумова, окремий PR).** Для кожного з 8 адаптерів (4 web + 4 mobile) додати snapshot-тест: прогнати фіксований op-stream через adapter із mock-`client`, зафіксувати **послідовність `(sql, params)`** як snapshot. Це і є визначення «byte-identical»: після будь-якого міграційного кроку snapshot не має змінитись на жоден байт (нормалізація whitespace заборонена — порівнюємо literal). Для op-kinds, що пишуть НЕ в SQL (mobile-fizruk `active-workout-set` → KV, див. § «НЕ абстрагуємо» п.7), `(sql, params)`-snapshot сліпий — для них додатково фіксуються виклики KV-адаптера (mock-KV, послідовність `(key, value)`), інакше Крок 0 не покриває явно дивергентний mobile-шлях. Гейт: нові snapshot-тести зелені на HEAD до початку міграції.

**Крок 1 — пакет `@sergeant/dualwrite-core`.** Перенести/розширити код `apps/web/src/shared/lib/dualWrite/core.ts` у пакет; web-шлях стає re-export-ом (Soft rule: re-export зі старого файлу, grep імпортів по монорепо). Гейт: `core.test.ts` зелений через re-export; Knip 0 нових знахідок; жоден адаптер ще не змінено.

**Крок 2 — nutrition (web).** Найпростіша повна міграція з parent/child: адаптер переходить на `createApplyOps` + `buildLwwUpsert`/`buildDelete`/`buildReconcileChildren`; TableSpec-и для 7 таблиць (для `water_log`/`shopping_list` — `createdAt: "absent"`). Гейт: SQL-snapshot з кроку 0 байт-ідентичний; `nutrition/dualWrite/__tests__/*` зелені; parity-тест `parity.test.ts` зелений.

**Крок 3 — routine (web).** Особливості: outbox-side-effect (`enqueueOutboxUpsert`) оформлюється як per-handler код, НЕ як generic hook (semantic, див. нижче); `habit-rename` LIKE-cascade — ручний handler без білдера. Гейт: snapshot байт-ідентичний **включно з порядком** `client.run` → `enqueueOutboxUpsert`; integration-тест outbox-у зелений.

**Крок 4 — fizruk (web).** Передумова (рішення Open question #1): окремий semantic-change PR вирівнює web-fizruk з `atomic-batch` на `best-effort` (у ньому оновлюються existing тести і SQL-snapshot — це зміна специфікації, не міграція). Після цього крок 4 — звичайна best-effort міграція; `errorPolicy: "atomic-batch"` лишається в API фреймворку невикористаним. Гейт: пост-вирівняльний snapshot байт-ідентичний.

**Крок 5 — finyk (web).** Найбільший: 5 сімейств таблиць, `upsertGuard: "none"` + `deletePolicy: "hard"` для per-tx мапінгів, orchestrator-фабрика з `scheduling: "single-flight"` і `afterApply` (cache refresh). Гейт: snapshot байт-ідентичний; `chatBridge.test.ts` + DCRUD-007 сценарії зелені; ручний прогін web із Sentry-тегами `dualwrite.finyk.*` (наявність тегів — smoke).

**Кроки 6–9 — mobile (finyk → nutrition → routine → fizruk).** Ті самі spec-и, але **окремі** від web (mobile-fizruk має власні op-kinds і `errorPolicy: "best-effort"` — фіксуємо as-is, НЕ «вирівнюємо» під web без окремого рішення). Гейт кожного: mobile Jest-suite зелений, mobile SQL-snapshot байт-ідентичний, `pnpm --filter @sergeant/mobile typecheck`.

**Крок 10 — скасовано** (рішення Open question #6, 2026-07-03): residualImport-и (boot-path) лишаються as-is, у scope ініціативи не входять.

Rollback-важіль: кожен крок — ізольований PR, який чіпає один пайплайн; revert одного PR повертає один пайплайн на локальну реалізацію, не зачіпаючи інші.

## Що ми свідомо НЕ абстрагуємо (semantic, not incidental)

1. **Error policy web-fizruk (атомарний батч).** ~~Було open question~~ — **вирішено 2026-07-03 (Open question #1): web-fizruk вирівнюється на best-effort** окремим semantic-change PR до кроку 4. Фреймворк зберігає `errorPolicy` як параметр API, але після вирівнювання всі 8 пайплайнів — best-effort.
2. **finyk per-tx мапінги: hard DELETE без LWW-guard-а.** Задокументовано в коді як by-design («absence is the no-override state»). Узагальнювати guard на них — зміна семантики.
3. **routine outbox-enqueue всередині adapter-а.** Це міст dual-write → sync-v2 (ADR-0065-суміжна територія), єдиний у 4 пайплайнах. Робити з нього generic `afterOp`-hook — передчасна абстракція на N=1; лишається кодом handler-а.
4. **Diff-функції повністю.** `composeEatenAt`, `buildCompletionRowId`, per-shape diff-и fizruk — доменна логіка.
5. **finyk chat-bridge і mirror-тригери** (`triggerManualExpenseSqliteMirror` тощо) — прив'язані до Hub chat-actions, не до dual-write механіки; orchestrator-фабрика лише експонує `applyOpsViaContext`, самі тригери лишаються модульними.
6. **Склад LS-ключів residualImport** (17 finyk-ключів проти 1 routine-ключа) і покейова нормалізація — законно різні.
7. **Mobile-специфічні op-kinds fizruk** (`active-workout-set` пише у KV, не в таблицю) — не таблична операція, білдери не застосовні.

## Consequences

### Positive

- LWW-інваріант (`>` строго; ADR-0004) і tombstone-семантика захищені одним кодом + прямими тестами замість 8 копій конвенції.
- П'ятий модуль/нова таблиця = handlers + TableSpec замість ~1.5–2k LOC.
- web↔mobile дрейф стає видимим: розходження — це diff двох spec-ів, а не diff 2×1500 LOC.
- Узгоджується з серверним прецедентом ADR-0064 (реєстр + per-module apply).

### Negative

- ~10 PR-ів міграції + новий пакет у графі залежностей.
- Generic-типи (`PipelineSpec`, `Extract<Op, {kind: K}>`) підвищують поріг входу проти «плоского» switch-а.
- Тимчасово два шляхи (мігровані/немігровані пайплайни) до завершення кроків 2–9.
- SQL-snapshot-тести чутливі до косметичних правок SQL — це фіча гейта, але шум для рев'ю після завершення міграції (можна послабити до нормалізованого порівняння окремим рішенням post-migration).

### Neutral

- Поведінка в рантаймі байт-ідентична за визначенням гейта; жодних змін API, схем чи міграцій БД.
- residualImport-и лишаються майже незмінними (лише shared константа + скелет, якщо крок 10 схвалено).

## Risks

1. **Топ-ризик: тиха зміна LWW-семантики одного пайплайна при зелених lint/тестах.** Приклад: білдер емить `>=` замість `>` (переможе «останній писар» замість «строго новішого» — ре-аплай того самого `clientTs` перезапише конкурентний запис), або guard «за замовчуванням» з'являється на finyk hard-DELETE, або `atomic-batch` випадково застосовано до nutrition (помилка посередині почне відкочувати вже застосовані op-и — лічильники зміняться, але юніт-тести з одним op-ом цього не побачать). _Мітигація:_ Крок 0 — SQL-snapshot-гейт **до** першої зміни; enum-guard-и замість рядків; заборона правити існуючі тести в міграційних PR; parity-probe телеметрія (`recordParityCheck`) як runtime-страховка після деплою кожного кроку.
2. **Скелет пакета «під web»** — випадкове затягування DOM/Sentry/web-логера у `dualwrite-core` зламає mobile. _Мітигація:_ усі платформні речі — ін'єкція (telemetry, logger, uuid); mobile typecheck у гейті кожного кроку.
3. **Overreach абстракції:** спокуса «заодно» вирівняти mobile-fizruk під транзакційний web-fizruk або злити web+mobile spec-и. _Мітигація:_ явний список «НЕ абстрагуємо» вище; будь-яке вирівнювання семантики — окремий ADR/PR, не міграційний.
4. **Hard Rule #18:** finyk-spec-файл може вирости >600 eff LOC — ділити по сімействах таблиць одразу (за прикладом fizruk `ops/*`).
5. **`this`-подібні незадокументовані розбіжності** (див. Open questions) можуть виявитись багами, які snapshot-гейт «заморозить» як специфікацію. _Мітигація:_ кожен Open question — рішення власника до відповідного кроку; знайдений баг фікситься **до** міграції відповідного пайплайна окремим PR-ом.

## Open questions — рішення власника (2026-07-03)

Усі 7 питань закриті рішенням власника (@Skords-01, сесія 2026-07-03):

1. **web-fizruk атомарний батч vs best-effort.** ✅ **Рішення: вирівняти web-fizruk на best-effort** (як усі інші пайплайни, включно з mobile-fizruk). Вирівнювання — **окремий semantic-change PR до кроку 4** (не міграційний: у ньому дозволено оновити existing тести і SQL-snapshot, бо міняється специфікація). Після цього `errorPolicy: "atomic-batch"` лишається в API фреймворку як параметр, але жоден пайплайн його не використовує.
2. **finyk hard-DELETE без guard-а.** ✅ **Рішення: прийняти as-is** (absence = no-override — остання воля користувача). `deletePolicy: "hard"` + `upsertGuard: "none"` фіксуються snapshot-гейтом як специфікація.
3. **Дім пакета.** ✅ **Рішення: новий `packages/dualwrite-core`.** Крок 1 розблоковано.
4. **`created_at`-семантика.** ✅ **Рішення: уніфікувати всі пайплайни** — єдина семантика `entity.createdAt ?? clientTs` (для сутностей без доменного createdAt це factually еквівалентно поточному `clientTs`, тож поведінка міняється лише там, де доменний createdAt існує і раніше ігнорувався). Параметр `createdAt: "entity-or-clientTs"` стає єдиним значенням; зміни поведінки поза routine — задокументувати в міграційному PR відповідного пайплайна.
5. **`created_at` у `nutrition_water_log`/`nutrition_shopping_list`.** ✅ **Рішення: додати колонки** окремим migration-PR (ADD COLUMN, two-phase не потрібен) **до кроку 2**; після цього `TableSpec.createdAt: "absent"` для цих таблиць знімається.
6. **Scope residualImport.** ✅ **Рішення: крок 10 скасовано** — boot-path не чіпаємо, виграш не виправдовує ризик.
7. **mobile-логер `console.warn`.** ✅ **Рішення: полагодити в межах кроків 6–9** — ін'єктований логер під час міграції mobile-fizruk (файл і так переписується).

## Compliance

- **Гейт байт-ідентичності:** SQL-snapshot-тести з кроку 0 живуть поруч з адаптерами (`*.sqlsnapshot.test.ts`), ганяються звичайним `pnpm check`; будь-який міграційний PR, що міняє snapshot, — червоний за визначенням.
- **Заборона правити тести в міграційних PR** — перевіряється на рев'ю (`sergeant-review-and-merge`); PR-body зобов'язаний містити рядок «tests untouched: yes/no + чому».
- Після завершення міграції: janitor-перевірка «нових локальних копій `applyDualWriteOps`-циклу немає» — grep-правило в entropy-janitors (`tools/entropy-janitors/`), issue-only.
- Статус цього ADR: `Accepted` 2026-07-03 — власник закрив усі 7 open questions (див. § Open questions); крок 1 розблоковано.

## Links

- Tech-debt assessment 2026-07-01 § Група 4 — рекласифікація (виміри: pairwise diff 209–467 рядків, пайплайни 1442–2170 LOC).
- Stage 10 PR #070-dualwrite-refactor — існуючий `shared/lib/dualWrite/core.ts`.
- DCRUD-007 — single-flight черга finyk-orchestrator-а (коментар у `apps/web/src/modules/finyk/lib/dualWrite/index.ts`).
- PR #057{r,f,k}-tombstone — residualImport-и зі `STALE_TIMESTAMP`-патерном.
- ADR-0004 (LWW), ADR-0011 (local-first), ADR-0064 (серверний реєстр apply-функцій), ADR-0065 (sync-v2 outbox, суміжна межа для routine side-effect-а).
