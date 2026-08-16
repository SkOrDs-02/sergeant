# Playbook: Підняти застосунок локально після мержу

> **Last touched:** 2026-08-16 by @claude. **Next review:** 2026-11-16.
> **Status:** Active

**Trigger:** Щось змержено в `main` (або треба перевірити відкритий PR), і потрібно клікнути живий застосунок у себе на машині.

## Owner surface

- Primary surface: локальне середовище розробника
- Governing skill: `sergeant-verify-before-done`

## Required context

- Docker Desktop має бути **запущений** — без нього `pnpm dev:db` падає з `ECONNREFUSED :5432`.
- `.env` у корені клону. Шаблон — [`.env.example`](../../../.env.example); мінімум для старту: `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY`.
- Клон має бути на потрібній гілці. **Перевір це першим** — trunk легко лишається на старій feature-гілці, і тоді ти дивишся не на те, що змержено.

## Кроки

### 1. Забрати зміни

```bash
cd D:\Sergeant; git checkout main; git pull
```

Перевіряти PR **до** мержу — краще: знайдена проблема лишається в PR-і, а не стає окремим фіксом поверх `main`.

```bash
cd D:\Sergeant; gh pr checkout <номер>
```

Повернутись — `git checkout main`.

### 2. Вирішити, чи потрібен `install`

Не запускати щоразу: на машині з 8 ГБ RAM повний install монорепи свопить.

```bash
git diff HEAD@{1} HEAD --name-only | Select-String "pnpm-lock.yaml|package.json"
```

Щось вивелось → `pnpm install --frozen-lockfile`. Порожньо → пропустити.

### 3. База й міграції

```bash
pnpm dev:db
```

Це `docker compose up -d` + прогін міграцій.

> **Не пропускай цей крок, навіть коли база вже піднята.** Міграції НЕ виконуються при старті сервера — `pnpm dev:server` просто запускає код, що очікує вже мігровану схему. Симптом «щойно змержив, і все зламалось» майже завжди означає непрогнану міграцію, а не зламаний мерж. Правило: **`git pull` і `pnpm dev:db` ходять парою.**

### 4. Сервер — окремий термінал

```bash
pnpm dev:server
```

`http://localhost:3000`.

### 5. Фронт — ще один термінал

```bash
pnpm dev:web
```

`http://localhost:5173`. Vite сам проксує `/api` на `:3000`, тому клієнт ходить відносними шляхами — так само, як у проді через edge-проксі. Нічого доналаштовувати не треба.

Разом: два постійні термінали + один разовий для бази.

### Інші поверхні

| Що піднімаєш         | Команда                                                        | Порт |
| -------------------- | -------------------------------------------------------------- | ---- |
| Лендінг              | `pnpm --filter @sergeant/landing dev`                          | 3100 |
| Мобільний застосунок | див. [`apps/mobile/README.md`](../../../apps/mobile/README.md) | —    |

Лендінг бекенду не потребує взагалі — він не робить жодного запиту до API.

### Публічний HTTPS для вебхуків

Telegram і Monobank не достукаються до `localhost`. Тунель:

```bash
cloudflared tunnel --url http://localhost:3000
```

Дає `https://xxx.trycloudflare.com`; далі [`scripts/telegram/setup-webhook.mjs`](../../../scripts/telegram/setup-webhook.mjs) приймає його як `API_BASE_URL`. URL змінюється при кожному запуску, тож вебхук доведеться перевстановлювати. Деталі — [`env-vars.md`](../../02-engineering/integrations/env-vars.md).

## Verification

- [ ] `git branch --show-current` показує очікувану гілку (а не стару feature-гілку)
- [ ] `pnpm dev:db` завершився без помилок — міграції накатані
- [ ] `http://localhost:3000/health` відповідає
- [ ] `http://localhost:5173` відкривається і запити до `/api/*` не дають 404
- [ ] Сценарій, заради якого піднімався застосунок, реально пройдено кліками

## Коли щось не піднімається

| Симптом                            | Причина                 | Дія                                            |
| ---------------------------------- | ----------------------- | ---------------------------------------------- |
| `ECONNREFUSED :5432`               | Docker не запущений     | Запустити Docker Desktop → `pnpm dev:db`       |
| `column ... does not exist`        | не прогнані міграції    | `pnpm dev:db`                                  |
| `Cannot find module @sergeant/...` | змінився лок-файл       | `pnpm install --frozen-lockfile`               |
| Фронт відкрився, API 404           | не запущений сервер     | окремий термінал з `pnpm dev:server`           |
| Порт зайнятий                      | процес із минулого разу | `Get-NetTCPConnection -LocalPort 3000` → зняти |
| Vitest падає з `(0 test)`          | не зібраний `db-schema` | `pnpm --filter @sergeant/db-schema build`      |

## Коли НЕ використовувати цей плейбук

- Потрібен не клікінг, а зелений гейт перед PR — це `pnpm check`, див. [`AGENTS.md § Verification before PR`](../../../AGENTS.md#verification-before-pr).
- Прод впав — це [`hotfix-prod-regression.md`](./hotfix-prod-regression.md), а не локальний запуск.
- Треба відтворити баг у CI, а не локально — [`fix-failing-ci.md`](./fix-failing-ci.md).

## Related

- [`hotfix-prod-regression.md`](./hotfix-prod-regression.md)
- [`fix-failing-ci.md`](./fix-failing-ci.md)
- [`docs/02-engineering/integrations/env-vars.md`](../../02-engineering/integrations/env-vars.md)
- Skill: `sergeant-verify-before-done`
