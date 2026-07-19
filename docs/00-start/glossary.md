# Глосарій — доменні й платформні терміни Sergeant

> **Last touched:** 2026-07-19 by @claude. **Next review:** 2026-10-17.
> **Status:** Active

> Один екран, щоб новачок (людина чи агент) розшифрував жаргон, який
> розкиданий по ADR, аудитах і коду. Не дублює policy — для hard rules і
> доменних інваріантів дивись [`AGENTS.md`](../../AGENTS.md) та
> [`domain-invariants.md`](../02-engineering/architecture/domain-invariants.md).
> Кожен термін лінкує canonical-джерело, де воно є.

## Продукт і модулі

| Термін                   | Що це                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Sergeant**             | Багатомодульний застосунок life-management. Working tagline: «Твій персональний хаб життя». Voice — друг, не drill-сержант. |
| **Finyk** (фінік)        | Модуль **фінансів** — витрати, бюджети, баланси. RQ-фабрика `finykKeys`.                                                    |
| **Fizruk** (фізрук)      | Модуль **фітнесу** — трекер тренувань, прогрес, вимірювання.                                                                |
| **Nutrition**            | Модуль **харчування** — прийоми їжі, калорії, uom-конверсії. RQ-фабрика `nutritionKeys`.                                    |
| **Routine**              | Модуль **звичок** — щоденні рутини, streak-и.                                                                               |
| **Insights / Strategic** | Крос-модульний шар стратегії/інсайтів. RQ-фабрика `strategicKeys`.                                                          |
| **Hub**                  | Дашборд-агрегатор усіх модулів (bento-картки, cross-module preview). RQ-фабрика `hubKeys`.                                  |

## AI-поверхні

| Термін          | Що це                                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HubChat**     | Web-**Асистент** для кінцевого користувача: tool-defs, executors, prompt cache, action cards. **HubChat ≠ OpenClaw.** Skill: `sergeant-hubchat`.                                                                          |
| **OpenClaw**    | Зовнішній **OpenClaw Gateway** (Telegram-бот / console agent) + `@sergeant/openclaw-plugin`, окремий Railway-сервіс. ADR → [`0055-openclaw-external-gateway.md`](../04-governance/adr/0055-openclaw-external-gateway.md). |
| **Gateway**     | Інстанс OpenClaw Gateway (open-source runtime), на якому крутиться Sergeant-плагін. Skill: `sergeant-openclaw`.                                                                                                           |
| **Memory Bank** | Local-first сховище AI-фактів про користувача. ADR → [`0021-memory-bank.md`](../04-governance/adr/0021-memory-bank.md).                                                                                                   |

## Дані, sync, час, гроші

| Термін                     | Що це                                                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **syncV2 / CloudSync v2**  | Op-log writer-runtime (`getSyncEngineWriter()`), `core/syncEngine/`. v1 знятий — ADR → [`0047-cloudsync-v1-410-gone.md`](../04-governance/adr/0047-cloudsync-v1-410-gone.md). |
| **kopiykas / minor units** | Канонічне представлення грошей — копійки як `number` (не float-гривні).                                                                                                       |
| **Kyiv tz / day key**      | Час завжди Europe/Kyiv. Day key — `YYYY-MM-DD` у Kyiv-local; тиждень починається з понеділка (ISO 8601).                                                                      |
| **Better Auth**            | Бібліотека auth/сесій. User ID — **opaque-рядок** (не UUID). ADR-0017.                                                                                                        |
| **RQ keys factory**        | Централізовані React-Query ключі в [`queryKeys.ts`](../../apps/web/src/shared/lib/api/queryKeys.ts). Inline-ключі заборонені (Hard Rule #2).                                  |
| **pgvector / RAG**         | Postgres-розширення для embeddings + retrieval-augmented generation у AI-пайплайні.                                                                                           |
| **RLS**                    | Row-Level Security у Postgres — ізоляція даних по користувачу на рівні БД.                                                                                                    |

## Платформа і пакети

| Термін                | Що це                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **apps/web**          | Frontend (React + Vite, PWA). Деплой — Vercel.                                                                         |
| **apps/server**       | Backend (Express, Drizzle). Деплой — Hetzner + Coolify (образ `ghcr.io/.../sergeant-api`, `Dockerfile.api`; ADR-0074). |
| **apps/mobile**       | Expo / React Native застосунок (NativeWind).                                                                           |
| **apps/mobile-shell** | Тонка нативна оболонка навколо web (Capacitor-стиль), MMKV-сховище.                                                    |
| **api-client**        | `@sergeant/api-client` — типізований HTTP-клієнт; контракт server ↔ client ↔ test (Hard Rule #3).                      |
| **EAS**               | Expo Application Services — білд/submit мобільних артефактів.                                                          |

## Процес і governance

| Термін               | Що це                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hard Rule**        | Незмінне правило з категорією в `hard-rules.json` (blocker-invariant / lint-enforced / active-initiative). Реєстр — у [`AGENTS.md`](../../AGENTS.md). |
| **ADR**              | Architecture Decision Record — фіксує рішення з контекстом і альтернативами («чому», не «як»).                                                        |
| **Playbook**         | Канонічний покроковий рецепт для повторюваної задачі. Каталог — [`playbooks/`](./playbooks/README.md).                                                |
| **Skill**            | `SKILL.md` під поверхню зміни в `.agents/skills/`. Старт — `sergeant-start-here`.                                                                     |
| **Initiative**       | Нумерована multi-PR програма з acceptance-критеріями і 90-денним вікном стабілізації.                                                                 |
| **Roast / Audit**    | Тематична прожарка/перевірка зрізу системи з P0/P1/P2-розбивкою. Каталог — `docs/90-work/audits/`.                                                    |
| **Trust badge**      | Авто-генерований індикатор свіжості доків у `docs/README.md` (`docs:gen-trust-badge`).                                                                |
| **Lifecycle marker** | `> **Status:**` + `Last validated` / `Next review` на кожному файлі/доку (Hard Rule #10).                                                             |
