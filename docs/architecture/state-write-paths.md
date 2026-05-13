# State write-paths — `apps/web`

> **Last validated:** 2026-05-13 by Devin (child session, roast #3/10). **Next review:** 2026-08-11.
> **Status:** Active

> Як, де і чому web-додаток мутить state. Дві writer-доріжки (`useMutation` vs HubChat tool-call), коли яку обирати, і де живуть инваріанти. Закриває §2.1 з [`docs/audits/2026-05-03-web-deep-dive/02-architecture-and-state.md`](../audits/2026-05-03-web-deep-dive/02-architecture-and-state.md) (parallel-write paths require explicit doc).

Cross-refs:

- [`docs/audits/2026-05-03-web-deep-dive/02-architecture-and-state.md`](../audits/2026-05-03-web-deep-dive/02-architecture-and-state.md) §2.1 — chatActions-як-другий-writer (audit findings)
- [`docs/audits/2026-05-13-web-architecture-state-roast.md`](../audits/2026-05-13-web-architecture-state-roast.md) — Roast #3/10 (this doc landed alongside it)
- [`docs/architecture/diagrams/c3-chat-tool-use.md`](./diagrams/c3-chat-tool-use.md) — sequence для tool-use round-trip
- [`docs/architecture/module-ownership.md`](./module-ownership.md) — який RQ-keys factory належить якому модулю
- [`apps/web/src/shared/lib/api/queryKeys.ts`](../../apps/web/src/shared/lib/api/queryKeys.ts) — централізована фабрика ключів (Hard Rule #2)
- [`docs/governance/hard-rules.json`](../governance/hard-rules.json) — RQ-keys / no-raw-localStorage / max-lines інваріанти

## TL;DR

Web-додаток має **дві канонічні writer-доріжки**:

1. **UI mutation path** (`useMutation` → API). Користувач натискає кнопку / submit form → React-компонент викликає мутацію → `apiClient.<module>.<action>(...)` → on success: інвалідація RQ-ключів того ж модуля → optimistic-state synchronizes.
2. **AI tool-call path** (`chatActions/<module>Actions.ts` → API → tool_result). LLM emit-ає `tool_use` block з `name` і `input` → клієнтський dispatcher у [`apps/web/src/core/lib/hubChatActions.ts`](../../apps/web/src/core/lib/hubChatActions.ts) знаходить handler → handler виконує точно ту саму API-мутацію → повертає `string` для `tool_result` → клієнт шле `POST /api/chat` із `tool_result` → LLM продовжує stream і узагальнює зміну.

Обидві доріжки повинні **закінчуватися на тому самому API endpoint** (через `apiClient`), щоб серверні invariants (валідація, права, миграція даних) фає рівно одне місце. Локальний кеш — RQ — invalidate-иться через `apiQueryKeys` / `<module>Keys` з [`queryKeys.ts`](../../apps/web/src/shared/lib/api/queryKeys.ts).

> **Чому це важливо.** До 2026-04 ми мали дублюючу логіку: `useMutation` ходив у `/api/v1/finyk/transactions`, а `chatActions/finykActions/transactions.ts:createTransaction` писав напряму у `localStorage`. Будь-який bugfix у валідації треба було робити двічі, і вони регулярно розходились — юзери бачили «чек з пляшкою віскі на 2 грн» у HubChat, але «20.00 грн» у Finyk-сторінці. Контракт «обидві доріжки → один API-endpoint» закриває цей клас багів структурно.

## Doctrine

### Канал 1 — UI mutation path (default)

```ts
// apps/web/src/modules/finyk/pages/Transactions.tsx (example)
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@sergeant/api-client/react";
import { finykKeys } from "@shared/lib/api/queryKeys";

const api = useApiClient();
const qc = useQueryClient();

const create = useMutation({
  mutationFn: (payload: CreateTransactionInput) =>
    api.finyk.transactions.create(payload),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: finykKeys.transactions.all });
  },
});
```

**Чому так:**

- Один `apiClient.<module>.<action>` виклик → серверні invariants (Zod, права, audit log) фає в одному місці.
- `mutationFn` повертає Promise → `useMutation` сам керує `isPending` / `isError` / `error` → UI отримує state без власної bookkeeping-логіки.
- `onSuccess` інвалідує **тільки** ключі того ж модуля — кросовий invalidate (`finyk` мутація валідує `nutrition` cache) заборонений Hard Rule #2.
- Ключ береться з фабрики (`finykKeys.transactions.all`), не з інлайнового tuple.

### Канал 2 — AI tool-call path (HubChat)

```
LLM (Anthropic) ──┐
                  │  tool_use { name: "finyk.create_transaction", input: { amount, ... } }
                  ▼
core/lib/hubChatActions.ts:dispatch
  │
  ├─ resolve handler by `name`
  │
  ▼
core/lib/chatActions/finykActions/transactions.ts:createTransaction
  │
  ├─ same Zod parse → same `apiClient.finyk.transactions.create(payload)`
  │
  ▼
return "Транзакція збережена. Залишок місяця: 12 400 ₴"   ← string for tool_result
  │
  ▼
POST /api/chat with tool_result block
  │
  ▼
LLM continues stream → final assistant message
```

**Чому так:**

- Handler-сигнатура: `(input: SchemaParsed) => Promise<string>`. `string` — це тіло `tool_result`, яке LLM побачить у наступному раунді (тому формуй людською мовою, з ключовими числами).
- **Той самий `apiClient.<module>.<action>`**, що і канал 1 — це інваріант, який тримає state-консистентний. Якщо handler не може використати `apiClient` (legacy локальний state, який ще не вийшов на сервер) — додай TODO-issue і поведи UI-mutation паралельно, щоб обидва канали ходили в одне джерело.
- Помилки повертаються рядком (`"Не вдалось зберегти транзакцію: ${err.message}"`), а не throw-ом — інакше LLM повертає юзеру «щось пішло не так» без контексту.
- RQ-кеш інвалідується **через ту саму фабрику ключів**, як і у каналі 1. Тести handler-а (`<module>Actions.test.ts`) явно перевіряють `queryClient.invalidateQueries({ queryKey: <module>Keys.... })` був викликаний.

## Decision matrix — який канал коли

| Сценарій                                                                   | Канал                                     | Чому                                                                                                                                                                                       |
| -------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Натискання кнопки / submit form у UI                                       | **Канал 1** (`useMutation`)               | Прямий feedback (loading/error states), focus-management, optimistic-update — все живе у React.                                                                                            |
| LLM генерує `tool_use` у відповідь на чат-промпт                           | **Канал 2** (`chatActions` handler)       | Це **тільки** механізм продовження діалогу — sync write з відповіддю-рядком для `tool_result`. UI-state оновлюється через RQ-invalidate всередині handler-а.                               |
| Auto-sync background task (sw, online-resume, schedule)                    | **Канал 1**, обгорнутий у sync engine     | Background writes завжди йдуть через CloudSync v2 writer runtime (`getSyncEngineWriter()`) → той сам api endpoint під капотом. Жодного «прямого» localStorage-shadow-write повз API.       |
| Імпорт CSV / Mono webhook → багато транзакцій разом                        | **Канал 1**, з batch-endpoint             | Якщо API має `bulkCreate`/`bulkUpsert` — викликай його (один `useMutation`). Без batch-endpoint — fold-ай у `mutationFn` через `Promise.all`, але всередині handler-а, не у компоненті.    |
| HubChat має `quickAction`, який має дзеркалити поведінку UI-кнопки         | **Канал 2** делегує у **Канал 1**         | `quickAction` емітить `tool_use` у локальний dispatcher → handler викликає той самий `apiClient.<module>.<action>`, який слухає UI-кнопка. Жодного шорткатного `localStorage.setItem` тут. |
| Migration / data-fix that runs once per user (legacy LS → SQLite kv_store) | One-shot at bootstrap, **не writer path** | Йде через `bootstrapKvStore()` у `main.tsx`, не через RQ-mutation. Має свій own `addSentryBreadcrumb` контракт.                                                                            |

## Інваріанти, які CI перевіряє

1. **RQ-keys factory only** — Hard Rule #2 ([`docs/governance/hard-rules.json`](../governance/hard-rules.json) + ESLint `sergeant-design/no-inline-rq-keys`). Жодного інлайнового `["finyk", "transactions"]` у `queryKey` / `setQueryData` / `invalidateQueries`. Усе йде через `<module>Keys` з [`queryKeys.ts`](../../apps/web/src/shared/lib/api/queryKeys.ts).
2. **`no-raw-local-storage`** — Hard Rule (`sergeant-design/no-raw-local-storage`). Production-allowlist у [`eslint.config.js`](../../eslint.config.js) — порожній; усі write-и йдуть через `webKVStore` / `safeReadLS` / `safeWriteLS` з `@shared/lib/storage/storage`. Це робить **Канал 1 → API** єдиним шляхом до durable state — навіть якщо handler хоче кешувати, він робить це через KV-store з cross-tab `onChange`.
3. **chatActions handlers повертають `string`** — статичний контракт у `hubChatActions.ts:dispatch`. Якщо handler потрібно повернути JSON, він серіалізує його в текст для LLM (`JSON.stringify(...)` обгорнутий у природне речення).
4. **chatActions-тести покривають happy path + error path** для кожного handler-а — [`docs/architecture/module-ownership.md`](./module-ownership.md) row `apps/web/src/core/lib/chatActions/**` контракт. `fizrukActions.test.ts` / `finykActions.test.ts` / `nutritionActions.test.ts` / `routineActions.test.ts` — `pnpm --filter @sergeant/web test src/core/lib/chatActions` має 0 fail.

## Anti-patterns (НЕ роби)

- **`localStorage.setItem` напряму** із handler-а / компонента. Йди через `webKVStore.setString` або `safeWriteLS<T>`. (Eslint-rule fail-ить CI.)
- **Інлайнові RQ-ключі** — `queryKey: ["finyk", "transactions"]`. Заведи / використай ключ з `queryKeys.ts`. (Eslint-rule fail-ить CI.)
- **Throw з handler-а замість return string** — LLM побачить generic `"tool_use_error"` і дасть юзеру беззмістовний фідбек. Завжди формуй описовий рядок з error message.
- **Cross-module invalidate** — `finyk.createTransaction` НЕ повинен інвалідувати `nutritionKeys`. Якщо є cross-module derived state — заведи окремий `crossModuleKeys` чи додай dedicated endpoint, не пиши implicit fan-out.
- **Дві паралельні writer-доріжки до одних і тих самих даних** (UI пише напряму, а handler пише `localStorage` shadow-копію поруч). Це і є той самий §2.1-баг, який ми тут documenting-ом закриваємо.

## Як додати новий writer

1. Завести endpoint у `apps/server/src/modules/<module>/` (якщо ще нема). Update `@sergeant/api-client` types — `bigint → number` через [Rule #1](../governance/rules/01-db-types-coerce-bigint-to-number.md).
2. Завести RQ-ключ у [`queryKeys.ts`](../../apps/web/src/shared/lib/api/queryKeys.ts).
3. **Канал 1** — додати `useXxxMutation()` у `apps/web/src/modules/<module>/hooks/`. `mutationFn` → `apiClient.<module>.<action>`. `onSuccess` → invalidate RQ-keys.
4. **Канал 2** — якщо action потрібен у HubChat: додати tool-def у `apps/server/src/modules/chat/toolDefs/<module>.ts` + handler у `apps/web/src/core/lib/chatActions/<module>Actions/<action>.ts`, який викликає ту саму mutation і повертає `string` для `tool_result`.
5. Тести: вибір canonical happy+error для handler-а. UI-mutation покривається `Vitest + MSW + RTL` згідно [`module-ownership.md`](./module-ownership.md).

## FAQ

**Q. Чому handler не повертає Promise<object>? Чому саме `string`?**
Бо `tool_result.content` у Anthropic API — це або `string`, або масив `text`-блоків. Клієнтський dispatcher шле саме `string`, який LLM сприймає як «next observation». Якщо тобі треба structured payload — JSON-сериалізуй і обгорни в природне речення: `Транзакція збережена: ${JSON.stringify(data)}`. LLM розпарсить.

**Q. Чи можна оминути `apiClient` і написати у локальний кеш напряму, бо «це швидше»?**
Ні. Швидкість досягається через RQ optimistic-update (Канал 1) або через CloudSync warm-cache (background channel). Прямий write — це shadow-state, який розійдеться з сервером і колись зашкодить юзеру.

**Q. Як я зрозумію, що мій новий handler «правильний»?**
Тест має містити: (1) successful path → mocked `apiClient.<module>.<action>` повертає payload → handler повертає очікуваний string + правильний `<module>Keys` invalidate-нутий; (2) error path → mocked client throw-ить → handler повертає рядок з error message, не re-throw. Точно ті ж очікування, що `chatActions/<module>Actions.test.ts` уже використовує.

**Q. Що з offline writes?**
CloudSync v2 op-log writer runtime (`getSyncEngineWriter()`) ловить writes, що не дійшли до серверу, у dead-letter queue → user бачить `OfflineBanner` pill з лічильником через `useSyncStatus()`. Канал 1 — той самий API endpoint — це і є вхід у sync engine; offline-кейс прозорий для writer-сайту.

**Q. Що з migration-writes (Stage 9 SQLite kv_store)?**
Не writer-доріжка. One-shot, виконується у `bootstrapKvStore()` під час старту програми (`main.tsx`). Логи через `addSentryBreadcrumb`, фейли тихі, fallback ladder у `resolveStore()` — у `apps/web/src/shared/lib/storage/storage.ts`.
