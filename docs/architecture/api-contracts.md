# API contracts — runtime consumer-driven contract testing (Pact)

> **Last validated:** 2026-05-13 by @Skords-01 / Devin. **Next review:** 2026-08-11.
> **Status:** Active
>
> **v2 (persona-extend) coverage:** 10 consumer interactions → 8 provider replays + 2 `it.todo` markers. Diff from PR-42 v1: +5 endpoints (`mono/sync-state`, `mono/transactions`, `coach/memory`, `barcode`, `nutrition/day-plan`).

Pact-based **runtime** contract verification for `@sergeant/api-client ↔ @sergeant/server`. Доповнює, а не замінює, **type-level** sync через Hard Rule #3 ([`03-api-contract-server-client-test.md`](../governance/rules/03-api-contract-server-client-test.md)) + `pnpm api:check-openapi` / `pnpm api:check-openapi-types`.

## TL;DR

| Гарантія                                             | Як забезпечується                                                                            | Surface                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Типи клієнт ↔ сервер ↔ тест синхронізовані**       | Hard Rule #3 + `pnpm api:check-openapi` + `*.contract.test.ts` фікстури в `@sergeant/shared` | Build-time / pre-PR                                       |
| **Wire-shape клієнт ↔ сервер ідентична на рантаймі** | Pact-контракт: consumer описує запит+відповідь, провайдер реплеює це проти `createApp()`     | `.github/workflows/pact-contract-test.yml` + `pnpm check` |
| **Pact-файли як артефакт між сервісами**             | `actions/upload-artifact` у consumer-job → download у provider-job; retention 14 днів        | GH Actions                                                |

## 🎯 Чому Pact поверх OpenAPI sync

OpenAPI/Zod-схеми ловлять **type-level drift** на build-time (тип у `api-client` не сходиться з типом, що серверні роути serialise). Pact ловить **wire-level drift**: реальні HTTP-байти від хендлера не сходяться з тим, що очікує клієнт.

Найчастіші класи багів, які ловить тільки Pact:

- Серіалізатор пропустив поле, яке є у Zod-схемі (нормалізатор повернув `undefined`, JSON-stringify видалив його).
- Поле `null`-able у схемі, але хендлер повертає `0` / `""` / неіснування ключа.
- `bigint`-as-string leak (Hard Rule #1 — `apps/server/src/lib/normalizers/mono.ts` не coerce-нув `pg`-int8).
- Версія API повернула інший `content-type` (наприклад, `application/json; charset=utf-8` vs голий `application/json`).

OpenAPI sync (`pnpm api:check-openapi`) — обовʼязковий, дешевий, runs на pre-commit. Pact — повільніший, але глибший, runs у CI.

## 🧩 Pipeline

```
┌─ packages/api-client ─────────────────────────────────────┐
│  src/__tests__/contracts/*.contract.test.ts               │
│  → PactV4 mock server                                     │
│  → pacts/sergeant-api-client-sergeant-server.json         │
└────────────────────────┬──────────────────────────────────┘
                         │
                         ▼  (artifact: pacts, 14d retention)
┌─ apps/server ─────────────────────────────────────────────┐
│  src/__tests__/contracts/provider.test.ts                 │
│  → завантажує JSON                                        │
│  → для кожної interaction: supertest проти createApp()    │
│  → asserts status + body == pact's response               │
└───────────────────────────────────────────────────────────┘
```

### Consumer side

- **Файли:** `packages/api-client/src/__tests__/contracts/<persona>.contract.test.ts`.
- **Налаштування:** `_pact.ts` експортує `createPact()` — один `PactV4` builder per file. Усі взаємодії конкатенуються у **один** pact file `packages/api-client/pacts/sergeant-api-client-sergeant-server.json` (Pact-контракт — це один файл на `(consumer, provider)` пару).
- **Spec version:** V3. V4 не потрібен для REST (синхронні повідомлення / GraphQL — фічі V4-only).
- **Що описує контракт:** request (method, path, headers, optional body) + response (status, headers, body).
- **Не використовуємо matchers (`like()`, `term()`, …):** v1 фіксує точні значення, щоб provider-replay був дитерміністичним. Якщо в майбутньому конкретне поле треба зробити "схожим за shape, не за значенням" — мігруємо точково.

### Provider side

- **Файл:** `apps/server/src/__tests__/contracts/provider.test.ts`.
- **Як працює:** читає `packages/api-client/pacts/sergeant-api-client-sergeant-server.json`, для кожної interaction:
  1. Налаштовує `getSessionUserMock` та `queryMock` (через `vi.hoisted` + `vi.mock`) так, щоб реальний handler повернув очікувану відповідь.
  2. Робить `supertest(app).<method>(<path>)` проти `createApp()`.
  3. Перевіряє, що `res.status` і `res.body` точно дорівнюють pact'у.

- **Чому supertest replay, а не `@pact-foundation/pact` `Verifier`:** Verifier очікує самостійно запущений HTTP-сервер, що ускладнює in-process мокінг Better Auth + pool. Supertest-replay використовує ту саму JSON-форму pact-файлу, тому ми завжди можемо перейти на офіційний Verifier без переписування consumer-side.

### CI workflow

Обидва suite-и вже покриті `pnpm check` у [`ci.yml`](../../.github/workflows/ci.yml). Окремий dedicated workflow (`.github/workflows/pact-contract-test.yml`) — TODO у follow-up PR від користувача з `workflow`-scope (OAuth App, яким devin push-ає, не має workflow scope і remote rejects YAML-файл у `.github/workflows/`).

Готовий шаблон, який треба коммітнути окремо:

```yaml
# .github/workflows/pact-contract-test.yml
name: Pact contract tests
on:
  push:
  pull_request:
permissions:
  contents: read
concurrency:
  group: pact-contract-test-${{ github.ref }}
  cancel-in-progress: true
jobs:
  consumer:
    name: Consumer contract tests (packages/api-client)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
      - uses: pnpm/action-setup@8912a9102ac27614460f54aedde9e1e7f9aec20d
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version: "20"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @sergeant/api-client test -- --run src/__tests__/contracts/
      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02
        with:
          name: pacts
          path: packages/api-client/pacts/
          retention-days: 14
          if-no-files-found: error
  provider:
    name: Provider contract replay (apps/server)
    needs: consumer
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
      - uses: pnpm/action-setup@8912a9102ac27614460f54aedde9e1e7f9aec20d
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version: "20"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093
        with:
          name: pacts
          path: packages/api-client/pacts/
      - run: pnpm --filter @sergeant/server test -- --run src/__tests__/contracts/provider.test.ts
```

Цінність окремого workflow поверх `pnpm check`: (а) pact JSON як видимий artifact на кожен PR (download у GH UI), (б) червоний контракт-чек помітний без grep по `pnpm test`-логах, (в) artifact можна push-ити у Pact Broker downstream без повторного запуску consumer suite.

## ➕ Як додати новий endpoint у contract pipeline

1. **Consumer-side test** — створи `packages/api-client/src/__tests__/contracts/<name>.contract.test.ts` за зразком `me.contract.test.ts`. Використай `createPact()` з `_pact.ts`. Опиши request + response точними значеннями.
2. **Запусти локально:**
   ```bash
   pnpm --filter @sergeant/api-client test -- --run src/__tests__/contracts/
   ```
   Pact-файл `sergeant-api-client-sergeant-server.json` перезапишеться (всі interactions merge у нього). Закомить новий pact JSON.
3. **Provider-side replay** — додай `it()`-блок у `apps/server/src/__tests__/contracts/provider.test.ts`:
   - Викличи `findInteraction(pact, METHOD, PATH)` для очікуваної interaction.
   - Налаштуй `getSessionUserMock` та `queryMock` для канонічного response.
   - Виклич supertest, перевір status + body.
4. **Запусти locally:** `pnpm --filter @sergeant/server test -- src/__tests__/contracts/provider.test.ts`.
5. **Pre-PR:** `pnpm check` (включно з `format:check`, `lint`, `typecheck`, `test`, `build`).

## 🚧 Coverage map (v2 — persona-extend)

| Persona / endpoint                                | Consumer pact | Provider replay | Notes                                                                                                           |
| ------------------------------------------------- | :-----------: | :-------------: | --------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/me` (hub / shell)                    |       ✓       |        ✓        | Better Auth mock only.                                                                                          |
| `GET /api/v1/mono/accounts` (finyk)               |       ✓       |        ✓        | + pool mock з bigint-string-coercion exercise (Hard Rule #1).                                                   |
| `GET /api/v1/mono/sync-state` (finyk) ⁽²⁾         |       ✓       |        ✓        | Two-query handler (`mono_connection` + `mono_account` count); gated by `MONO_WEBHOOK_ENABLED`.                  |
| `GET /api/v1/mono/transactions` (finyk) ⁽²⁾       |       ✓       |        ✓        | + pool mock fed **string** bigints so `normalizeMonoTransaction` coercion is actually executed (Hard Rule #1).  |
| `GET /api/v1/coach/memory` (hub) ⁽²⁾              |       ✓       |        ✓        | Locks the `{ ok, memory: <jsonb> }` envelope; memory blob interior is intentionally open.                       |
| `GET /api/v1/barcode` (nutrition) ⁽²⁾             |       ✓       |        ✓        | Provider stubs `globalThis.fetch` to return a canned OFF JSON envelope; no real upstream hit.                   |
| `POST /api/v1/push/register` (fizruk)             |       ✓       |      ✓ ⁽¹⁾      | Provider verifies ios sibling-shape; web-shape потребує VAPID env.                                              |
| `POST /api/v1/nutrition/day-plan` (nutrition) ⁽²⁾ |       ✓       |      ✓ ⁽³⁾      | Anthropic-gated; `requireAnthropicKey` + `requireAiQuota` satisfied via `vi.hoisted` env + shared mock harness. |
| `POST /api/v1/nutrition/analyze-photo`            |       ✓       |     ⊘ todo      | Vision Anthropic stub — extend coverage окремою PR.                                                             |
| `POST /api/v1/chat` (hub, non-streaming)          |       ✓       |     ⊘ todo      | Streaming Anthropic stub — extend coverage окремою PR.                                                          |

⁽¹⁾ Provider replays `{platform: "ios"}` (same `{ ok, platform }` envelope). Це гарантує, що `PushRegisterResponseSchema` consumer-shape валідний для всіх трьох платформ; web-branch покритий module-load env у `apps/server/src/routes/pushTest.test.ts`.

⁽²⁾ Added in the persona-extend PR (poverh PR-42). 5 new endpoints обрано за критерієм «real use в `apps/web/`» + cross-surface critical (`monoWebhookApi` + `nutritionApi` + `coachApi` — топ-3 за кількістю RQ-hooks). Routes як `fizruk/workouts/today` або `openclaw/health` не існують як public REST (`fizruk` — local-first CRDT-sync; `openclaw` — бот, який не консумить `@sergeant/api-client`).

⁽³⁾ Anthropic-gated: provider-replay ніяк не торкається `api.anthropic.com`. Паттерн — `vi.mock("./../../lib/anthropic.js", () => createAnthropicMockHandle())` + `anthropicMessages.mockResolvedValueOnce(anthropicResponses.text(...))` зі спільного harness-у у `apps/server/src/test/__mocks__/anthropic.ts`. `ANTHROPIC_API_KEY` і `AI_QUOTA_DISABLED=true` піняться через `vi.hoisted` перед імпортом `createApp` — так `requireAnthropicKey` + `requireAiQuota` middleware-и пропускають запит до реального handler-а.

### `openclaw` — навмисно не покритий

OpenClaw — це Telegram-бот, який є **отримувачем webhook-ів від Telegram** і не консумить `@sergeant/api-client` для HTTP-комунікації. Контракти між Telegram → OpenClaw перевіряються інакше (signature-validation у `tools/console/src/openclaw/` + smoke-test). У consumer-driven контрактах OpenClaw не має сенсу — у нього немає consumer-боку.

## 🔁 Pact файл як артефакт

`packages/api-client/pacts/sergeant-api-client-sergeant-server.json` **зокомічений у git**. Це дає:

- Reviewer-у в PR одразу видно, який саме wire-shape клієнт очікує (diff на JSON >> diff на TS-коді).
- Provider-replay тест запускається й офлайн, без consumer-job залежності.
- Майбутній push у Pact Broker (якщо ми колись захочемо public contract registry) — просто `pact-broker publish` цього файлу з CI.

Не редагуй pact JSON руками — він **виключно** регенерується consumer-тестами.

## 🔮 Майбутні розширення (поверх v2 persona-extend)

1. **Streaming Anthropic stub** для `POST /api/v1/chat` provider-replay (зняти `it.todo`). v2 уже довів — `nutrition/day-plan` ганяє Anthropic-stub без проблем; chat треба окремо через streaming-shape.
2. **Vision Anthropic stub** для `POST /api/v1/nutrition/analyze-photo` provider-replay (зняти `it.todo`).
3. **Pact matchers** (`like()`, `term()`) для полів, де ми навмисно хочемо схему, а не значення (наприклад, `requestId` ULID-strings, `nextCursor` опаковий рядок).
4. **Pact Broker** інтеграція — якщо буде потрібен contract-version-matrix на CI (web vs mobile vs openclaw consumers різних версій).
5. **Streaming SSE контракт** для `/api/v1/chat` — Pact JSON не виражає SSE-фрейми; альтернатива — окремий `chat-stream.contract.test.ts` із власним адаптером.
6. **Fizruk + openclaw покриття** — обидві персони навмисно не покриті v2:
   - **fizruk** — local-first CRDT sync через `/api/v2/sync/*`; sync-payload бінарний (Yjs), не JSON, тому Pact без custom encoder-а не підходить. Альтернатива — окремий contract test за байт-вовнішньою фіксурою.
   - **openclaw** — Telegram-бот, що консумить власний internal-API (`/api/internal/openclaw/*`) через Bearer-ключ, а не через `@sergeant/api-client`. Якщо потрібна contract-валідація — це окрема (consumer=`sergeant-openclaw-bot`, provider=`sergeant-server-internal`) pact-пара, що жила б у `tools/console/src/__tests__/contracts/`.
