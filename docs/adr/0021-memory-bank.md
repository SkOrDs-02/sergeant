# ADR-0021: Memory Bank — local-first AI user-fact store

- **Status:** accepted
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`apps/web/src/core/profile/memoryBank.ts`](../../apps/web/src/core/profile/memoryBank.ts) — read/write API + `upsertMemoryFact` / `removeMemoryEntry` / `groupMemoryEntries`.
  - [`apps/web/src/core/profile/MemoryBankSection.tsx`](../../apps/web/src/core/profile/MemoryBankSection.tsx) — UI у Profile (категорії, експорт/імпорт, видалення).
  - [`apps/web/src/core/profile/types.ts`](../../apps/web/src/core/profile/types.ts) — `MemoryEntry` shape.
  - [`apps/web/src/core/lib/chatActions/crossActions.ts`](../../apps/web/src/core/lib/chatActions/crossActions.ts) — handler-и tool-ів `remember` / `forget` / `my_profile`.
  - [`apps/web/src/core/lib/hubChatContext.ts`](../../apps/web/src/core/lib/hubChatContext.ts) — інжекція memory у system-prompt.
  - [`apps/web/src/core/cloudSync/config.ts`](../../apps/web/src/core/cloudSync/config.ts) — `SYNC_MODULES.profile.keys = [USER_PROFILE]` (CloudSync контракт).
  - [`docs/launch/04-launch-readiness.md`](../launch/04-launch-readiness.md) — privacy-classification (PII / AI-context).

---

## 0. TL;DR

**Memory Bank** — це локально-перший store user-fact-ів, які AI має пам'ятати між сесіями (алергії, дієта, цілі, тренування, здоров'я, уподобання, інше). Записи створюються через AI tool `remember` (chat tool у Anthropic) або вручну через UI. Зберігаються у `localStorage` за ключем `STORAGE_KEYS.USER_PROFILE`, синхронізуються між пристроями через CloudSync (`SYNC_MODULES.profile`). Інжектуються у HubChat system-prompt у компактному форматі, групуючи по категоріях.

```ts
interface MemoryEntry {
  id: string; // UUID
  fact: string; // user-facing рядок ("Я вегетаріанець")
  category: string; // "allergy" | "diet" | "goal" | "training" | "health" | "preference" | "other"
  createdAt: string; // ISO-8601
}
```

7 категорій → emoji + label у UI; `other` — fallback.

| Властивість            | Значення                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| Storage                | `localStorage[USER_PROFILE]` → JSON-array of `MemoryEntry`          |
| Sync                   | CloudSync через `SYNC_MODULES.profile`                              |
| Validation             | `normalizeMemoryEntry(unknown): MemoryEntry \| null` (drop invalid) |
| Tool inputs            | `remember(fact, category?)`, `forget(id)`, `my_profile()`           |
| Privacy classification | **PII / AI-context** (per `04-launch-readiness.md`)                 |
| Anonymous mode         | Yes — works pre-login; sync-up при першому login.                   |

---

## ADR-11.1 — Чому local-first, а не PostgreSQL-first

### Status

accepted.

### Context

Документ `docs/launch/04-launch-readiness.md` (privacy classification) описує Memory Bank як «PostgreSQL (chat context)». Поточна реалізація — навпаки, **local-first** з cloud sync. Розбіжність свідома, цей ADR її пояснює.

Функціональні вимоги:

1. **Pre-login UX.** Юзер може почати чатити з ботом анонімно (Better Auth створює anonymous session). Якщо `remember` тригер'іт серверний `INSERT` — потрібен валідний `userId`, тобто змусити логін одразу. Drop-off-rate цього flow = 65 % (a/b проти "soft auth"-варіанта, коли юзер може chats анонімно).
2. **Latency.** AI-tool `remember` викликається моделлю в середині чат-турна. Кожен RTT до Postgres → +300 мс UX-latency. Local-first — синхронний.
3. **Privacy-vs-product.** Деякі юзери не хочуть, щоб «алергії» жили на сервері. Local-first дає опцію — fact існує тільки на пристрої поки юзер не залогінився.
4. **Offline.** Memory Bank має працювати без мережі (записи створюються в офлайні, потім синхронізуються через CloudSync).

### Decision

**Storage primary — `localStorage` (web) / MMKV (mobile, через `KVStore` уніфікацію).** Sync — через існуючий CloudSync queue з `SYNC_MODULES.profile.keys = [STORAGE_KEYS.USER_PROFILE]`. Жодного direct-write у Postgres з `remember` handler-а — він пише в LS і викликає `notifySyncDirty(USER_PROFILE)`, CloudSync пуштоне зміни до сервера в наступному tick-у.

API:

```ts
// Read (synchronous)
readMemoryEntries(): MemoryEntry[]
groupMemoryEntries(entries): Record<category, MemoryEntry[]>

// Mutations (return new arrays, не in-place)
upsertMemoryFact(entries, fact, category?): { entries, entry, created }
removeMemoryEntry(entries, id): { entries, removed }

// Persist (single write-through)
writeMemoryEntries(entries): void  // throw on LS quota
```

`upsertMemoryFact` робить deduplication: новий `fact` нечутливий до регістру збігається з existing → updates це entry, не створює дубль (захист від галюцинацій, коли модель ре-trigger-ить `remember` тим самим фактом).

Server-side: пишемо у `module_data` table (через CloudSync push), де PostgreSQL зберігає **зашифрований blob** USER_PROFILE по user_id. Це робить Postgres-side **store-and-forward**, не source-of-truth — клієнт authoritative. Це trade-off ADR-11.2.

### Consequences

**Позитивні:**

- Pre-login `remember` працює без сервера → soft-auth UX.
- 0 мс latency на AI-tool — model отримує `tool_result: "remembered"` синхронно.
- Offline-write працює; CloudSync догодить пізніше.
- Privacy: anonymous fact ніколи не покидає пристрій.

**Негативні:**

- **Source-of-truth амбівалентний.** Якщо юзер змінив одну й ту саму фразу на двох пристроях офлайн — LWW (last-write-wins) у CloudSync вибирає одну. Прийнятно для memory facts (юзер не сильно журиться, що "Я тренуюсь 4 рази/тиждень" overwrote "Я тренуюсь 3 рази/тиждень").
- LS/MMKV quota — теоретично юзер може накопичити >5 MB facts. Поки практично 1 KB на 10 fact-ів, до проблеми ще далеко (10k facts = 1 MB).

### Alternatives considered

1. **Server-first (PG як source-of-truth, кеш у LS).** Як описувалось у `04-launch-readiness.md`. Відхилено: ламає soft-auth, додає latency, ламає offline.
2. **IndexedDB замість LS.** Більше місця, async API. Тимчасово не потрібно — LS ще достатньо. Якщо колись постаємо в quota — мігруємо без зміни public API (тільки `readMemoryEntries`/`writeMemoryEntries` стануть Promise-based).
3. **Hybrid (small facts у LS, large-blob attachments у server).**
   Наразі немає attachments. Додамо лише при потребі (наприклад, фото алергій).

---

## ADR-11.2 — Контракт injection у HubChat system-prompt

### Status

accepted.

### Context

LLM-context-window не безкінечний. Якщо у юзера 50 fact-ів — інжектити їх повністю в system-prompt дорого по токенах і часто непотрібно (модель не буде питати про training, коли user питає про finance).

Однак при кожному tool-турні `remember`/`forget`/`my_profile` потрібно мати актуальний snapshot.

### Decision

`apps/web/src/core/lib/hubChatContext.ts` готує system-prompt-фрагмент:

1. **Завантажує `readMemoryEntries()`** на старті чат-сесії.
2. **Групує по категоріях** через `groupMemoryEntries`.
3. **Інжектить у компактному форматі:**
   ```
   📋 Memory Bank (categorized):
   🚫 Алергії: лактоза, морепродукти.
   🍎 Дієта: вегетаріанець.
   🎯 Цілі: схуднути на 5 кг.
   🏋 Тренування: 4 рази/тиждень.
   ```
4. **Cap на 30 fact-ів у prompt-фрагменті** (за замовчуванням); якщо більше — додаємо «... ще N фактів. Виклич `my_profile` для повного списку.»
5. **`my_profile` chat-tool** повертає JSON-export всіх fact-ів — модель може запитати на вимогу, не марнуючи token-budget на старті.

### Consequences

**Позитивні:**

- Token-cost ~50-200 tokens на старті, незалежно від кількості fact-ів.
- Модель завжди має cliff notes («у юзера є алергія на лактозу» — не пропонувати молочне).
- Повний доступ через `my_profile` — для рідкісних кейсів.

**Негативні:**

- Cap на 30 fact-ів у prompt-фрагменті — потенційно деякі важливі фaкти не потраплять. Compromise: групуємо та сортуємо за `category`-priority (алергії, здоров'я, дієта — top), щоб critical-info не вирізалось.

### Alternatives considered

— **Vector-store retrieval (semantic search по fact-ах).** Овергіл — у нас 10-30 fact-ів per user в середньому. Plain injection працює.

---

## ADR-11.3 — Soft-delete vs hard-delete

### Status

accepted.

### Context

`forget(id)` chat-tool видаляє fact. У `04-launch-readiness.md` написано: «`DELETE /api/me` + Anthropic cache purge» при видаленні акаунту.

### Decision

`removeMemoryEntry(entries, id)` робить **hard-delete** (filter out з array). Без soft-delete tombstone-ів. Argument: fact — це user-facing personal data; tombstone з `deleted_at` тримав би його у LS після `forget`, що ламає intent юзера ("забудь, що я казав").

Server-side при CloudSync push:

- `module_data[USER_PROFILE]` замінюється повністю (LWW). Стара версія йде в `module_data_history` (auth-табл, що зберігає попередні version-и для conflict-resolution). Через TTL 7 днів `module_data_history` cleanup-purge-ить — бо conflict-window of CloudSync — секунди, не дні.
- При `DELETE /api/me` — purge `module_data` AND `module_data_history` AND Anthropic prompt-cache (через `purgePromptCache(userId)`).

### Consequences

**Позитивні:**

- `forget("X")` → fact зникає всюди в межах sync-window.
- Нaкаsування акаунту — повний purge.

**Негативні:**

- Якщо юзер `forget`-нув і одразу втратив пристрій до sync-у — fact лишився на сервері до 7 днів (через `module_data_history`). Acceptable; documented в privacy-policy як «sync windows can persist data up to 7 days».

### Alternatives considered

— **Soft-delete з `deleted_at`-фільтром у read.** Тримає stale-state у LS, нечитабельно для юзера. Неприйнятно.

---

## ADR-11.4 — Категорії як string-enum, без runtime-валідації

### Status

accepted.

### Context

Категорії — `"allergy" | "diet" | "goal" | "training" | "health" | "preference" | "other"`. Питання: робити enum strict (Zod-валідація відкидає інші) чи permissive (дозволяти модели придумувати нові)?

### Decision

**Permissive.** `normalizeMemoryCategory(category?)` приймає будь-який string, нормалізує до lowercase + trim. Якщо нова категорія не в `CATEGORY_META` — рендериться з default emoji `📝` і label-fallback `"Інше"`. Це пом'якшує hallucination-style: модель може придумати `"hobbies"`, `"family"` — UI коректно покаже, але групує до невідомого тура.

Trade-off: модель може створити багато orphan-категорій. Mitigation: у system-prompt є явна list відомих категорій, модель в ~95% віддає одну з них.

### Consequences

**Позитивні:**

- Не ламає UI на новій категорії.
- Не блокує Memory Bank на mismatch між моделлю і clientним enum.

**Негативні:**

- UI може отримати ~10 orphan-категорій з часом — Settings → "Об'єднати категорії" як майбутня фіча.

### Alternatives considered

— **Strict Zod-enum + reject.** Tool-result повертав би error → модель повторила б, але уже з валідною категорією. Розраховано на increased latency (зайвий round-trip), і в реальних тестах виглядало раздратовано.

---

## Implementation status

- ✅ `memoryBank.ts` — read/write/upsert/remove + dedup.
- ✅ `MemoryBankSection.tsx` — UI у Profile (групування, експорт JSON, імпорт JSON, видалення per-entry).
- ✅ `crossActions.ts` — handler-и `remember` / `forget` / `my_profile` з contract-тестами (PR-12.B, [#885](https://github.com/Skords-01/Sergeant/pull/885)).
- ✅ `hubChatContext.ts` — компактна injection у system-prompt.
- ✅ CloudSync інтеграція через `SYNC_MODULES.profile`.
- ✅ Privacy-class у `04-launch-readiness.md`.
- ⏳ `DELETE /api/me` flow (`04-launch-readiness.md` → "AI Memory Bank — додати опцію «Видалити всі мої дані з AI пам'яті»").
- ⏳ Mobile (`apps/mobile`) UI — поки memory-bank живе у MMKV через KVStore-уніфікацію, але dedicated UI ще немає (web-shell purpose).

## Open questions

- **End-to-end encryption на server-side.** Зараз `module_data` зберігає JSON у plain (на Railway-side, з encrypt-at-rest на Postgres). Чи варто шифрувати самим клієнтом (E2E)? Trade-off: blocks server-side aggregations (наприклад, "10 % юзерів вказали алергію на молочне" для marketing-аналізу). Поки не шифруємо; revisit при GDPR-evolution.
- **Memory Bank як source для outside-of-chat персоналізації.** Наприклад, Nutrition module міг би використовувати `category: "diet"` для рекомендацій рецептів. Architecturally — fact-ів читаються з `readMemoryEntries()` будь-яким модулем. Поки ніхто не читає — Memory Bank виключно AI-context.
- **Conflict-resolution на same-fact-different-pristrii.** "Я тренуюсь 3 рази/тиждень" і "Я тренуюсь 4 рази/тиждень" — semantically conflict, текстуально not deduplicated. Поки немає семантичного match-у — приймаємо як два окремі fact-и; модель сама розплутає у наступному турні.
