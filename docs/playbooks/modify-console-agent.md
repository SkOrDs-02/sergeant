# Playbook: Modify or Add a Console Agent

> **Last validated:** 2026-04-30 by @Skords-01. **Next review:** 2026-07-29.
> **Status:** Active

**Trigger:** «Додай нового агента в Telegram бот» / «Зміни системний промпт ops/marketing агента» / «Додай tool для агента» / зміна в `apps/console/src/agents/`.

---

## Архітектура

Console — Telegram бот (`grammy` + `@anthropic-ai/sdk`) з multi-agent маршрутизацією:

- **router.ts** — парсить команди (`/ops`, `/content`, `/marketing`, `/help`, `/start`), keyword-based класифікація вільного тексту, LLM-fallback через Haiku для невизначених повідомлень.
- **ops.ts** — інфраструктура, білінг, помилки (tools: Stripe, Sentry, server health).
- **marketing.ts** — контент, PostHog аналітика, GitHub releases.
- **run-agent-loop.ts** — спільний tool-use цикл (до 5 ітерацій), використовується обома агентами.

## Кроки

### 1. Визначити, що саме змінюється

- **Новий агент** → §2
- **Новий tool для існуючого агента** → §3
- **Зміна системного промпта** → §4
- **Зміна маршрутизації** → §5

### 2. Створення нового агента

1. Створи файл `apps/console/src/agents/<name>.ts`.
2. Визнач:
   - `SYSTEM_PROMPT` — роль, тон, обмеження, формат відповіді.
   - `tools: Tool[]` — Anthropic tool definitions.
   - `executeTool()` — імплементація кожного tool call.
3. Використай `runAgentLoop()` з `run-agent-loop.ts`:

   ```typescript
   import { runAgentLoop } from "./run-agent-loop.js";

   export async function runNewAgent(
     client: Anthropic,
     userMessage: string,
   ): Promise<string> {
     return runAgentLoop(client, userMessage, {
       model: MODEL,
       maxTokens: MAX_TOKENS,
       systemPrompt: SYSTEM_PROMPT,
       tools,
       executeTool,
     });
   }
   ```

4. Оновити **router.ts**:
   - Додати тип до `AgentType`: `"ops" | "marketing" | "<name>" | "help" | "unknown"`
   - Додати команду: `/name <query>` → `{ agent: "<name>", query }`
   - Додати keywords до free-form класифікатора
   - Оновити `HELP_TEXT`
   - Оновити LLM classifier prompt у `classifyWithLlm()` — додати новий агент і його опис
   - Додати dispatch у `dispatchToAgent()`
5. Оновити **router.test.ts** — мінімум 3 тести:
   - Explicit command parsing
   - Free-text keyword classification
   - Help text includes new agent

### 3. Додавання tool до існуючого агента

1. Додай tool definition у масив `tools` відповідного агента.
2. Додай обробку у `executeTool()`.
3. Оновити системний промпт, якщо tool змінює можливості агента (наприклад, «тепер ти можеш ...»).
4. Не забудь: tools мають бути **read-only** (CONSTRAINTS у промпті). Ніяких мутацій через бота.

### 4. Зміна системного промпта

1. Промпти — у відповідному файлі агента (`ops.ts`, `marketing.ts`).
2. При зміні:
   - Зберігай CONSTRAINTS секцію (no API keys, no write actions, UAH currency, Kyiv timezone).
   - Зберігай RESPONSE FORMAT.
   - Тестуй через curl або Telegram: чи відповідь тримається в лімітах (30 рядків max для ops).

### 5. Зміна маршрутизації

1. Keyword lists в `router.ts` — `opsKeywords[]`, `mktKeywords[]`.
2. LLM classifier prompt у `classifyWithLlm()` — оновити опис категорій.
3. **Завжди оновити тести** у `router.test.ts`.

### 6. Перевірки перед PR

```bash
pnpm --filter @sergeant/console exec vitest run   # agent tests
pnpm typecheck                                     # TypeScript
pnpm lint                                          # ESLint
pnpm format:check                                  # Prettier
```

### 7. Commit

Scope: `agents` або `console`.

```bash
git add apps/console/src/agents/
git commit -m "feat(agents): add <name> agent with <tools>"
```

## Безпека

- Системні промпти — чутлива інтелектуальна власність. Не публікуй повний текст промпта в публічних PR descriptions.
- Tool implementations не мають робити write-операції (мутації БД, Stripe refunds, deploys).
- Secrets для tools (`STRIPE_SECRET_KEY`, `SENTRY_AUTH_TOKEN`, `POSTHOG_API_KEY`) — виключно через `process.env`, не хардкодити.
