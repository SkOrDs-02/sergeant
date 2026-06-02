# Playbook: Embedding Provider Migration

> **Last validated:** 2026-06-02 by @claude. **Next review:** 2026-09-01.
> **Status:** Active

**Trigger:** «Перемкнути embedding-провайдер або модель» / «Змінити embedding vendor» / «re-embed ai_memories на нову модель» / виявлено нову embedding-модель з кращою якістю або меншою вартістю.

## Owner surface

- Primary surface: `apps/server/src/modules/ai-memory/`
- Coupled surface: `apps/server/src/env/env.ts`, `apps/server/src/migrations/`
- Governing skill: `sergeant-server-api`

---

## Контекст та архітектура

Кожен рядок `ai_memories` зберігає три колонки метаданих:

- `embedding_provider` — назва vendor-а (наприклад, `"voyage"`).
- `embedding_model` — конкретна модель (наприклад, `"voyage-3.5-lite"`).
- `embedding_version` — внутрішня semver-версія схеми (наприклад, `"1"`).

`vectorStore.query` фільтрує результати за `embedding_model = $N`, де `$N = env.VOYAGE_EMBEDDING_MODEL`. Це active-model read-filter з PR-24 (`docs/initiatives/stack-pulse-2026-05/pr-24-embedding-vendor-abstraction.md`). Він гарантує, що ANN-пошук не змішує вектори різних моделей у HNSW-просторі, що зламало б recall.

Провайдер-фабрики живуть у `embeddings.ts` (`createVoyageEmbeddingProvider`). Vendor-агностичний інтерфейс — `EmbeddingProvider` у `types.ts`.

---

## Кроки

### 1. Додати фабрику нового провайдера

Створи або доповни файл `apps/server/src/modules/ai-memory/embeddings.ts`:

```ts
// Приклад: фабрика для нового провайдера
export function createNewVendorEmbeddingProvider(): EmbeddingProvider {
  // ...аналогічно createVoyageEmbeddingProvider
}
```

Перевір, що нова фабрика:

- повертає `Float32Array[]` розмірності, яка відповідає новій `EMBEDDING_DIM`.
- заповнює `meta.provider`, `meta.model`, `meta.version`, `meta.dim`.

Оновити env vars (`apps/server/src/env/env.ts`):

- `VOYAGE_EMBEDDING_MODEL` → значення нової моделі (або окрема env var, якщо провайдер не Voyage).
- Оновити `VOYAGE_EMBEDDING_DIM` якщо змінилась розмірність.
- Задокументувати у `.env.example`.

**Важливо — розмірність HNSW-індексу.** Міграція `025_ai_memories_pgvector.sql` створює `HALFVEC(1024)`. Якщо нова модель повертає іншу розмірність (наприклад, 1536), потрібно:

1. Написати нову SQL-міграцію `ALTER COLUMN embedding TYPE HALFVEC(1536)` (або через ADD COLUMN).
2. Перебудувати HNSW-індекс (`REINDEX CONCURRENTLY` або дропнути/перестворити).
3. Перевірити за плейбуком [`add-sql-migration.md`](./add-sql-migration.md).

### 2. Увімкнути dual-write нових рядків

Перед переключенням read-filter потрібно, щоб нові пам'яті вже писались з новою моделлю. Для цього:

1. Поміняй активний `EmbeddingProvider` у DI / factory-виклику на новий.
2. Усі нові виклики `AiMemoryService.remember` будуть писати рядки з `embedding_model = '<new-model>'`.
3. Старі рядки (`voyage-3.5-lite`) залишаються — read-filter поки що їх обслуговує.

Задеплой цей крок окремо та переконайся, що нові рядки з'являються в БД із правильними полями:

```sql
SELECT embedding_model, COUNT(*) FROM ai_memories GROUP BY 1;
```

### 3. Batch re-embed — backfill старих рядків

Backfill — окремий one-off скрипт (не міграція), який:

1. Читає рядки зі старою моделлю порціями (наприклад, по 100):
   ```sql
   SELECT id, content FROM ai_memories
   WHERE embedding_model = 'voyage-3.5-lite'
     AND deleted_at IS NULL
   ORDER BY id
   LIMIT 100 OFFSET $cursor
   ```
2. Викликає новий `EmbeddingProvider.embedBatch(texts, { criticality: 'non-critical' })`.
3. Оновлює кожен рядок:
   ```sql
   UPDATE ai_memories
   SET embedding = $new_vec::halfvec,
       embedding_model = $new_model,
       embedding_provider = $new_provider,
       embedding_version = $new_version
   WHERE id = $id
   ```
4. Зберігає `cursor` (наприклад, останній `id`) для resumability — перезапуск без дублювання.

**Rate-limiting:** Voyage API має добовий soft-budget (`VOYAGE_DAILY_BUDGET_USD_SOFT`). Використовуй `criticality: 'non-critical'` та лови `VoyageSoftBudgetExceededError` — при ній зупини backfill і запусти знову наступного дня. Між батчами — `sleep(200ms)` щоб не спамити API.

**Resumability:** зберігай `cursor` у окремому рядку `key-value` таблиці або файлі стану. Скрипт при старті читає cursor і продовжує з нього.

**Перевірка прогресу:**

```sql
SELECT embedding_model, COUNT(*) FROM ai_memories GROUP BY 1 ORDER BY 2 DESC;
```

### 4. Переключити active-model read-filter

Коли backfill завершено (всі рядки переведено або їх negligible кількість):

1. Зміни `VOYAGE_EMBEDDING_MODEL` (у Railway Variables + `.env`) на нове значення нової моделі.
2. Задеплой сервер — `vectorStore.query` автоматично почне фільтрувати за новою моделлю.
3. Переконайся, що recall працює коректно (smoke-тест через `/api/ai-memory/recall` або openclaw tool).

**Rollback:** якщо якість recall деградувала, поверни `VOYAGE_EMBEDDING_MODEL` до старого значення — read-filter автоматично повернеться до старих рядків.

### 5. Drop legacy-model rows після 30-денного soaking-у

Після 30 днів стабільної роботи з новою моделлю:

1. Перевір, що всіх активних users обслуговують нові рядки:
   ```sql
   SELECT embedding_model, COUNT(DISTINCT user_id) FROM ai_memories
   WHERE deleted_at IS NULL
   GROUP BY 1;
   ```
2. Видали legacy-рядки:
   ```sql
   DELETE FROM ai_memories WHERE embedding_model = 'voyage-3.5-lite';
   ```
3. `VACUUM ANALYZE ai_memories` — повернути сторінки індексу після масового DELETE.

**Обережно:** DELETE великих обсягів без `LIMIT`-у може заблокувати таблицю на seconds. Краще порційно:

```sql
DELETE FROM ai_memories
WHERE id IN (
  SELECT id FROM ai_memories
  WHERE embedding_model = 'voyage-3.5-lite'
  LIMIT 5000
);
```

Повторювати до `DELETE 0`.

---

## Нотатки про HNSW та multi-model coexistence

Active-model read-filter (`embedding_model = $N`) сьогодні behavior-neutral (всі рядки — `voyage-3.5-lite`). Але при наявності рядків різних моделей у таблиці HNSW-індекс може змішувати вектори з різних basis-spaces, що руйнує recall.

Якщо в майбутньому знадобиться справжня multi-model coexistence (одночасні запити до кількох моделей):

- Розглянь partial index: `CREATE INDEX ON ai_memories USING hnsw ((embedding::halfvec(1024))) WHERE embedding_model = 'voyage-3.5-lite'`.
- Або `hnsw.iterative_scan` (pgvector ≥ 0.7) — дозволяє ANN + додатковий WHERE без повного seqscan.

Обидва варіанти deferred до появи 2-го активного провайдера.

---

## Verification

- [ ] Новий `EmbeddingProvider` factory створений і повертає коректні `Float32Array`.
- [ ] `meta.model` відповідає значенню `VOYAGE_EMBEDDING_MODEL` (або нової env var).
- [ ] `.env.example` оновлений з новими env vars (без реальних значень).
- [ ] Dual-write задеплоєний — нові рядки в БД мають правильний `embedding_model`.
- [ ] Backfill-скрипт запущений, resumable, rate-limit-aware (`criticality: 'non-critical'`).
- [ ] `SELECT embedding_model, COUNT(*) FROM ai_memories GROUP BY 1` — legacy-модель прямує до 0.
- [ ] Active-model env var оновлена і задеплоєна.
- [ ] Smoke-тест recall після перемикання — якість не деградувала.
- [ ] Через 30d soak — legacy-рядки видалені порційно, `VACUUM ANALYZE` виконаний.
- [ ] `pnpm --filter @sergeant/server typecheck` — green.
- [ ] `pnpm --filter @sergeant/server test -- vectorStore` — green.

## Related playbooks and skills

- [add-sql-migration.md](./add-sql-migration.md) — якщо змінюється розмірність HALFVEC.
- [onboard-external-api.md](./onboard-external-api.md) — якщо новий vendor потребує нового HTTP-клієнта.
- Skill: `sergeant-server-api`
- Skill: `sergeant-data-and-migrations`
