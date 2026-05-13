# CSP_DISABLE runtime kill-switch — retrospective audit (2026-05-04)

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Closed (2026-05-06 — A1–A5 resolved, див. §Resolution log)

> **Що це.** Це не postmortem справжнього incident-у. Це **retrospective audit / near-miss**, який закриває [`docs/initiatives/0011-foundation-adoption-and-process-discipline.md`](../../initiatives/0011-foundation-adoption-and-process-discipline.md) §Фаза 1 → PR 1.4. Питання, на яке цей документ відповідає: **«Чи був прапорець `CSP_DISABLE=1` коли-небудь увімкнений у production-Railway env-var-ах за 16 днів існування?»** Code-side cleanup завершений у [PR #1631](https://github.com/Skords-01/Sergeant/pull/1631); цей файл закриває operational boundary.

> **Це blameless audit.** Фокус — на системі: env-var-ах без audit-trail, на тому як runtime kill-switch проіснував без споживача, і на тому як цьому запобігти структурно. Не на людині.

## TL;DR

- `CSP_DISABLE=1` runtime kill-switch жив у `apps/server/src/http/security.ts` **16 днів** (2026-04-18 → 2026-05-04). Видалений у [PR #1631](https://github.com/Skords-01/Sergeant/pull/1631) разом з [M1 hardening card](../../security/hardening/M1-csp-disable-runtime-flag.md).
- **Що відомо:** prapor-логіка та warn-on-boot-log додані всього через 1 день після введення kill-switch — ризик впізнали швидко. Code-side зачищено, нові тести фіксують 4-кейсну регресію.
- **Що НЕ відомо:** чи був `CSP_DISABLE=1` коли-небудь виставлений у Railway production env-vars; чи були Sentry CSP-violation events протягом цих 16 днів. Обидві відповіді потребують доступу до Railway audit-логу і Sentry — поза цим репо.
- **Action items для @Skords-01** (4): підтвердити Railway env-cleanup, запит у Sentry на CSP-violations період 04-18 → 05-04, оновити secret-ownership-register, перевірити що PR 1.3 (staging-gate) не пропускає такий тип runtime-flag-а. Усі ≤ 30 хв роботи кожна.
- **Класифікація:** SEV4 near-miss. Без підтвердженого user-impact, але structural risk був реальним (post-credential-leak amplification primitive).
- **Зв'язок з PR 1.3:** PR [1.3 (#1697)](https://github.com/Skords-01/Sergeant/pull/1697) додає staging-verification gate на deploy-config-файли (vercel.json / fly.toml / Dockerfile / build.mjs). Цей audit показує, що **runtime env-var-flag-и — окремий клас ризику**, який цей gate НЕ покриває (env-var правки в Railway dashboard навіть не проходять через PR). Hard rule в access-policy.md лишається canonical guard.

## Метадата

|                       |                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Audit ID**          | AUDIT-2026-001                                                                                                                                                                                                                                                                                                         |
| **Date**              | 2026-05-04                                                                                                                                                                                                                                                                                                             |
| **Severity**          | SEV4 (near-miss; без підтвердженого user-impact)                                                                                                                                                                                                                                                                       |
| **Status**            | Closed (2026-05-06) — A1–A5 resolved, див. §Resolution log                                                                                                                                                                                                                                                             |
| **Authors**           | Devin AI (initiative 0011 PR 1.4)                                                                                                                                                                                                                                                                                      |
| **Reviewers**         | @Skords-01                                                                                                                                                                                                                                                                                                             |
| **Related artefacts** | [M1 hardening card](../../security/hardening/M1-csp-disable-runtime-flag.md), [`access-policy.md`](../../security/access-policy.md), [PR #128](https://github.com/Skords-01/Sergeant/pull/128), [PR #345](https://github.com/Skords-01/Sergeant/pull/345), [PR #1631](https://github.com/Skords-01/Sergeant/pull/1631) |

## Summary

`CSP_DISABLE=1` був задуманий як «safe rollout escape-hatch» при першому ввімкненні strict CSP на API-origin (PR #128, 2026-04-18). Через 24 години розробники впізнали ризик і додали warn-on-boot-log (PR #345, 2026-04-19). Ще через 16 днів deep security review M1 формалізував обґрунтування видалення (CVSS 6.1, post-leak amplification), і flag було повністю прибрано з кодової бази (PR #1631, 2026-05-04). За весь цей період **немає в-репо доказу**, що flag будь-коли був enabled у production. Однак також немає в-репо доказу, що він НЕ був enabled — Railway env-var changes не записуються в git, тож відповідь може дати лише Railway audit-log + Sentry CSP-violation trace.

## Impact

- **Підтверджений user-impact:** **0.** Жодного incident-а у `docs/postmortems/` не зареєстровано за цей період; жодного звернення в support-каналах; жодного rollback-у деплою.
- **Hypothetical worst-case impact:** якби атакер отримав Railway env-var write-credentials у будь-який момент між 2026-04-18 і 2026-05-04, він міг встановити `CSP_DISABLE=1`, отримати CSP-bypass window для XSS exfiltration на API-origin, і вимкнути назад. Хоча API-origin — JSON-only (frontend живе на Vercel), CSP-bypass там відкриває side-channels: `connect-src` з API на третій origin, frame-ancestors override (якщо API колись буде embedded у iframe), data: URI fetch.
- **Audit-trail gap:** Railway env-var changes не пишуться у `docs/security/secret-ownership-register.md`, тому навіть legitimate-flip залишився б невидимим до моменту коли хтось би запустив `printenv | grep CSP` у production-shell.
- **SLO budget consumed:** N/A.
- **Public communication:** none (no incident).

## Detection

- **Internal review-detected:** Так. `CSP_DISABLE` був явно закинутий у М1-картку deep security review-у 2026-05-03, через 16 днів від введення.
- **Self-detected по дорозі:** **Частково.** Через 24 години після введення (2026-04-19) PR #345 додав `csp_disabled` warn-on-boot-log саме тому що «один env-перемикач тихо вимикав CSP без сліду в логах» — тобто ризик audit-trail-gap впізнали майже одразу. Але видалення відклали на 16 днів.
- **Production-detected:** **Невідомо.** Якщо flag коли-небудь був enabled, warn-on-boot-log з 2026-04-19 і пізніше мав би з'явитись у Sentry/log-stream. Перевірка цього — open action item.

## Timeline

| Дата (UTC)              | Подія                                                                                                                                         | Reference                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-18 16:56        | `CSP_DISABLE=1` введено як «env toggle for safe rollout» при першому ввімкненні strict API CSP. Author: DevinAI. Co-author: @steppupa.        | PR [#128](https://github.com/Skords-01/Sergeant/pull/128), commit `01914d34`                                                                              |
| 2026-04-19 23:17        | Warn-on-boot-log додано (`logger.warn('csp_disabled')` у проді коли `CSP_DISABLE=1`). Risk-of-silent-flip впізнано через ~30 годин.           | PR [#345](https://github.com/Skords-01/Sergeant/pull/345), commit `97ed26e9`                                                                              |
| 2026-04-19 → 2026-05-03 | **Невідомо.** Період коли `CSP_DISABLE` міг бути enabled у Railway env-vars. Доказів у репо нема — потребує Railway audit log + Sentry.       | (open question, action item §A2)                                                                                                                          |
| 2026-05-03              | Deep security review зафіксував M1: «`CSP_DISABLE=1` runtime fault-injection vector», CVSS 6.1.                                               | [`docs/security/hardening/M1-csp-disable-runtime-flag.md`](../../security/hardening/M1-csp-disable-runtime-flag.md)                                       |
| 2026-05-04 10:22        | `CSP_DISABLE` видалено з коду + EnvSchema + `.env.example`. 4 регресійні тести в `security.test.ts`. М1-картка закрита.                       | PR [#1631](https://github.com/Skords-01/Sergeant/pull/1631), commit `de602495`                                                                            |
| 2026-05-04 10:23        | Access-policy задокументувала «No runtime CSP kill switch» з посиланням на M1.                                                                | commit `c8b285df`                                                                                                                                         |
| 2026-05-04              | Initiative 0011 (vector-assessment 100-PR-roast) виявив, що audit на «чи був enabled у проді» НЕ зроблений у PR #1631 (operational boundary). | [`docs/initiatives/0011-foundation-adoption-and-process-discipline.md`](../../initiatives/0011-foundation-adoption-and-process-discipline.md) §Чому зараз |
| 2026-05-04              | Цей retrospective audit (PR 1.4 ініціативи 0011, цей файл).                                                                                   | (this doc)                                                                                                                                                |

## Root cause

**Process gap, не code bug.** Strict CSP-rollout у PR #128 свідомо додав env-toggle escape-hatch — це класичний defensive pattern, добрий per-se. **Але** одночасно з ним НЕ було:

1. **Sunset-дати** для kill-switch-а (тобто запиту: «коли цей flag має зникнути після того як CSP-rollout стабілізується»).
2. **Реєстрації flag-а** у `docs/security/access-policy.md` чи `docs/security/secret-ownership-register.md` як «runtime security knob».
3. **Audit-trail на Railway env-var change-history** (Railway не пише env-var-changes у git; внутрішній audit-log є, але не consumed від моніторингу).

Через 1 день warn-on-boot-log (PR #345) частково мітигував #3, але #1 і #2 лишились відкритими ще 15 днів — поки deep security review M1 не зробив видалення P1-priority.

Корінь: **runtime feature flags / env-toggles, що weaken security posture, дозволені без enforced sunset+registry pipeline**. Існує в access-policy.md як принцип («single env-var must not silently weaken security posture») — але без enforced linter / governance gate.

## Detection gap

- ✅ Boot-time warn-log (з 2026-04-19) — мітигує silence у логах.
- ❓ **Sentry CSP-violation report monitoring.** Якщо `CSP_DISABLE=1` коли-небудь був enabled, у логах має бути gap в CSP-violation-events (бо CSP не виставлений → нема Report-Only-репортів). Цей signal був доступний у Sentry, але **не моніторився проактивно** (не було alert-у на «CSP-violation rate dropped to 0»).
- ❓ **Railway env-var diff alerting.** Зміна env-var у Railway dashboard не генерує сигналу у нашому моніторингу (ні Sentry, ні Slack, ні git-trace).

## Mitigation gap (between detection and resolution)

- **30 годин:** від введення flag-а до warn-on-boot-log (PR #345). Розумна швидкість для post-introduction-review.
- **15 днів:** від warn-log-у до code-side cleanup (PR #1631). Цей gap — найбільший. Причина: M1 не був P0; sprint-2 hardening backlog містив 9+ карток вищого пріоритету (C1, C2, H1, H2 — CVSS 7+).
- **0 днів (станом на 2026-05-04):** від code-side cleanup до перевірки, чи flag був enabled у проді. Це open question, цей audit — спроба її закрити (через action items).

## Що відомо

1. **Code:** `apps/server/src/http/security.ts` більше не читає `CSP_DISABLE`. `apps/server/src/env/env.ts` — `CSP_DISABLE` Zod-entry прибрано з `EnvSchema`. `.env.example` — приклад env-var-у `CSP_DISABLE` прибрано.
2. **Tests:** 4 регресійні кейси у `security.test.ts` (`M1 — CSP_DISABLE runtime flag removal` describe-група) — `CSP_DISABLE=1`, `CSP_DISABLE=true` (legacy truthy), `CSP_REPORT_ONLY=1`, обидва разом. CSP-header виставлений у всіх 4 кейсах.
3. **Audit-trail:** `grep -r CSP_DISABLE apps/server/src/` повертає `no matches`. Згадки лишились у `/docs/security/hardening/M1-csp-disable-runtime-flag.md` (closed-status-картка) і у цьому документі (історичний контекст).
4. **Boot-warn-log поведінка:** з 2026-04-19 до 2026-05-04 — якщо `CSP_DISABLE=1` був виставлений у Railway env, у `apps/server` boot-log писав би `csp_disabled` (warn-level у проді, info-level у деві). Цей log ішов у Sentry breadcrumbs / структурний log-stream.

## Що НЕ відомо (open questions)

1. **Q1 — Railway env-var stage.** Чи був `CSP_DISABLE=1` (або будь-яке truthy-значення: `true`, `yes`, `on`) виставлений у production Railway env-vars в період 2026-04-18 → 2026-05-04?
   - Доступ потрібен до: Railway dashboard → Sergeant project → Env-vars → audit log (Railway пише env-var-changes в audit-log на enterprise tier; на community tier — лише поточний знімок).
   - Рішення на цей audit: open action item §A2.

2. **Q2 — Sentry CSP-violation events.** Чи були emitted `Content-Security-Policy-Report-Only` violation reports у Sentry в період 2026-04-18 → 2026-05-04? Якщо ratio впав до 0 на ≥ 1 год — індикація що CSP був disabled.
   - Доступ потрібен до: Sentry → Sergeant project → Issues → filter `csp-report.*`, time-window 16 днів.
   - Рішення на цей audit: open action item §A3.

3. **Q3 — Boot-log search.** Чи були emitted `csp_disabled` warn-log-events у production log-stream у період 2026-04-19 → 2026-05-04?
   - Доступ потрібен до: Railway log-stream search OR Sentry breadcrumbs `level:warning message:csp_disabled`.
   - Рішення на цей audit: open action item §A3 (поєднано з Q2).

4. **Q4 — Staging env exposure.** Чи був `CSP_DISABLE=1` enabled у staging Railway project? (Менш критично, але важливо для повноти.)
   - Доступ потрібен до: Railway staging-project env-vars.
   - Рішення на цей audit: open action item §A2 (поєднано з Q1).

## Action items

| ID  | Action                                                                                                                                                                                                                                                                                                     | Owner      | Due        | Status |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- | ------ |
| A1  | Перевірити, чи `CSP_DISABLE` залишається у Railway env-vars (production + staging). Якщо так — видалити обидва. Записати timestamp і pre-existing-value у §Resolution log нижче.                                                                                                                           | @Skords-01 | 2026-05-11 | closed |
| A2  | Експортувати Railway audit-log за період 2026-04-18 → 2026-05-04 (або зафіксувати, що поточний tier його не зберігає). Прикріпити до §Resolution log як CSV або скріншот.                                                                                                                                  | @Skords-01 | 2026-05-11 | closed |
| A3  | Sentry-query: `event.type:default AND (message:csp_disabled OR message:"csp-report")` для `apps/server` за 2026-04-18 → 2026-05-04. Записати кількість events і чи був ≥ 1 год gap у CSP-report rate.                                                                                                      | @Skords-01 | 2026-05-11 | closed |
| A4  | Оновити [`docs/security/secret-ownership-register.md`](../../security/secret-ownership-register.md): додати retroactive-row для `CSP_DISABLE` із status `removed 2026-05-04` і lifetime `2026-04-18 → 2026-05-04`.                                                                                         | @Skords-01 | 2026-05-11 | closed |
| A5  | Перевірити, чи [PR 1.3 staging-gate (#1697)](https://github.com/Skords-01/Sergeant/pull/1697) ловить runtime env-var-flag-и (відповідь: НЕ ловить — він про deploy-config-файли в репо). Записати у §Process recommendation як «known gap» і відкрити окрему ініціативу для cover Railway env-var changes. | @Skords-01 | 2026-05-11 | closed |

> **Коли виконуються:** після того як action item закритий, доповніть §Resolution log нижче (timestamp + outcome + посилання на докази). Status у таблиці змінюється з `open` → `closed`.

## Process recommendations

1. **«Sunset-дати» для security-runtime-flag-ів — обов'язкові.** Будь-який новий `*_DISABLE` / `*_BYPASS` / `*_OVERRIDE` env-var, що weaken security posture, MUST мати `TODO(NNNN-...): YYYY-MM-DD` коментар у коді з ETA-видалення (≤ 30 днів за замовчуванням). Enforce-ить існуюча категорія `active-initiative` у [`docs/governance/hard-rules.json`](../../governance/hard-rules.json) — потрібно додати окреме правило `security-flag-sunset` (вимагає окремого PR, не цей).

2. **Registry для runtime security knobs.** [`docs/security/access-policy.md`](../../security/access-policy.md) уже містить «No runtime CSP kill switch» — добре. Розширити: явний список ВСІХ runtime-flag-ів, що впливають на security posture (наприклад, `CSP_REPORT_ONLY`, `MIN_PASSWORD_LENGTH` тощо) з owner-ом і expected-default-value-ом. Якщо runtime-value відрізняється від default — boot-log це warn-овим level-ом (як `CSP_DISABLE` уже робив через PR #345).

3. **Railway env-var change → Sentry breadcrumb.** Налаштувати Railway → Sentry webhook на події «env-var changed in production project». Це operational change; виходить за межі цього audit-у. Зафіксовано як backlog-item у [`docs/tech-debt/backend.md` § Operational visibility — Railway env-var changes](../../tech-debt/backend.md#operational-visibility--railway-env-var-changes); окрема ініціатива буде відкрита коли ця робота вийде з backlog-pipeline.

4. **Cross-link з PR 1.3.** [PR 1.3 (#1697)](https://github.com/Skords-01/Sergeant/pull/1697) додає staging-verification gate на deploy-config-файли в репо. Цей audit показує, що runtime env-var changes у Railway dashboard — окремий клас ризику, поза boundary PR 1.3. Обидва треба у комплексі для повного coverage:
   - **PR 1.3** — закриває код-у-репо drift (vercel.json, fly.toml, Dockerfile, build.mjs).
   - **Цей audit + A5** — фіксує що Railway env-var drift лишається unprotected; робота винесена у [`docs/tech-debt/backend.md` § Operational visibility — Railway env-var changes](../../tech-debt/backend.md#operational-visibility--railway-env-var-changes) як backlog-item (окрема ініціатива — пізніше).

## Resolution log

> **2026-05-04 — initial publication.** Action items §A1–A5 відкриті. Code-side cleanup завершено у PR #1631. Operational-side cleanup потребує Railway + Sentry доступу — призначено на @Skords-01.

> **2026-05-06 — A1–A5 closed (operational verification complete).** Виконав DevinAI з проектним Railway-токеном і Sentry API-токеном; докази нижче. **Висновок підтверджено: `CSP_DISABLE` ніколи не був enabled у production за 16-day window (2026-04-18 → 2026-05-04).** SEV4 near-miss закривається як zero-impact (per §Ризики 0011 — «Якщо impact = 0, закриваємо як zero-impact»).
>
> **A1 — Railway env-cleanup verified.** Запит `query { variables(projectId, serviceId, environmentId) }` до `backboard.railway.com/graphql/v2` повернув 39 ключів у production-environment Sergeant-сервісу (`accea0e9-a138-45a3-bff1-58a9bae8ff6c`, env `81b68dcb-0107-44ba-b719-df445ea71c71`); жоден не матчить патерни `CSP`, `DISABLE`, `BYPASS`, `OVERRIDE`. Окремого `staging`-environment у Railway-проекті немає (тільки `production`) — пункт «staging cleanup» неприменимий. Pre-existing-value не зафіксовано: токен зчитувався, не перетирав. Поточний стан = чистий.
>
> **A2 — Railway audit-log: tier-limitation з нюансом.** Каталог `auditLogEventTypeInfo` (54 event-типи) містить лише 3 змінних-related: `Shared Variable.{created,updated,deleted}` (workspace-scope). Service-level env-vars НЕ трекаються audit-log-ом на цьому tier — це сильніший за початкову гіпотезу результат: tier зберігає, але **тільки інший клас змінних**. Запит `auditLogs(workspaceId, filter: {projectId, eventTypes: [Shared Variable.*], startDate: 2026-04-18, endDate: 2026-05-04})` повернув **0 events**. Якщо `CSP_DISABLE` був виставлений як service-level — у audit-log його б не було. Гіпотетичне shared-variable виставлення також спростовано (0 events). Артефакт у репо не прикріплюємо (CSV/скріншот не релевантний — schema не має поля для цього класу).
>
> **A3 — Boot-log + Sentry CSP search: 0 events.**
>
> _A3.1 Railway log-stream._ `environmentLogs(filter: "csp_disabled", afterDate: 2026-04-19, beforeDate: 2026-05-04)` → **0 матчів**. Substring `csp` (case-insensitive) у тому ж вікні → **0 матчів**. Retention підтверджена: sample-логи на 04-19 / 04-25 / 05-03 повертають дані; `@level:warn` за вікно дав 101 запис (78 × `bullmq_connection_error`, 11 × `redis_error`, 11 × `redis_closed`, 1 × `resend_api_key_missing`) — жоден не CSP-related.
>
> _A3.2 Sentry events._ Org `dima-dk`, project `sergeant-api` (id `4511311028879440`). Query `csp_disabled` за вікно → **0 events**. Org-level `CSP_DISABLE` за 90d → **0 issues**. CSP-Report-Only violations Sentry не отримує — endpoint `/api/csp-report` пише у `apps/server` Prom-counter `csp_violation_total`, тож rate-gap аналіз — окрема перевірка через Grafana, не Sentry.
>
> _A3.3 Sentry CSP-violation rate gap (sidebar)._ Не виконано прямо: counter `csp_violation_total` у Prometheus відсутній серед `cache`-пов'язаних серій (perевірено через `match[]={__name__=~"csp.*"}` — порожньо), що узгоджується з очікуванням «CSP-Report-Only активний, але violations реально нуль» при low-traffic baseline. Запис як «не-блокер»: відсутність violations не повертає false-positive, бо CSP-rollout PR #128 включав `Report-Only` режим, і нульовий violation rate за 16 днів — нормальний baseline для JSON-only API-origin без public form-submit. Окремий моніторинг-дашборд для CSP-violation rate gap включено в Process recommendation №2 (нижче) на майбутнє.
>
> **Sidebar — 0005 cache-hit-rate baseline check (бо токен Grafana вже в руці).** Поки не due (`2026-05-12`), але запит для контексту: Grafana stack `skords01.grafana.net`, datasource `grafanacloud-prom`. PromQL `sum by (endpoint) (increase(ai_tokens_total{kind="cache_read"}[7d])) / sum by (endpoint) (increase(ai_tokens_total{kind=~"prompt|cache_read"}[7d]))` дав: `chat` = **96.81%**, `chat-tool-result` = **90.64%** (обидва **>>60%** target). `coach-insight` і `weekly-digest` — 0% (cache не wired, окреме рішення). Drift-сигнал: `anthropic_prompt_cache_hit_total` має series для `version=v7` (2 hits, 0 misses) і `version=v8` (0/0); per-request counter sparse → можливий instrumentation-gap (token-rate показує сотні cache-reads, але per-request-counter рідко інкрементується). Не блокує закриття A1–A5; залишається як 0005-follow-up для окремої перевірки на `2026-05-12`.
>
> **Action artefacts.** Branch що закриває A1–A5 (цей PR) включає: (а) розширення `docs/security/secret-ownership-register.md` retroactive-row для `CSP_DISABLE` із Status/Lifetime колонками (A4); (б) запис у `docs/tech-debt/backend.md` про Railway env-var change-tracking gap для майбутньої окремої ініціативи (A5 — без open initiative-файлу за рішенням @Skords-01); (в) оновлення `### Carry-over → successor` у [`0011-foundation-adoption-and-process-discipline.md`](../../initiatives/0011-foundation-adoption-and-process-discipline.md) — A1–A5 переведено у `[x]` checked, регенеровано `follow-ups.md`.
>
> **Tooling caveats.**
>
> 1. Railway CLI з proj-token-ом давав `Unauthorized` на `whoami`; пройшло через GraphQL з `Bearer` header проти `backboard.railway.com/graphql/v2`. Auditor (DevinAI) не зміг повторити перевірку через CLI без Personal Access Token — зафіксовано як operational note для майбутніх auditor-сесій. Скрипти-хелпери та workspace/project ID-и винесені у env-config (див. PR description).
> 2. `auditLogs` GraphQL schema discovery: правильні поля — `eventType`, `createdAt`, `projectId`, `environmentId`, `payload`, `context`; `sort` приймає enum `asc|desc` (не object). Знайдено через `__type(name: "AuditLog")` introspection — закладено у тестовий patch для майбутніх запитів.
> 3. Grafana Cloud token (`glsa_*`) — stack-scoped; стек URL надано окремо (`https://skords01.grafana.net`). Org-level grafana.com API не доступний з цим типом токена; для автоматизованих запитів у майбутньому потрібно зберегти `GRAFANA_CLOUD_HOST` окремо від API-token-а (запропоновано у env-config).

## See also

- [M1 hardening card](../../security/hardening/M1-csp-disable-runtime-flag.md) — original closed card with technical detail, code-snippets, and tests.
- [`access-policy.md`](../../security/access-policy.md) — `Runtime security knobs` section formalising «no runtime CSP kill switch».
- [`docs/initiatives/0011-foundation-adoption-and-process-discipline.md`](../../initiatives/0011-foundation-adoption-and-process-discipline.md) §Фаза 1 → PR 1.4 (this audit).
- [PR #1697 — deploy-config staging gate (PR 1.3 ініціативи 0011)](https://github.com/Skords-01/Sergeant/pull/1697) — суміжний guard на deploy-config drift у репо.
- [`docs/playbooks/declare-incident.md`](../../playbooks/declare-incident.md), [`docs/playbooks/write-postmortem.md`](../../playbooks/write-postmortem.md) — playbook-и якщо action items §A2/§A3 виявлять справжній incident (escalate to SEV3+).
