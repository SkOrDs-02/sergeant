# C4 діаграми Sergeant

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-01.
> **Status:** Active

GitHub-renderable Mermaid діаграми. Чотири рівні C4 + ключові sequence-flows. Запит виник у [`docs/diagnostics/2026-05-03-web-deep-dive` §9.2](../../diagnostics/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md).

## Як читати C4

[C4 model](https://c4model.com/) — це стек із чотирьох рівнів масштабу. Кожен рівень — це **той самий** software system, але в більшому або меншому фокусі:

| Рівень                  | Питання, на яке відповідає                                             | Аудиторія                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **C1 — System Context** | З якими зовнішніми системами говорить Sergeant у цілому?               | Senior eng / TL / нова людина.                                                                            |
| **C2 — Containers**     | Які процеси/деплоймент-юніти всередині Sergeant і як вони комунікують? | Інженер на onboarding-у.                                                                                  |
| **C3 — Components**     | Як влаштований конкретний контейнер ізсередини (модулі/класи)?         | Власник модуля, рефакторинг, debug.                                                                       |
| **C4 — Code**           | Класи / функції / схеми.                                               | Дуже точкові кейси (rare). У нас не використовується — Code-рівень покривають TS типи й тестові снепшоти. |

Окремо тримаємо **sequence-flows** — runtime-послідовності для критичних шляхів (auth, sync, chat tool-use, reminders).

## Каталог діаграм

| Рівень | Файл                                               | Покриває                                                                                                                                                                                         |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1     | [`c1-system-context.md`](./c1-system-context.md)   | User ↔ Sergeant Web / Mobile / Mobile-Shell ↔ зовнішні системи (Postgres, Redis, Anthropic, Sentry, Mono, n8n, SMTP, OpenFoodFacts).                                                             |
| C2     | [`c2-containers.md`](./c2-containers.md)           | Деплоймент-топологія: `apps/web` (Vercel), `apps/server` (Railway, Express + BullMQ in-process), `tools/console` (Telegram bot), `apps/mobile` / `apps/mobile-shell`, Postgres/Redis/n8n/Sentry. |
| C3     | [`c3-cloudsync.md`](./c3-cloudsync.md)             | Внутрішня структура CloudSync: `dirtyMap` → `collectQueued` → `offlineQueue` → push/pull → conflict resolver.                                                                                    |
| C3     | [`c3-chat-tool-use.md`](./c3-chat-tool-use.md)     | HubChat tool-use loop: Anthropic stream → `tool_use` блоки → client `chatActions` handlers → `tool_result` → продовження стрімінгу.                                                              |
| Flow   | [`flow-signin.md`](./flow-signin.md)               | Better Auth sign-in cookie flow (email + password).                                                                                                                                              |
| Flow   | [`flow-cloudsync.md`](./flow-cloudsync.md)         | Push/pull синхронізація між web ↔ `/api/sync` ↔ Postgres.                                                                                                                                        |
| Flow   | [`flow-chat-tool-use.md`](./flow-chat-tool-use.md) | Runtime цикл tool-use всередині однієї chat-сесії.                                                                                                                                               |
| Flow   | [`flow-reminder-fire.md`](./flow-reminder-fire.md) | n8n cron → server `/api/internal/push` → APNs/FCM → пристрій.                                                                                                                                    |

## Як оновлювати

1. Усі діаграми — Mermaid у markdown-кодблоках. GitHub рендерить автоматично.
2. Якщо змінюється поверхня з [`service-catalog.md`](../service-catalog.md) — синхронізуй відповідні діаграми у тому самому PR.
3. **Last validated** + **Status** хедери у кожному файлі мають співпадати з фактичним станом — `pnpm lint:tech-debt-freshness` ловить застарілі.
4. Не додавайте C4 рівень (Code) — TS типи й тестові снепшоти його замінюють.

## Чому Mermaid, а не PlantUML / Excalidraw

- GitHub render out-of-the-box → жодного external infra.
- `git diff` читабельний (текст, а не SVG).
- Editor-friendly: Mermaid Live Editor + VS Code extension.
- C4 model не вимагає специфічного синтаксису — `flowchart` + `subgraph` достатньо для C1-C3, `sequenceDiagram` для flow-ів.
