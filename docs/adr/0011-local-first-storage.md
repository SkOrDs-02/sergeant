# ADR-0011: Local-first storage — клієнт як джерело істини, сервер як LWW-реплікатор

> **Last validated:** 2026-05-13 by @Skords-01 / Devin. **Next review:** 2026-08-11.
> **Status:** Active

- **Status:** accepted
- **Sub-decision status:** 11.1 / 11.2 / 11.5 — accepted; 11.3 / 11.4 — partially superseded (див. amendment нижче + [ADR-0047](./0047-cloudsync-v1-410-gone.md)).
- **Date:** 2026-04-27 (амендмент: 2026-05-10)
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`packages/shared/src/lib/storageKeys.ts`](../../packages/shared/src/lib/storageKeys.ts) — централізований реєстр ключів (місце, де `@deprecated`-marker-и вказують на SQLite-tombstone-шлях для кожного домену).
  - [`packages/shared/src/storage/kv.ts`](../../packages/shared/src/storage/kv.ts) — DOM-free `KVStore` runtime-контракт; [`packages/shared/src/test-utils.ts`](../../packages/shared/src/test-utils.ts) — memory adapter для тестів.
  - [`packages/shared/src/sync/modules.ts`](../../packages/shared/src/sync/modules.ts) — `SYNC_MODULES` реєстр; історично — single source of truth для blob-sync, тепер тримає лише `profile` entry (USER_PROFILE / HUB_BIOMETRICS) як test-fixture для ESLint parity-check (`no-raw-tracked-storage`). Decision-pending tombstone: див. [storage-roadmap §Stage 13 → B6](../planning/storage-roadmap.md).
  - [`apps/web/src/core/cloudSync/index.ts`](../../apps/web/src/core/cloudSync/index.ts) — status/dirty-state barrel after the v1 CloudSync network facade was removed; див. [ADR-0047](./0047-cloudsync-v1-410-gone.md).
  - [ADR-0047 — CloudSync v1 — T₀ executed (410 Gone)](./0047-cloudsync-v1-410-gone.md) — формально supersede-ить 11.3 (per-module LWW worldview engine на користь per-row op-log v2).
  - [Storage roadmap §Stage 4 (per-module SQLite mirror)](../planning/storage-roadmap.md) і §Stage 7 (cleanup, drop `module_data` blob) — реалізують перехід.
  - [`docs/architecture/data-exchange-storage-audit.md`](../architecture/data-exchange-storage-audit.md) — поточний знімок архітектури (валідовано 2026-05-08).
  - [`docs/mobile/react-native-migration.md`](../mobile/react-native-migration.md) §6 — mobile sync-subsystem.
  - ADR-0010 — mobile dual-track (platform storage адаптери).
  - ADR-0012 — RLS як authz-межа (server-side чекає `user_id`-filter).

---

## Amendment (2026-05-10) — local-first контракт збережений, blob-sync engine замінений

Цей ADR описує оригінальне рішення (квітень 2026) за умов, які вже не справедливі. **Інваріанти 1–4 з §0 TL;DR живі**, але storage engine + sync wire-protocol повністю замінені:

| Аспект                  | Оригінально (цей ADR)                                                                    | Поточний стан (2026-05)                                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local engine (web)      | `window.localStorage` + IDB для рецептів                                                 | sqlite-wasm (OPFS-SAH VFS) — `apps/web/src/core/db/sqlite.ts`. LS лишається лише як boot-time first-paint fallback + tombstone-residual для одноразової міграції.                                                                             |
| Local engine (mobile)   | MMKV blob                                                                                | expo-sqlite — `apps/mobile/src/core/db/sqlite.ts`. MMKV — для нечисленних KV-prefs, що не виграють від реляційного шару.                                                                                                                      |
| Sync wire               | `POST /api/sync` (whole-module JSON blob, `module_data` JSONB column)                    | `POST /api/v2/sync/push` + `GET /api/v2/sync/pull?since=` (per-row op-log; `sync_op_outbox` на клієнті, `sync_op_log` на сервері — append-only).                                                                                              |
| Conflict                | Module-level LWW по `module_modified` timestamp (§11.3)                                  | Per-row LWW з origin_device_id; op-log idempotent через `(user_id, idempotency_key)` unique.                                                                                                                                                  |
| Offline                 | `SYNC_OFFLINE_QUEUE` LS-array з `MAX_OFFLINE_QUEUE` cap (§11.4)                          | `sync_op_outbox` SQLite-таблиця, push scheduler у `apps/web/src/core/syncEngine/singleton.ts` (`SyncEnginePushScheduler` + `SyncEngineFlushOnReconnect`). Жодного 5MB LS-cap-у.                                                               |
| Schema authority        | Не існувала — server тримав opaque blob                                                  | Drizzle SQLite схема у `packages/db-schema/src/sqlite/` (cross-platform); Drizzle PG mirror у `packages/db-schema/src/pg/`. Whitelist для op-log: `OP_LOG_TABLE_REGISTRY` на server.                                                          |
| `module_data` table     | Authoritative store на server                                                            | Дропнуто міграцією 046 (Stage 7 PR #051).                                                                                                                                                                                                     |
| `useCloudSync` хук      | Live на web; mobile-паралель — `useSyncedStorage`                                        | Видалені (web — PR #052b/c, mobile — PR #053b/c). На web лишився тонкий barrel `useSyncStatus` для UI.                                                                                                                                        |
| `SYNC_MODULES` registry | Single source of truth для blob-payload (finyk / fizruk / routine / nutrition / profile) | Майже порожній — лише `profile` entry; finyk зня­то у PR #039, fizruk у PR #030, routine у PR #026, nutrition у PR #034. Усе нерайтерне, тримається тільки для ESLint parity-test. Decision-pending tombstone (storage-roadmap §Stage 13 B6). |

**Які саме секції цього ADR — досі живі:**

- **§11.1 (client-first vs server-first архітектура)** — рішення живе. Принципи (UI ніколи не блокується мережею, offline-first, personal-app trade-offs) лишаються.
- **§11.2 (`KVStore` контракт + platform-адаптери)** — живе. Web `webKVStore` (`apps/web/src/shared/lib/storage/storage.ts`) тепер resolve-ить SQLite-backed adapter першим, потім LS-fallback, потім memory. Mobile `apps/mobile/src/lib/storage.ts` — paralel адаптер.
- **§11.5 (server-first винятки)** — живе. Better Auth, Monobank webhook, AI usage quota, push subscriptions, billing — як було, server-first. Coach memory мігрована у власну таблицю `coach_memory` (з `module_data WHERE module='coach'`, міграція 045).

**Які секції — застарілі / superseded:**

- **§11.3 (CloudSync LWW з module-level granularity)** — формально superseded by [ADR-0047](./0047-cloudsync-v1-410-gone.md) і Stage 4/7 з storage-roadmap. Концепція module-level LWW замінена на per-row op-log; `module_data` blob знесений; `useCloudSync` хук видалений. Конкретний приклад `SYNC_MODULES = { finyk: {...}, fizruk: {...}, ... }` у §11.3 НЕ відповідає поточному файлу — він тримає лише `profile`.
- **§11.4 (offline queue з `MAX_OFFLINE_QUEUE` cap)** — superseded. v2 outbox у SQLite не має 5MB LS-cap-у і не використовує `MAX_OFFLINE_QUEUE`. Константа фізично залишається в `packages/shared/src/sync/modules.ts` як test-fixture, без runtime-споживачів.

Дивись також **Implementation tracker** внизу ADR — він теж амендмент-овий.

---

---

## 0. TL;DR

Sergeant — **local-first**: клієнт (web localStorage / mobile MMKV) є primary
джерелом істини для всього, що юзер вводить руками (тренування, звички, витрати,
ручні meal-and-і). Сервер — **LWW-реплікатор** через `/api/sync` endpoint:
зберігає JSON-blob на модуль, раз на синхронізацію рахує Last-Write-Wins за
`module_modified`-timestamp-ом, повертає merged-state клієнту.

**Ключові інваріанти:**

1. UI ніколи не блокується мережею — усі мутації пишуть у локальний storage
   синхронно, sync іде у фоні.
2. Offline-first: якщо мережі немає, мутації складаються у `SYNC_OFFLINE_QUEUE`
   і replay-ляться при відновленні.
3. Конфлікт-резолюшен — **module-level LWW**, не row-level. Два девайси
   редагують різні модулі → merge; один модуль на двох девайсах → виграє
   пізніший `module_modified`, старіший втрачається (явний trade-off).
4. Серверний storage **не є авторитетним** — сервер НЕ валідує business-invariants,
   НЕ виконує запити проти blob-а. Blob = opaque JSON. Винятки: Monobank-інтеграція
   (real-time webhook), AI-usage quota, push-subscriptions, auth — там сервер
   first-party.

---

## ADR-11.1 — Архітектурне рішення: client-first, не server-first

### Status

accepted.

### Context

Типова web-апка = server-authoritative: клієнт читає/пише через REST/GraphQL,
latency-залежний UX, loading-spinner-и всюди. Варіанти для Sergeant:

1. **Server-first (REST + SQL-моделі на всіх доменах).** Loading-spinner на
   кожну дію. Offline неможливий без окремого cache-layer. Складна схема
   БД для кожного модуля.
2. **Local-first + cloud sync.** Мутація миттєва, sync у фоні. Offline
   працює натурально. Схема сервера — blob-зберігач + few auth/monetization
   таблиці.
3. **CRDT (Yjs / Automerge).** Коректний merge row-level. Але складність
   бандла (+500kb Yjs), операційний overhead (document stores, awareness
   state), і для personal-PWA (один юзер, ≤ 3 девайси) overkill.

Ключові властивості Sergeant-а, які схиляють до local-first:

- **Personal app** — один юзер, один-три девайси. Concurrent-write конфлікти
  рідкісні (<1% за логами).
- **Offline-critical** — фітнес-трек у залі (без Wi-Fi), кафе без мережі
  (лог їжі), метро (звички). Будь-яке "loading…" тут — UX-fail.
- **Data privacy by default** — багато даних (ваги, нутрієнти, витрати) юзер
  свідомо тримає у телефоні. Sync — opt-in через login + swipe-to-sync UX.

### Decision

**Local-first + cloud sync** як primary архітектура. Усе, що юзер вводить руками,
пишеться у local storage синхронно, UI ніколи не чекає на мережу. CloudSync
engine у `apps/web/src/core/cloudSync/` (mobile паралель — `apps/mobile/src/lib/sync/*`)
періодично пушить dirty-модулі на `/api/sync` і pull-ить остання-известна
серверна версія.

### Consequences

**Позитивні:**

- UI миттєвий — `onClick` → `setState` → `lsSet` → пише локально, ре-рендериться
  у межах 1 React-тіку. Без loading-станів.
- Offline just works — `useCloudSync` ставить операцію у `SYNC_OFFLINE_QUEUE`,
  replay-є на `online`-event.
- Схема БД мінімальна — `sync_state(user_id, module, payload JSONB, module_modified TIMESTAMPTZ)`
  замість десятків таблиць з FK/joins. Менше міграцій, менше RLS-policies
  (див. ADR-0012).
- Анонімні юзери мають full-featured UX без акаунта — login пропонується лише
  як "збережи на другий девайс" (soft-auth flow, FTUX, див. ONBOARDING_DONE
  flag).

**Негативні:**

- **Module-level LWW** — якщо юзер одночасно змінює той самий модуль на web і
  mobile, зміни на "старшому" девайсі **перезапишуть** зміни на молодшому.
  Це усвідомлений trade-off: row-level merge потребує CRDT-рушія, якого ми
  не маємо.
- **Глобальний пошук і cross-module AI-фічі** (HubChat, WeeklyDigest) повинні
  працювати над blob-ами — сервер НЕ може виконувати SQL-запити типу
  `SELECT SUM(amount) FROM transactions WHERE month = ?` над blob. AI-фічам
  ми pas-aмо слайси stateу у prompt (або клієнт pre-aggregate-ить і шле
  summary).
- **Schema-evolution — клієнтська.** Якщо ми змінюємо shape локальних даних
  (напр. `transactions[].amount: number → bigint`), треба client-side
  migration. Сервер просто зберігає те, що йому дали.
- **Бандл-росте** — реально багато бізнес-логіки живе у клієнті
  (`@sergeant/finyk-domain`, `@sergeant/fizruk-domain`, ...). Ми це свідомо
  приймаємо, split chunking мітігує.

### Alternatives considered

- **Повний server-authoritative (REST + relational tables per domain).**
  Offline-UX ламається. Відкинуто на етапі MVP.
- **CRDT (Yjs).** Великий бандл, operational overhead, і для personal-scale
  конфлікт-rate не виправдовує. Можливий перегляд на Phase 7+ для
  shared/family features (TBD ADR — family/team plans).
- **Service Worker cache + network-first API.** Приховує loading, але
  write-mutations потребують online. Не вирішує offline-write.

### Exit criteria

Рішення переглядається, якщо:

- Module-level LWW масово губить дані (>1% юзерів / місяць скаржаться) —
  переходимо на row-level + CRDT хоча б для одного модуля.
- Family/team plans (TBD ADR) потребують shared state — там local-first
  не працює, треба server-authoritative multiplayer state.

---

## ADR-11.2 — Storage abstraction: `KVStore` + platform адаптери

### Status

accepted.

### Context

Web і mobile мають різні persistence API:

- Web — `window.localStorage` (+IndexedDB для великих blob-ів як рецепти);
- Mobile — MMKV (native, швидке, encrypted); Capacitor shell — Capacitor
  Preferences (для bearer і критичних), localStorage у WebView для решти.

Нейтральні утіліти у `packages/shared/src/lib/*` (FTUX прогрес, vibe-picks,
digest-state) не можуть reach-ити до `localStorage` напряму — ламає mobile.

### Decision

Мінімальний DOM-free contract — [`KVStore`](../../packages/shared/src/storage/kv.ts):

```ts
export interface KVStore {
  getString(key: string): string | null;
  setString(key: string, value: string): void;
  remove(key: string): void;
}
```

Нейтральні функції приймають `KVStore` як параметр. Платформо-специфічні
адаптери:

- **web:** `apps/web/src/shared/lib/storage/storage.ts` експортує `webKVStore` який обгортає `window.localStorage`.
- **mobile:** `apps/mobile/src/lib/storage.ts` обгортає `react-native-mmkv`.
- **tests:** `createMemoryKVStore({...})` з `@sergeant/shared/test-utils`.

Усі методи **повинні** swallow помилки (quota exceeded, disabled storage,
parse errors) і повертати `null` / no-op — caller-и assume-ють try/catch-free
API.

Централізований реєстр ключів —
[`STORAGE_KEYS`](../../packages/shared/src/lib/storageKeys.ts). Ніяких magic
strings у модулях.

### Consequences

**Позитивні:**

- Pure helpers у `@sergeant/shared` тестуються з `createMemoryKVStore({...})`
  з `@sergeant/shared/test-utils` без jsdom/RN env.
- Один реєстр ключів → grep `STORAGE_KEYS.FIZRUK_PLAN` знаходить усі use-sites.
- Додавання нового ключа → один diff у `storageKeys.ts` + опційно у
  `SYNC_MODULES` (якщо треба клоуд-синк).

**Негативні:**

- Кожен модуль, що пише у storage, мусить інжектити `KVStore` — extra
  bookkeeping в React-хуках.
- Ключ-колізії можна зробити випадково (скопіював ключ без зміни) — мітігуємо
  TypeScript-літералами з `as const`.

### Exit criteria

n/a (operational contract).

---

## ADR-11.3 — CloudSync: LWW-reconciler з module-level gran-ularity

### Status

accepted.

### Context

Після локального write треба перенести зміну на інші девайси юзера. Реалізація:
`useCloudSync` хук (web) + його mobile-паралель.

Питання: на якій гранулярності міряти "modified"?

- **Row-level** — потребує tombstone-записів для deletes, OT/CRDT для merge.
  Складно.
- **Module-level** — timestamp на module, LWW на рівні blob-а. Простіше, але
  модуль цілком "переможений".
- **Key-level** — timestamp на кожному `STORAGE_KEYS.*`. Compromise, але
  багато ключів у межах одного модуля логічно зв'язані (`FIZRUK_WORKOUTS`
  - `FIZRUK_MEASUREMENTS` — змінюються разом, розділяти sync-state
    штучно).

### Decision

**Module-level LWW.** `SYNC_MODULES` реєстр (див.
[`packages/shared/src/sync/modules.ts`](../../packages/shared/src/sync/modules.ts)) визначає,
які STORAGE_KEYS належать до якого модуля:

```ts
export const SYNC_MODULES = {
  finyk: { keys: [ FINYK_HIDDEN, FINYK_BUDGETS, FINYK_SUBS, ... ] },
  fizruk: { keys: [ FIZRUK_WORKOUTS, FIZRUK_TEMPLATES, ... ] },
  routine: { keys: [ ROUTINE ] },
  nutrition: { keys: [ NUTRITION_LOG, NUTRITION_PANTRIES, ... ] },
  profile: { keys: [ USER_PROFILE ] },
} as const;
```

`module_modified` timestamp оновлюється при **будь-якому** write у
module-ключ. Sync-flow:

1. **Push** — клієнт шле dirty-модулі з `module_modified` і payload-ом.
2. **Server** — порівнює server-timestamp vs client-timestamp, пише той що
   новіший. Відповідає поточним merged-state-ом (у ОК випадку — echo).
3. **Pull** — клієнт порівнює у відповідь, пише у локальний storage
   модулі, що на сервері новіші.
4. **Conflict** — якщо обидва timestamps майже однакові (~10s window),
   показуємо юзеру toast "зміни з іншого девайса застосовано" — prime-ий
   candidate для CRDT у майбутньому.

### Consequences

**Позитивні:**

- Простий код — `conflict/resolver.ts` тримається в < 200 LOC.
- Інжестор на сервері — тривіальний UPSERT по (user_id, module), без схеми
  кожного модуля.
- Intra-module consistency — якщо юзер змінив `FIZRUK_WORKOUTS` і
  `FIZRUK_MEASUREMENTS` одночасно на одному девайсі, обидва синхнуться разом
  (один timestamp → один winner).

**Негативні:**

- Cross-device concurrent writes у один модуль → програє старіший client
  (повний модуль перезаписується). Це **документований** trade-off, юзеру
  показується "conflict resolved — дивись останні зміни".
- Великі модулі (finyk з ~18 ключами) передаються цілком на кожному sync-у.
  Payload може вирости → є `MAX_BLOB_SIZE` hard cap і `sync_operations_total{outcome="too_large"}`
  метрика. У такому випадку обрізаємо payload (див. runbook).

### Alternatives considered

- **Row-level merge (CRDT).** Відкинуто на MVP через бандл-розмір і складність.
  Lazy-upgrade шлях: почати з одного модуля як CRDT (напр. `routine` — там
  часто concurrent writes на звички з двох девайсів), усі інші module-level.
- **Event sourcing (append-only log).** Складна replay-semantic для 4+ модулів.

### Exit criteria

Переглядається, якщо conflict-rate (per metrics dashboard) > 1% від усіх sync
operations — тоді принаймні `routine` переходить на CRDT.

---

## ADR-11.4 — Offline queue з обмеженням довжини

### Status

accepted.

### Context

Якщо юзер офлайн протягом тривалого часу (літак, гори), queue-черга може
вирости необмежено, з'їдаючи localStorage quota. Mobile MMKV quota-unbounded,
але payload може стати не-надсилабельним при reconnect-у.

### Decision

Hard cap `MAX_OFFLINE_QUEUE` (див.
[`packages/shared/src/sync/modules.ts`](../../packages/shared/src/sync/modules.ts)
— PR #009 підняв з 50 до 10 000 після переходу offline queue на IDB).
Коли черга досягає cap-у, **найстаріші записи drop-аються** з
`offline_queue_drops_total{reason="overflow"}` метрикою. Це прийнятно, бо
module-level LWW робить старі записи redundant: останній push включає
накопичений state.

### Consequences

**Позитивні:**

- Bounded memory usage — localStorage не переповниться від offline-tail-у.
- LWW-семантика компенсує drops — тільки остання версія модуля важлива.

**Негативні:**

- Event-log не є source-of-truth. Якщо в майбутньому захочемо аудит-trail
  (коли саме юзер додав транзакцію), треба додати server-side event-log
  окремо.

### Exit criteria

Переглядається при переході на row-level merge (де кожен event критичний).

---

## ADR-11.5 — Явні винятки з local-first

### Status

accepted.

### Context

Не все можна тримати як blob. Деякі домени вимагають server-first.

### Decision

Наступні домени — **server-first, НЕ через cloudSync**:

| Домен                 | Чому не local-first                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Better Auth sessions  | Безпека: сесії не можна тримати в blob (треба inval і TTL)                                                       |
| Monobank webhook data | Server first — webhook безпосередньо пише у `mono_transaction`; клієнт їх pull-ить у RQ-cache, НЕ у localStorage |
| AI usage quota        | Global-rate-limit, треба захист від client-tampering (`ai_usage_daily` table)                                    |
| Push subscriptions    | Сервер мусить знати device-token-и, щоб слати push; client не може "sync" це                                     |
| Subscription plan     | ADR-0001 — server-authoritative через Stripe webhook                                                             |
| Tool invocations      | ADR-0002 — server-side metrics для auditing                                                                      |

Ці домени не проходять через `SYNC_MODULES` і **не** сховані в blob-payload-і.
Вони мають свої REST endpoints і relational tables.

### Consequences

- Чіткий поділ "що cloud-syncaється" vs "що REST-based" — dev-и не плутаються.
- AI-фічі (HubChat, WeeklyDigest), які _читають_ local blob-и для генерації
  prompt-а, роблять це на **клієнті** — сервер не бачить raw domain data.
  Prompt іде з клієнта як текст.

### Exit criteria

n/a (operational rule).

---

## Open questions

1. **CRDT для `routine`-модуля.** Concurrent writes на звички з web/mobile —
   найпоширеніший conflict. Кандидат на перший CRDT-migration.
2. **Size-based throttling push-у.** Якщо blob перевищує 256kb — stream-ing
   upload замість одного POST. Поки ні — MAX_BLOB_SIZE = 512kb, trigger-ить
   `too_large` outcome у метриках і юзер бачить warn.
3. **End-to-end encryption.** Блоб-и зараз приходять до сервера у plaintext
   JSON (server НЕ запитує їх, але теоретично може). Для strong-privacy режиму
   — encryption key tied to password (Argon2id), серверний blob стає opaque
   ciphertext. Phase 8+.
4. **IndexedDB для рецептів.** `NUTRITION_SAVED_RECIPES` на web використовує
   IndexedDB, не localStorage (за обсягом). Міграція між storage backends для
   того самого ключа — edge case, не закритий.

---

## Implementation tracker

> Оновлено 2026-05-10. Original 2026-04 трекер описував blob-sync; нижче — стан після Stage 4–9 + Stage 13 cleanup.

| Arte-fact                                                | Статус                                                                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `KVStore` contract + memory store                        | live                                                                                                                        |
| `STORAGE_KEYS` централізований реєстр                    | live (з `@deprecated`-маркерами на tombstone-keys)                                                                          |
| Web SQLite-WASM (OPFS-SAH VFS)                           | live (`apps/web/src/core/db/sqlite.ts`)                                                                                     |
| Mobile expo-sqlite singleton                             | live (`apps/mobile/src/core/db/sqlite.ts`)                                                                                  |
| Cross-platform Drizzle schema                            | live (`packages/db-schema/src/{sqlite,pg}/`)                                                                                |
| Op-log v2 sync (`/api/v2/sync/push` + `pull`)            | live (storage-roadmap §Stage 7)                                                                                             |
| `sync_op_outbox` (client) + `sync_op_log` (server)       | live                                                                                                                        |
| `SyncEnginePushScheduler` + `SyncEngineFlushOnReconnect` | live (`apps/web/src/core/syncEngine/singleton.ts`)                                                                          |
| Dead-letter recovery (`recoverAllDeadLetters`)           | live                                                                                                                        |
| `useSyncStatus` UI status barrel                         | live (`apps/web/src/core/cloudSync/index.ts` — barrel only)                                                                 |
| Mobile MMKV sync parity (see react-native-migration §6)  | live (через op-log, не blob)                                                                                                |
| `SYNC_MODULES` реєстр + `useCloudSync` (v1 blob)         | **retired** — `useCloudSync` removed PR #052b/c; `SYNC_MODULES` тримає лише `profile` як test-fixture (B6 decision-pending) |
| `module_data` JSONB column + `/api/sync` blob endpoints  | **retired** — column dropped міграцією 046; endpoint-и → 410 Gone (ADR-0047)                                                |
| Offline queue з MAX cap (LS-array)                       | **retired** — замінено SQLite outbox; `MAX_OFFLINE_QUEUE` лишається як константа без споживачів                             |
| Module-level LWW conflict resolver                       | **retired** — замінено per-row LWW через op-log                                                                             |
| CRDT для routine                                         | TBD                                                                                                                         |
| E2E encryption (optional privacy mode)                   | TBD                                                                                                                         |
