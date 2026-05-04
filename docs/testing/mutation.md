# Mutation testing у Sergeant

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Active

## Чому це є

Coverage показує лише, **які рядки** виконалися в тестах, але не показує, **чи реально assertions ловлять регресії**. Можна мати 100% coverage і нульовий sense — тести просто прокликують функції без перевірок (див. [diagnostic 04 §7.3](../diagnostics/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md#73-bad-mutation-testing-не-використовується)).

Mutation testing запускає тести багато разів, щоразу штучно «псуючи» одну операцію в production-коді (наприклад `>` → `>=`, `&&` → `||`, видалити return, замінити рядок на пустий). Якщо тести **впали** — мутант "killed" (тести надійні). Якщо тести **пройшли** — мутант "survived" (тести не ловлять зміну поведінки → пробіл у coverage'і assertion-ів).

## Tooling

- **[Stryker](https://stryker-mutator.io/)** ([`@stryker-mutator/core@9.6+`](https://www.npmjs.com/package/@stryker-mutator/core)) — стандарт для JS/TS.
- **vitest-runner** (`@stryker-mutator/vitest-runner`) — Stryker запускає наш реальний vitest-suite після кожної мутації.
- Конфіг — JSON-файли біля `apps/web/`, `package.json`-script-и `test:mutation:*`.

## Що покрито (round-9 baseline)

| Модуль                                  | Конфіг                                 | Mutants | Score (baseline) |
| --------------------------------------- | -------------------------------------- | ------- | ---------------- |
| `apps/web/src/core/cloudSync/conflict/` | `apps/web/stryker.cloudSync.conf.json` | 109     | **87.16%**       |

Стартова точка — `cloudSync/conflict/` (LWW resolution, dirty-skip safety, version compare). Це pure-функціональне ядро split-brain-логіки, помилка в якому призводить до тихої втрати даних. Інші critical-модулі додаються наступними round-ами (див. [TODO](#наступні-критичні-модулі)).

## Як запустити локально

```bash
cd apps/web
pnpm test:mutation:cloudSync
```

Час: ~3 хв на M1 / ~3–5 хв на CI (4 паралельні раннери). HTML-звіт пишеться у `apps/web/reports/mutation/` (`mutation.html` за замовчуванням Stryker'а).

> Stryker створює sandbox-копію проєкту в `.stryker-tmp/` — це normal, gitignore його не треба явно додавати, патерн `**/.stryker-tmp/` уже є у root `.gitignore`.

## Threshold-и та CI

`stryker.cloudSync.conf.json` задає три рівні:

```json
"thresholds": {
  "high": 80,
  "low": 70,
  "break": 60
}
```

- ≥ 80 → ✅ "high" (target).
- 70–79 → ⚠️ "low" (acceptable, але треба покращувати).
- 60–69 → ⚠️ нижче "low" (warning).
- < 60 → ❌ "break" — Stryker exit-code != 0, CI падає.

GitHub Actions workflow: [`.github/workflows/mutation-testing.yml`](../../.github/workflows/mutation-testing.yml).
Запуски:

- **`workflow_dispatch`** — ручний запуск (Actions tab → Mutation testing → Run workflow). Можна передати кастомний config.
- **`schedule`** — щопонеділка о 04:00 UTC.
- **`pull_request`** — лише на PR-и, що чіпають `apps/web/src/core/cloudSync/conflict/**` або сам конфіг (paths-фільтр).

Артефакти (HTML-звіт + JSON) зберігаються 14 днів через `actions/upload-artifact`.

## Як читати survived-мутанти

Stryker логом виводить, наприклад:

```
[Survived] LogicalOperator
src/core/cloudSync/conflict/resolver.ts:79:7
```

Відкрий `apps/web/reports/mutation/mutation.html` — там по кожному файлу видно, які саме оператори/гілки зараз не покриті assertions. Дві типові причини:

1. **Тест викликає функцію, але assertion лише на одне поле** → мутант у іншій гілці виживає. Fix: додати assertion на ту саму гілку.
2. **Гілка взагалі не має тесту** → тоді fix-flow: додати тест-кейс, що покриває edge-condition (порожні дані, dirty-skip, mod без version).

> Наприклад, у baseline-і вижило 14 мутантів у `resolver.ts` у гілках `merge`-плану — можна підняти до 90%+ додавши явні assertions на `setVersions` та `skippedDirty` у вже існуючих тестах.

## Як додавати новий критичний модуль

1. Створи `apps/web/stryker.<module>.conf.json` за зразком `stryker.cloudSync.conf.json` (поміняй `mutate`, `tempDirName`, `htmlReporter.fileName`).
2. Додай npm-script у `apps/web/package.json`: `"test:mutation:<module>": "stryker run stryker.<module>.conf.json"`.
3. Додай job у `.github/workflows/mutation-testing.yml` — paste-and-rename copy з `cloudSync` job.
4. Додай рядок у таблицю «Що покрито» вище.
5. Перший прогон може дати 50–60%. Це нормально — підняти до threshold-у відбувається через **доповнення тестів**, а не через зниження threshold-у.

## Наступні критичні модулі

Кандидати (за пріоритетом — order = найбільший impact на silent data corruption):

1. `apps/web/src/core/cloudSync/queue/` (`offlineQueue.ts`, `deadLetter.ts`, `collectQueued.ts`) — queue-state-machine.
2. `apps/server/src/jobs/cloudSync*` — server-side LWW apply (потрібен Stryker setup для apps/server).
3. `apps/web/src/shared/lib/storage/` — після завершення burndown-у (роботою #6 рухається до 0 ключів) можна mutate-нути lwv-resolution helpers.
4. `apps/web/src/core/auth/` — `translateAuthError`, session-restore. Critical для security-помилок.

## Hard rule references

Цей doc оновлюється у тих самих PR-ах, що й конфіг або CI-workflow. Якщо додаєш нову table-row у «Що покрито» — додай і відповідний `test:mutation:<module>` script у `apps/web/package.json`.
