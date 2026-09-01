# Audits — каталог документів та статусів

> **Last validated:** 2026-07-29 by Codex (code-reconcile cleanup). **Next review:** 2027-08-18.
> **Status:** Active

> **Single source of truth → root [`AGENTS.md`](../../../AGENTS.md).** Цей файл —
> індекс аудиторських документів. Не дублюй repo policy: hard rules,
> performance budgets, governance — у `docs/04-governance/governance/`.

## Що тут лежить

| Шлях                                                                                                                                  | Призначення                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`_runner-report.md`](./_runner-report.md)                                                                                            | Останній triage digest audits-runner (Reference; шляхи всередині можуть вказувати на pre-archive локації — канон після 2026-07-20 = `archive/`)                                                                                                                                                                                                             |
| [`user-story-ledger.csv`](./user-story-ledger.csv)                                                                                    | CSV ledger user-story проходів                                                                                                                                                                                                                                                                                                                              |
| [`2026-07-21-design-audit.md`](./2026-07-21-design-audit.md)                                                                          | Дизайн-аудит apps/web (Reference): скоринг-baseline для наступної ітерації + уроки методології                                                                                                                                                                                                                                                              |
| [`2026-09-01-anti-slop-audit.md`](./2026-09-01-anti-slop-audit.md)                                                                    | **Active.** Анти-слоп аудит web / landing / mobile проти зовнішнього переліку tell-ів 2026 (18 позицій) + живий прохід у demo. 11 знахідок (F1–F11), 5 питань власнику (іскра як гліф AI, тренд-чипи, hero-форма модулів), slop-індекс 6/10; mobile не проходив атрактор 6                                                                                  |
| `product-knowledge-*.md` (6)                                                                                                          | **Reference.** Завершена тріангуляція founder ↔ доки ↔ код по `finyk`, `fizruk`, `hub-coach`, `nutrition`, `routine` + парасолька `overview`. Канони — [`docs/01-product/model/`](../../01-product/model/README.md); єдиний виконуваний наступник — [`../planning/product-knowledge-backlog.md`](../planning/product-knowledge-backlog.md)                  |
| [`finyk-analytics-research.md`](./finyk-analytics-research.md)                                                                        | **Reference.** Дослідження завершене; прийняті й відкладені рекомендації зведено в [`../planning/product-knowledge-backlog.md`](../planning/product-knowledge-backlog.md)                                                                                                                                                                                   |
| [`2026-07-24-cycle6-stage2-typography-core.md`](./2026-07-24-cycle6-stage2-typography-core.md)                                        | Цикл 6, стадія 2 (`core/**`) — Reference; **stage 3 (модульні поверхні) ще не виконано**, тому цикл лишається в активній зоні разом зі стадією 1                                                                                                                                                                                                            |
| [`2026-07-22-cycle6-typography-shared-ui.md`](./2026-07-22-cycle6-typography-shared-ui.md)                                            | Цикл 6, стадія 1 (`shared/components/ui`) — Reference                                                                                                                                                                                                                                                                                                       |
| [`2026-07-31-legal-docs-beta-readiness.md`](./2026-07-31-legal-docs-beta-readiness.md)                                                | **Active.** Аудит `apps/web/src/core/legal/**` проти чек-ліста Privacy Policy у [`04-launch-readiness.md § 1.1`](../../01-product/launch/business/04-launch-readiness.md). Дрейф субпроцесорів (9 задекларовано ↔ 18 у коді), хибні cookie-декларації, розрив explicit consent за GDPR Art. 9. Містить список «потребує юридичної перевірки»                |
| [`web-qa-pre-beta.md`](./web-qa-pre-beta.md)                                                                                          | **Active.** Браузерна QA `apps/web` перед закритою бетою: анонімний шлях + push-контур. Знайдені дефекти задокументовані, архітектурні винесені в backlog.                                                                                                                                                                                                  |
| [`2026-08-04-global-qa-findings.md`](./2026-08-04-global-qa-findings.md)                                                              | **Active.** Наскрізний QA-прохід по всіх поверхнях; супутні `2026-08-04-global-qa-plan.md` і `-progress.md` — робочі артефакти того самого прогону                                                                                                                                                                                                          |
| [`2026-08-04-test-coverage-depth-audit.md`](./2026-08-04-test-coverage-depth-audit.md)                                                | **Active.** Глибина тестового покриття, не відсоток. 6 із 7 рекомендацій закрито (звірка 2026-08-25, § «Статус рекомендацій»); №6 закрита з поправкою — сама рекомендація виявилась неточною                                                                                                                                                                |
| [`security-comprehensive-2026-08-04.md`](./security-comprehensive-2026-08-04.md)                                                      | **Active.** Периметр: CI-ланцюг постачання, CORS, rate-limit, сесії, білінг, ops-стек. 26 із 50 знахідок закрито кодом у тій самій гілці; решта — продуктові рішення або великі роботи                                                                                                                                                                      |
| [`ai-abuse-2026-08-05.md`](./ai-abuse-2026-08-05.md)                                                                                  | **Active.** Межі AI-поверхні: зловживання чатом поза продуктом, prompt-injection через клієнтський `context`, стеля витрат, durability AI-шляху. A1/A2/A4 закриті кодом; A5 (стеля) — перемикач env і продуктове рішення                                                                                                                                    |
| [`ai-pipeline-2026-08-05.md`](./ai-pipeline-2026-08-05.md)                                                                            | **Active.** Попередній прохід AI-пайплайном (B1–B30): B1 і B2 закриті кодом у гілці [#627](https://github.com/Skords-01/Sergeant/pull/627), решта відкрита. Не заміняється `ai-testing-2026-08-25` — той продовжує нумерацію з B31 і навмисно не дублює знахідки                                                                                            |
| [`ai-testing-2026-08-25.md`](./ai-testing-2026-08-25.md)                                                                              | **Active.** Повторний прохід AI-шаром через 20 днів після `ai-pipeline-2026-08-05`: статичні знахідки B31–B43 (rate-limit по IP, невалідований `tool_calls_raw`, SSE під компресією, дрейф моделі коуча, прайс без deepseek/glm) плюс B44–B47 з живого прогону стендів (стенд видає відсутність виклику за результат, зриви tool-стріму), стан телеметрії   |
| [`2026-08-05-external-critique-surface.md`](./2026-08-05-external-critique-surface.md)                                                | **Active.** Зовнішня критична поверхня: за що зачепиться юрист, регулятор, App Store review, журналіст чи розробник-рецензент. Маркетингові твердження проти архітектури, оферта з плейсхолдерами, opt-out аналітика, ліцензії третіх сторін (ODbL, monobank personal API), IAP, диспропорція доки/код                                                      |
| [`2026-08-05-orphaned-code-audit.md`](./2026-08-05-orphaned-code-audit.md)                                                            | **Active.** Масштабний аудит сиротілого коду по всьому монорепо: таблиці БД, API-ендпоінти, web/mobile/landing, скрипти й CI, реєстр аналітики проти живого PostHog. Класифікація «чому осиротіло» + пріоритезований план. Містить 5 знахідок не про мертвий код (скасування підписки при видаленні акаунта, сесійне вікно, HubChat, метрика, Mono-ротація) |
| [`2026-08-05-lost-commits-audit.md`](./2026-08-05-lost-commits-audit.md)                                                              | **Active.** Прохід по всіх 416 remote-гілках: що змерджено, що лягло поверх мерджу, що ніколи не доїхало до `main`. Головне — [PR #420](https://github.com/SkOrDs-02/sergeant/pull/420) (фікс тихої втрати routine-даних із чату) змерджено у stacked-базу, а не в `main`; плюс зламане створення PR у `pr-backlinks.yml` (Hard Rule #26)                   |
| [`2026-08-21-icons-and-emoji.md`](./2026-08-21-icons-and-emoji.md)                                                                    | **Active.** Аудит іконок і емодзі в UI за репортом тестувальника («в лімітах є іконки, а у витратах немає»). Веб і доменні пакети закрито: підписи категорій, рахунків і ролей боргу чисті, гліф бере `categoryIcons.ts` / `iconName`. Відкритий борг — мобільні емодзі-пікери Фініка (§5.1) і ~60 емодзі поза Фініком у `apps/mobile`                      |
| [Історичний archive](https://github.com/Skords-01/Sergeant/tree/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive) | Усі завершені / Closed / Draft-stub аудити й прожарки у Git history                                                                                                                                                                                                                                                                                         |

Новий аудит кладеться сюди як `YYYY-MM-DD-*.md`; після `Closed`/`Done` та merge evidence frozen-файл видаляється cleanup-комітом, а inbound references переводяться на permalink. Виняток — звіт, на який спирається **незавершений** цикл: baseline
`2026-07-21-design-audit.md` і стадії циклу 6 лишаються в корені, доки stage 3 не
закрито.

Станом на 2026-09-01 в активній зоні Active-аудити: `2026-09-01-anti-slop-audit.md`,
`2026-07-31-legal-docs-beta-readiness.md`,
`web-qa-pre-beta.md`, `security-comprehensive-2026-08-04.md`, `ai-abuse-2026-08-05.md`,
`ai-pipeline-2026-08-05.md`, `ai-testing-2026-08-25.md`,
`2026-08-04-global-qa-findings.md`, `2026-08-04-test-coverage-depth-audit.md`,
`2026-08-05-orphaned-code-audit.md`, `2026-08-05-lost-commits-audit.md`,
`2026-08-05-external-critique-surface.md`; решта — довідкові
артефакти, а виконувані залишки дедупліковані в planning backlog.

> Єдине джерело істини щодо статусів — таблиця вище і [`docs/open-work.md`](../../open-work.md)
> (генерується `pnpm docs:gen-open-work`). Цей абзац — навігаційне зведення;
> якщо він розійшовся з таблицею, права таблиця.

## Архів (зведення)

Повний історичний список — у [Git snapshot](https://github.com/Skords-01/Sergeant/tree/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive). Ключові групи:

- **Прожарки 2026-05** — `archive/2026-05-13-*-roast.md`, UX/revenue/security/testing/…
- **Page-audits** — `archive/2026-05-13-page-audit-*.md` + consolidated
- **Deep / synthesis** — `archive/2026-05-15-deep-audit-state-of-repo.md`, `archive/2026-05-03-web-deep-dive/`
- **Cleanup / fable5 / financial** — `archive/2026-06-08-codebase-cleanup-audit.md`, `archive/2026-06-11-fable5-independent-audit.md`, `archive/2026-06-28-financial-launch-monetization-audit.md`
- **Production-readiness / browser loops** — `archive/production-readiness-*.md`, `archive/*-browser-*.md`, `archive/user-story-loop.md`
- **Draft stubs** — `archive/2026-08-XX-sync-engine-roast.md`, `archive/2026-08-XX-openclaw-internal-roast.md`

**Batch 2026-07-20** (fast-forward, 90-day gate skipped): усі ще живі Closed/Done/Reference аудити перенесено з кореня в `archive/`. Деталі — [`archive/README.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive/README.md).

**Batch 2026-07-25** (розчистка активної зони): закриті дизайн-цикли 3–5 + супутні звіти — `archive/2026-07-22-cycle-3.md`, `archive/2026-07-22-cycle-4.md`, `archive/2026-07-22-cycle-5-typography.md`, `archive/2026-07-21-light-language.md`, `archive/2026-07-22-first-60-seconds.md`.

## Як читати

`Status` у хедери файлу — lifecycle: `Active` / `Draft` / `Closed` / `Archived` / `Reference` / `Scaffolded`.
`Implemented` / `Outstanding` — coarse-grain лічильники всередині документа (не дублюємо в цьому README після архівування).

## Process

- При злитті PR-у, що закриває recommendation з аудиту: оновити inline статус у самому документі.
- Коли документ повністю `Closed` / `Done` / `Reference` і більше не є living tracker — зафіксувати Outcome, merge evidence, потім видалити frozen-файл і перевести inbound-лінки на commit permalink.
- CI freshness-gate (`scripts/check-tech-debt-freshness.mjs`) форсить `Last validated:` на living tracker-ах; Git history не бере участі у freshness-gate.
- Для нових аудитів використовуй шаблон з [`archive/2026-04-28-ux-ui-audit.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive/2026-04-28-ux-ui-audit.md) (front-matter + Lifecycle-status + явний tracker).
