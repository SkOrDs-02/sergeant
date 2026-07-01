<!-- AUTO-GENERATED: false - authored execution log -->

# Browser user journey execution log — 2026-07-01

> **Last validated:** 2026-07-01 by @claude. **Next review:** 2026-07-15.
> **Status:** Active

Canonical loop: [`browser-user-journey-loop.md`](./browser-user-journey-loop.md).
Попередній прогін: [`browser-user-journey-execution-2026-06-30.md`](./browser-user-journey-execution-2026-06-30.md).

## Мета прогону

Підняти покриття ledger-рядків з cold-load до **action-level** browser proof:
глибокі Playwright-флоу для core-модулів (Група B), справжній live-стрім
HubChat (Група C — розблоковано провайдерським ключем у env, поза репо),
offline/PWA (Група D). Кожен фейл — класифікація product / UX / harness / env,
стабільний `id`, fix або documented exception, post-fix retest.

## Контекст запуску

- Середовище: керований remote-контейнер (Linux), Chromium передвстановлений
  (`/opt/pw-browsers`), локальний PostgreSQL 16.13 (без Docker-демона —
  docker-compose шлях недоступний, локальний PG його заміняє).
- Гілка: `claude/top-5-complex-tasks-3hjxfd`.
- База: `postgresql://hub:hub@127.0.0.1:5432/hub` (дефолт smoke-конфіга).
- Секрети: провайдерський ключ живе лише в env серверного процесу на час
  live-проб; у файли репо, логи й Playwright-артефакти не потрапляє.

## Оркестрація

Гібрид за патерном `web-ux-cycle`: read-only фан-аут (gap-мапа ledger↔спеки +
драфти нових спек per-module) — паралельними агентами; прогони тестів —
серіалізовано в основній сесії (один локальний сервер+БД, паралельні прогони
конфліктували б).

## Evidence log

| Час (Kyiv)                       | Група | Команда | Результат | Знахідки | Наступний крок |
| -------------------------------- | ----- | ------- | --------- | -------- | -------------- |
| _(заповнюється по ходу прогону)_ |       |         |           |          |                |

## Знахідки

### BRJ2-001: дубльований номер ADR-0068 ламає `docs:gen-graph`

- **Type:** doc-drift (pre-existing на `main`, не спричинено цим прогоном).
- **Repro:** `pnpm docs:gen-graph` → `node adr:0068: duplicate`, exit 1.
- **Причина:** у `docs/04-governance/adr/` співіснують
  `0068-harness-versioning.md` і `0068-pricing-v4-uah-reverse-trial.md`
  (harness-rollout 2026-06-29 зайняв номер, який уже був виданий pricing-ADR).
- **Fix:** не в скоупі цього прогону — перенумерація ADR потребує рішення
  власника (ADR-id стабільні й розлінковані по репо). Кандидат: перенумерувати
  молодший за датою файл у `0070` + поправити зворотні посилання.
- **Наслідок для цього прогону:** knowledge-graph не перегенеровано;
  `open-work.md` і `today.md` перегенеровані штатно.

_(далі — формат: `BRJ2-NNN`, тип, репро, fix/exception, retest)_

## Підсумок

_(заповнюється при закритті прогону)_
