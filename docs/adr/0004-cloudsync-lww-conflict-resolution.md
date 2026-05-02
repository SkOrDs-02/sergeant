# ADR-0004: CloudSync — LWW conflict resolution

- **Status:** accepted
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`apps/web/src/core/cloudSync/`](../../apps/web/src/core/cloudSync/) — engine / queue / conflict / state, ~16 файлів, ~4400 рядків коду + тестів.
  - [`apps/server/src/modules/sync/sync.ts`](../../apps/server/src/modules/sync/sync.ts) — серверні `push`/`pull`/`pushAll`/`pullAll` хендлери з LWW guard.
  - [`apps/server/src/migrations/003_baseline_schema.sql`](../../apps/server/src/migrations/003_baseline_schema.sql) — таблиця `module_data`.
  - [`apps/server/src/migrations/007_module_data_user_fk.sql`](../../apps/server/src/migrations/007_module_data_user_fk.sql) — FK + cascade on user delete.

---

## 0. TL;DR

Sergeant — **local-first** для всіх 4 модулів (finyk / fizruk / nutrition /
routine). Юзер має два пристрої (web + mobile-shell), пише в обидва,
іноді офлайн. Нам потрібен sync-протокол, який задовільняє конкретні вимоги:
дешевий на сервері (Railway 1 інстанс, не CRDT-кластер), простий для
local-first додатку (не вимагає merge-on-read), і **передбачуваний**
для одного юзера на 2-3 пристроях (не Slack у 50 людей).

Ми обрали **per-module Last-Write-Wins з double timestamp/version guard** і
свідомо описуємо чому це не CRDT, не OT, не RGA, не Yjs.

| Aspect                      | Decision                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| Granularity                 | **Per-module** (5 модулів: finyk, fizruk, routine, nutrition, profile)                   |
| Resolution strategy         | LWW: server keeps row with later `client_updated_at`; older client write → 409-like      |
| Server guard                | `WHERE module_data.client_updated_at <= $4` у `INSERT … ON CONFLICT DO UPDATE`           |
| Client conflict reaction    | `dirtyModules[mod]=true` лишається; наступний push-цикл повертає той самий payload       |
| Initial-sync arbitration    | 4-branch classifier у `conflict/resolver.ts` (adoptCloud / needMigration / merge / noop) |
| Offline queue               | `OFFLINE_QUEUE_KEY` у localStorage, max 50 entries, coalesced consecutive push-ів        |
| Mid-flight write protection | Snapshot `modifiedAt` на push-start; clear-dirty лише якщо `modifiedAt` не зрушив        |
| Out of scope                | Granular field-level merge, real-time collab, WebSocket push, multi-tab leader election  |

---

## ADR-4.1 — Granularity: per-module, не per-record і не per-user-blob

### Status

accepted.

### Context

Три варіанти granularity для local-first sync:

1. **Single user-blob.** Один JSON-документ на юзера, кожен push перезаписує
   все. Найпростіше, але: (а) розмір росте лінійно з кількістю даних
   (фінансових транзакцій за рік — 100KB+); (б) будь-яка drobна зміна
   ($+50 у фізрук-сесії) тягне push 200KB; (в) conflict-resolution
   неможливий — або весь cloud перемагає або весь local.

2. **Per-record.** Кожна транзакція / тренування / habit-mark — окремий
   row в Postgres з своїм `updated_at`. Найгранулярніше, але: (а) індекси
   на `user_id, kind` ростуть швидко; (б) делетов кодифікувати потрібно
   tombstone-ами; (в) клієнтський код перетворюється на mini-ORM (push
   diff-у вимагає трекати delete-set локально).

3. **Per-module.** 5 фіксованих логічних модулів (`finyk`, `fizruk`,
   `nutrition`, `routine`, `profile`); кожен — окремий blob у JSONB
   колонці `module_data.data`. Push зі спрацьовує модулем-в-цілому, але
   якщо змінився лише `routine`, то не зачіпаємо `finyk`'ський 100KB blob.

### Decision

**Per-module — це наш sync unit.** Один рядок у `module_data` на пару
`(user_id, module)`. Поточні модулі (`config.ts`):

```ts
export const SYNC_MODULES = {
  finyk:    { keys: [STORAGE_KEYS.FINYK_HIDDEN, ...] },   // ~18 keys
  fizruk:   { keys: [STORAGE_KEYS.FIZRUK_WORKOUTS, ...] },// ~9 keys
  routine:  { keys: [STORAGE_KEYS.ROUTINE] },             // 1 key
  nutrition:{ keys: [STORAGE_KEYS.NUTRITION_LOG, ...] },
  profile:  { keys: [STORAGE_KEYS.USER_PROFILE, ...] },
};
```

Серверна сторона — `module_data` UNIQUE-індекс `(user_id, module)`:

```sql
CREATE TABLE IF NOT EXISTS module_data (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  client_updated_at TIMESTAMPTZ DEFAULT NOW(),
  server_updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, module)
);
```

`VALID_MODULES` явно whitelist-ує імена (`apps/server/src/modules/sync/sync.ts:125`),
тож `module_data` залишається ізольованою — інші not-sync-фічі (Coach memory)
використовують ту саму таблицю, але з іншими ключами і pull-ом не зачіпаються.

### Consequences

**Позитивні:**

- Малий код (~440 рядків серверного коду на push/pull). Жодного ORM, жодного
  query builder.
- JSONB blob легко мігрувати — `INSERT new_field = data || $1::jsonb` без
  перебудови схеми. Це використовується для in-place migration після
  feature-додавання.
- `pullAll` — один SQL-запит з `module = ANY($2::text[])`. Index scan на
  UNIQUE-індексі.

**Негативні:**

- Push блобу 50KB при зміні однієї транзакції — це не оптимально. Acceptable
  бо: середній юзер на free-tier ~5KB на модуль, на Pro ~100KB при річних
  даних; mobile/Wi-Fi 100KB → 100ms.
- Conflict при паралельних змінах в одному модулі — частіший ніж per-record.
  Обходимо через ADR-4.2 (LWW guard) і ADR-4.3 (skippedDirty branch).

### Alternatives considered

- **Single user-blob:** відкинуто за growth-розмір.
- **Per-record (CRDT):** відкинуто, бо: (1) вимагає tombstone-системи на
  delete; (2) Yjs/Automerge мають JS bundle 50KB+ — це 30% поточного
  apps/web budget; (3) сервер уже не stateless: треба зберігати vector clocks
  per-record; (4) для use-case "юзер пише з 2 пристроїв сам собі" CRDT
  гранулярність — overkill.

---

## ADR-4.2 — Server-side LWW guard: client_updated_at compare-and-swap

### Status

accepted.

### Context

Без guard-а простий `INSERT … ON CONFLICT DO UPDATE` має race:

```
T0: Device A pushes data D_A with clientUpdatedAt = T_a (старіший)
T1: Device B pushes data D_B with clientUpdatedAt = T_b (новіший)
T2: Race: A прийшов другим → перезаписав D_B
```

Те саме але без race: A офлайн з T0, повертається онлайн на T2 і з'їдає
актуальніший cloud-стан.

Альтернативи:

1. **Last write wins by server clock.** Просто беремо latest-arrival.
   Уразливо до офлайн-юзерів і clock-skew (NTP).
2. **Server `version` increment + `expected_version` from client.** Optimistic
   concurrency. Юзер шле `version: 5`, сервер перевіряє `WHERE version = 5`,
   якщо ні — конфлікт. Сильно, але вимагає клієнтом трекати точну server-version
   до push-у; будь-який pull без push зрушує її.
3. **LWW by client_updated_at compare-and-swap.** Сервер пише, **тільки якщо**
   `existing.client_updated_at <= incoming.clientUpdatedAt`. Реальна
   реалізація:

```sql
INSERT INTO module_data (user_id, module, data, client_updated_at, version)
VALUES ($1, $2, $3, $4, 1)
ON CONFLICT (user_id, module) DO UPDATE
  SET data = $3, client_updated_at = $4, server_updated_at = NOW(),
      version = module_data.version + 1
WHERE module_data.client_updated_at <= $4
RETURNING server_updated_at, version
```

Якщо guard не пройшов — `RETURNING` поверне 0 рядків; ми це детектимо і
повертаємо `{ ok: true, conflict: true, serverUpdatedAt, version }`
(інтeрпретація: «прийнято логічно, але не записано — у тебе старий стан»).

### Decision

**LWW by `client_updated_at` compare-and-swap.** Server `version` колонка
лишається як side-effect (інкрементується), не використовується для guard-у.
Версію клієнт читає з `pull` для UI (показуємо "версія N"), не для
conflict-detection.

`clientUpdatedAt` обов'язкове у `SyncPushSchema` — раніше fallback на
`new Date()` мовчки переписував свіжіший серверний запис, бо
`client_updated_at <= NOW()` завжди true ([sync.ts:163](../../apps/server/src/modules/sync/sync.ts#L161-L164) коментар).

### Consequences

**Позитивні:**

- Стандартний CAS — атомарно у Postgres, не вимагає advisory locks.
- Симетрично з клієнтським `dirtyModules` flag-ом: на conflict ми не
  пушимо повторно з тим самим timestamp-ом (бо guard все одно блокне
  знову). Замість цього клієнтський `apply-merge` робить pull → бачить
  свіжіший cloud → юзер сам вирішує (через UI), що зробити.
- Race-window звужений до інкременту `version` (атомарний). Жодного
  read-then-write на стороні сервера.

**Негативні:**

- Точність `client_updated_at` залежить від клієнтського годинника. Якщо
  телефон на 5 хвилин назад — push з нього може загубити свіжіший cloud.
  Mitigation: на push-start ми snapshot-имо `getModuleModifiedTimes()` саме
  у `Date.now()` (не з зовнішнього source-у), тож timestamp-и
  внутрішньо-консистентні per-device.
- Conflict-rate видимий у `sync_conflicts_total{module}` (Prometheus,
  `apps/server/src/obs/metrics.ts`). Алерт-rule налаштовується у Phase 2 —
  поки тригерить чи є аномалії руками.

### Alternatives considered

- **Server-version optimistic concurrency (варіант 2):** відкинуто. Юзер,
  який заповнив форму, потім вийшов на тиждень офлайн — повертається з
  застарілим `version`-ом, але абсолютно правильним даними (нічого з
  cloud не змінилося в цьому модулі). Просити юзера "перезавантажити" — UX-fail.
- **Lex max merge:** на JSONB вийшло б `data = jsonb_strip_nulls(...)`,
  але семантично безглуздо — два юзери пишуть `{ "vibePicks": ["A"] }` і
  `{ "vibePicks": ["B"] }`, merge дав би масив [A, B], якого ніхто не
  хотів. Відкинуто.

---

## ADR-4.3 — Initial-sync 4-branch classifier (`resolver.ts`)

### Status

accepted.

### Context

При вході у застосунок (новий девайс, або перший вхід після релізу) ми не
знаємо, чи: (а) cloud має дані, а локально — ні; (б) локально є дані, а в
cloud — ні (юзер створив акаунт після onboarding); (в) обидва мають дані —
треба merge; (г) обидва порожні — noop. Без чіткої стратегії
"первинний sync" ми мали баги: cloud затирав локальний onboarding-стан;
локальні `vibePicks` мовчки переходили в cloud з timestamp-ом `epoch`.

### Decision

`apps/web/src/core/cloudSync/conflict/resolver.ts` — pure-функція
`resolveInitialSync(inputs) → InitialSyncPlan` з 4 явними гілками:

```ts
type InitialSyncPlan =
  | { kind: "adoptCloud"; applyModules: [...] }     // (а) cloud has, local empty
  | { kind: "needMigration" }                        // (б) local has, cloud empty, not migrated
  | { kind: "merge"; applyModules, setVersions, dirtyMods, skippedDirty }
                                                     // (в) both have data
  | { kind: "noop" };                                // (г) nothing to do
```

`merge`-гілка має **критичну** деталь — `skippedDirty[]`:

> Якщо `cloudVersion > localVersion` АБО `cloudModified > localModified`,
> ми б накатили cloud → local. **Але** якщо `dirtyModules[mod] === true` —
> локально лежать НЕпушнуті зміни, які перезапишуться. Тому:
> модуль ставиться у `skippedDirty[]`, **не** накатується, і наступний
> `applyMerge` спробує запушити локальні зміни — бекендовий LWW-guard
> з ADR-4.2 розрулить, чия версія актуальніша.

Без цього skip — `applyModuleData(cloud)` затирав би локальні зміни ще
ДО push-у, і наступний push ніс би вже втрачений (cloud-)стан.

Resolver — **pure**, без I/O. Тестується без fetch-mock-ів;
`apps/web/src/core/cloudSync/cloudSyncHelpers.test.ts` покриває всі
4 гілки явно.

### Consequences

**Позитивні:**

- Логіку можна reasoning без браузерних API. Test-coverage 90%+ за
  10 unit-тестами.
- `kind: "merge"` декомпонується на три підмасиви (`applyModules`,
  `setVersions`, `dirtyMods`, `skippedDirty`) — caller `initialSync.ts`
  відпрацьовує кожен незалежно.

**Негативні:**

- `skippedDirty[]` — silent skip. UI на момент написання ADR не показує
  юзеру, що його локальна зміна "поки в підвисі". Mitigation: після push-у
  guard поверне `conflict: true`, і UI може показати banner "ваші зміни
  не синхронізовані". Тікет TBD.
- Migration-фаза (`kind: "needMigration"`) обробляється поза resolver-ом
  у `useInitialSyncOnUser.ts`; це outsource на caller, але resolver сам
  не fail-fast-ить, що робить його тестування простішим.

### Alternatives considered

- **Single-branch "always merge":** відкинуто, бо merge-логіка має різні
  side-effects від adopt-cloud (наприклад, не виставляти `setModuleVersion`
  для модулів, де локально немає даних — інакше після pull-у зроблений
  юзером push отримає старший `version` як ground truth).
- **Inline merge у hook без pure-resolver:** як було до рефактора. Складно
  тестувати.

---

## ADR-4.4 — Offline queue: coalesce + 50-entry cap

### Status

accepted.

### Context

Поки юзер офлайн, сервер недосяжний — push має поставитися у чергу. Якщо
юзер 2 години офлайн і 5 разів змінює budget — наївно це 5 push-entries;
кожен push на запис ідентичний (один і той самий стан blob-а). Такий запас
не дає нічого корисного, бо при reconnect ми б 5 разів пушили той самий
finyk-blob.

### Decision

`apps/web/src/core/cloudSync/queue/offlineQueue.ts`:

1. **Coalesce consecutive pushes.** Якщо новий entry — `push` і черга
   закінчується теж на `push`, мерджимо `modules` в останній. Кожен модуль
   — це snapshot стану на момент push-у; новіший snapshot перезаписує
   старіший в межах того самого entry, не дублюючись.
2. **Skip no-op coalesce.** Якщо merge не змінює структуру черги (всі
   ключі і payload-и однакові), не пишемо у localStorage. Без цього
   `pushDirty` retry-цикл fire-ив би `setItem` десятки разів на кожен
   transient network failure.
3. **Cap at 50 entries.** Щоб черга не росла безмежно при патологічних
   випадках (напр. user-script, який кожну секунду пушить). Старі entries
   викидаються FIFO.
4. **Replay on reconnect.** `engine/replay.ts` обробляє чергу перед
   наступним успішним push-ем — це гарантує `pushDirty` ніколи не пушить
   "напівжитий" стан, де offline-batch ще не дойшов до сервера.

### Consequences

**Позитивні:**

- localStorage write-rate стиснутий від O(N changes) до O(1 per push-cycle).
- Replay серіалізований: один за одним, не parallel — уникаємо race на
  серверній LWW-guard.

**Негативні:**

- 50 entries × ~100KB blob = 5MB у localStorage у патологічному випадку.
  localStorage cap у Chrome — 10MB на origin. Близько до межі, але не
  перевищує. Mitigation: `MAX_OFFLINE_QUEUE` константа, легко зменшити.
- Якщо юзер офлайн 5 днів і пише в усі 4 модулі, на reconnect йде один
  big push з усіма 4 blob-ами. Розмір може перевищити server-side
  `MAX_BLOB_SIZE = 5MB` per module → 413. UI показує помилку, юзер
  свідомо зменшує дані. Не оптимізуємо до Phase 4.

### Alternatives considered

- **Diff-only push:** відкинуто. JSON-Patch генерація локально потребує
  prev-snapshot-у — це дублювання даних. Plus сервер мав би apply patch на
  сторону Postgres, що складно з JSONB.
- **No coalesce, just FIFO:** проста реалізація, але linearly растуча
  черга.

---

## ADR-4.5 — Mid-flight write protection (snapshot-modifiedAt)

### Status

accepted.

### Context

`pushDirty` flow: дістаємо `dirtyModules`, будуємо payload, чекаємо HTTP
response 1-2 секунди, на success чистимо `dirtyModules` → "все sync-нуто".
Race: юзер у ці 1-2 секунди ще пише у фізрук — модуль знову dirty, але ми
зараз його `clearDirtyModule`! Зміна губиться: наступний push не знає, що
модуль dirty, і фізрук-blob у cloud залишається застарілим до наступної
ручної дії.

### Decision

На push-start ми snapshot-имо `getModuleModifiedTimes()`. На success
clear-dirty відбувається **тільки** для модулів, чий поточний `modifiedAt`
дорівнює snapshot-овому:

```ts
// apps/web/src/core/cloudSync/engine/push.ts:38-66
const modifiedSnapshot = getModuleModifiedTimes();
const modules = buildModulesPayload(dirtyMods, modifiedSnapshot);
const result = await syncApi.pushAll(modules);
const currentModified = getModuleModifiedTimes();
for (const [mod, r] of Object.entries(result.results)) {
  if (!isModulePushSuccess(r)) continue;
  if (currentModified[mod] === modifiedSnapshot[mod]) {
    clearDirtyModule(mod);
  }
}
```

Якщо `modifiedAt` зрушив під час push-у — `dirtyModules[mod]` лишається
true, наступний push pick-апить новіший стан.

### Consequences

**Позитивні:**

- Детермінований happy path: ні в одному race-сценарії зміни не губляться
  silently.
- Тести `useCloudSync.behavior.test.ts` симулюють mid-flight write
  через `vi.useFakeTimers()`.

**Негативні:**

- Один зайвий push-cycle коли юзер пише дуже часто (typing у textarea з
  debounce). Acceptable: debounce у hook-ах вже стримує rate до
  ~1Hz max.

### Alternatives considered

- **Lock UI під час push.** Frustrating UX. Відкинуто.
- **Write-ahead log (журнал записів):** надмірно складно для one-user
  однієї модулі.

---

## ADR-4.6 — Що НЕ робимо (out of scope)

### Status

accepted.

### Decision

Цей ADR **не** покриває:

- **Real-time multi-device collab.** Slack-style "юзер бачить, як
  співрозмовник пише" — не наш use-case. Sergeant — single-user; multi-device
  лише для "у телефоні і вебі видно ті самі дані".
- **WebSocket push-нотифікації.** Зараз pull-only. Після push-у з девайса A,
  девайс B побачить зміну при наступному manual pull або при vibility-change
  rerender. Real-time push з SSE/WebSocket — у Phase 4 (для cross-device
  notifications, не для sync).
- **Field-level merge.** Якщо обидва девайси paralelno змінюють бюджет
  finyk — той, що пушить останнім, перемагає. Field-level merge через
  CRDT — Phase 6+.
- **Multi-tab leader election.** Дві відкриті вкладки веб-додатку шарять
  ту саму localStorage. Cross-tab events частково покривають це
  (`storage` event у `dirtyModules.ts:11-16`), але якщо обидві вкладки
  push-ять одночасно — обидва push-и пройдуть, LWW-guard виграє пізніший.
  Acceptable, бо: (а) one-user; (б) рідкісний кейс; (в) outcome
  identical в межах 5-секундного eventual-consistency window.
- **Conflict-resolution UI.** Поки що conflict — silent retry. UI banner
  "ваші зміни не синхронізовані, потрібно вирішити" — TBD у Phase 4.

---

## Open questions

1. **Compression на push.** Finyk-blob річних даних може бути 200KB+
   (ASCII у JSONB). Gzip-rate ~70%. Зараз без compression. Розглянути
   `Content-Encoding: gzip` через `compression`-middleware на server, коли
   побачимо `sync_payload_bytes` p95 > 100KB.
2. **`server_updated_at` вторинний guard.** Можливий race, де два
   незалежних push-и мають однаковий `client_updated_at` (наприклад,
   syncs з 2 девайсів через NTP-розсинхрон). Поточний `<=` пропускає
   обидва. У Phase 4 — додаємо `OR (client_updated_at = $4 AND
server_updated_at < NOW())` як tie-breaker.
3. **Vacuum-policy для `module_data`.** При delete-account `ON DELETE
CASCADE` чистить рядки автоматично. Окрема policy для inactive-юзерів
   (90+ днів без login) — TBD у ADR-0016.
