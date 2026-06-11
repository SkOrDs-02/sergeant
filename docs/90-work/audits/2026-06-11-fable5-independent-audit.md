# Independent Audit — Sergeant — 2026-06-11

> **Last validated:** 2026-06-11 by Fable 5 (independent auditor + executor). **Next review:** 2026-07-11.
> **Status:** Active
> **Методологія:** 53 агенти у 4 фазах — 8 розвідників (recon fan-out), 9 вимірних аудиторів, адверсарна верифікація CRITICAL/HIGH, синтез. `[VERIFIED]` = пройшло незалежну спробу спростування. Повна версія знахідок з evidence — у git-історії цього файлу (перша редакція); тут — стиснута версія після execute-хвилі 2026-06-11.

---

## Статус виконання (update 2026-06-11 EOD)

**Усі P0 + три P1 work-streams виконані й змерджені того ж дня:**

| WS       | PR                                                                                                                                                                           | Що зроблено                                                                                                                                                                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ws-01/05 | [#3501](https://github.com/Skords-01/Sergeant/pull/3501)                                                                                                                     | «€X» зник з /pricing (чесний no-price стан), trial-обіцянка прибрана з копірайту, валюта Free-тіра → ₴                                                                                                                                                                           |
| ws-03    | [#3502](https://github.com/Skords-01/Sergeant/pull/3502), [#3503](https://github.com/Skords-01/Sergeant/pull/3503)                                                           | shell-quote CVE override (розблоковано critical-audit gate), орфан finyk-barrel-и (Knip зелений). Auth-крах E2E був полагоджений #3491                                                                                                                                           |
| ws-04    | [#3500](https://github.com/Skords-01/Sergeant/pull/3500), [#3507](https://github.com/Skords-01/Sergeant/pull/3507), [#3512](https://github.com/Skords-01/Sergeant/pull/3512) | Integration-tier уперше бігає в CI. Перший прогін довів тезу аудиту: suite ніколи не працював (static import фіксував pool до підміни DATABASE_URL → 56×ECONNREFUSED). Після фіксу 83/85; 2 залишки — борг самих тестів (EXEMPT-список і LWW-tie припущення), тріажовано в #3512 |
| ws-06    | [#3499](https://github.com/Skords-01/Sergeant/pull/3499)                                                                                                                     | `SENTRY_DSN` → production hard-fail (дзеркало METRICS_TOKEN)                                                                                                                                                                                                                     |
| ws-07    | [#3498](https://github.com/Skords-01/Sergeant/pull/3498)                                                                                                                     | Live user ID + фінансова топологія прибрані з публічних доків                                                                                                                                                                                                                    |
| ws-08    | [#3509](https://github.com/Skords-01/Sergeant/pull/3509)                                                                                                                     | Internal billing переписано на канонічну `subscriptions` (було UPDATE неіснуючої таблиці → 500); `STRIPE_ENABLED` у Zod зі строгим парсером; boot-відмова при flag=true без Stripe-ключів                                                                                        |
| ws-09    | [#3510](https://github.com/Skords-01/Sergeant/pull/3510)                                                                                                                     | AGENTS.md routing більше не 404-ить (3 імені), фантомний tools/openclaw прибраний; pr-ledger ожив (workflow не робив install → падав на prettier 25 днів). Server max-lines (item 3) виявився вже полагодженим на main 06-09                                                     |
| ws-11    | [#3511](https://github.com/Skords-01/Sergeant/pull/3511)                                                                                                                     | localhost-origins прибрані з production trustedOrigins (NODE_ENV-gate); CI не бігає двічі на push у PR-гілку                                                                                                                                                                     |

**Лишаються founder-діями (без них revenue нема):** ФОП-реєстрація → live Stripe keys; рішення про ціну (потім pricing-PR + amend ADR-0051); `APPLE_*` env у Railway; UptimeRobot на `/health` (5 хв).

**Наступні агентські таски — § Action plan (Bucket B remaining) нижче.**

---

## Executive summary (стан на момент аудиту, 2026-06-11 ранок)

**Продукт.** Білінгові рейки збудовані й протестовані (Stripe checkout/portal/webhook + idempotency, paywall UI, лендинг EN/UK, legal-пакет, GDPR-export), але продукт не міг узяти першу гривню: «€X» на публічній сторінці цін, нерозв'язаний конфлікт ADR-0051 ($7/міс, Accepted) vs Phase-7 D3 (ціна TBD), невиконувана trial-обіцянка в копірайті, ФОП не зареєстрований, production URL відсутній. Теза 0010 «лишились тільки founder-блокери» була хибною. → _Кодові діри закриті 2026-06-11 (див. § Статус); лишились суто founder-блокери._

**Технічно.** Якість коду/security вище норми solo-founder (строгий TS, Pino-redaction, App-flow без PAT). Але сітка була вимкнена: main CI без жодного зеленого прогону з 2026-06-01 (200 runs), мерджі крізь червоні required checks (`enforce_admins=false`), integration-tier (sync-коректність + auth-bypass guard) не запускався ніде. → _Tier підключено, причини червоного main усунені; дисципліна «не мерджити крізь червоне» — за founder-ом._

**Операційно.** Меташар (593 доки, 158 скриптів/42k рядків, ~17–19% комітів) брехав сам собі: freshness-штампи на churn, фіктивний enforcement Rule #18, мертвий pr-ledger (#26), launch-checklist 0/56, AGENTS.md 404-ив для 3/12 спеціалістів. 4/8 ініціатив — agent-tooling при застряглому P0-revenue. → _Сигнальний шар полагоджено (routing, ledger); freshness-семантика і алокація зусиль — відкриті._

---

## Вердикти за вимірами

| #   | Вимір                             | Аудит | Після execute-хвилі                                                                                                          |
| --- | --------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | Revenue & product readiness       | 🔴    | 🟡 — код чесний і готовий; гейт суто founder (ціна, ФОП, Apple env)                                                          |
| 2   | Architecture & scalability        | 🟡    | 🟡 — syncV2 ok; лишився dual-writer (ws-10) і мізалокація меташару                                                           |
| 3   | Code quality & tech debt          | 🟡    | 🟡 — baselines без дедлайнів лишаються (react-hooks ~152, non-null ~96, i18n 243)                                            |
| 4   | Test coverage & CI                | 🔴    | 🟡 — integration-tier у CI (83/85→85/85 у #3512); coverage-floors і подвійна бухгалтерія порогів лишаються                   |
| 5   | Security posture                  | 🟡    | 🟡↑ — PII прибрано, localhost-origins загейчено, auth-bypass guard живий; session-guard вже зловив і підтвердив EXEMPT-дрейф |
| 6   | Observability & incident response | 🟡    | 🟡 — SENTRY_DSN hard-fail є; SLO/alert-стек досі папір, зовнішній uptime — founder-дія                                       |
| 7   | Outstanding audit debt            | 🟡    | 🟡 — ~124 verified outstanding; bookkeeping re-sync = ws-12                                                                  |
| 8   | Docs & governance health          | 🟡    | 🟡↑ — routing/ledger полагоджені; freshness-механіка міряє churn, launch-checklist мертвий                                   |
| 9   | Agent operating model             | 🟡    | 🟡 — enforcement-ядро працює; generic-скіли, merge-серіалізація, алокація — відкриті                                         |
| 10  | Existential risks                 | 🔴    | 🟡 — ризики 2 і 3 суттєво зрізані; ризик 1 (revenue-вікно) повністю у founder-руках                                          |

---

## Ключові верифіковані знахідки (стиснуто)

### Закриті 2026-06-11 ✅

- ✅ CRITICAL «€X» на публічній /pricing + конфлікт ADR-0051↔D3 → #3501 (interim no-price; фінальне число — founder)
- ✅ CRITICAL статус-репортинг 0010 хибний («founder-блокери only») → кодові діри закриті; checklist-гігієна → ws-12
- ✅ HIGH trial-обіцянка без імплементації → копірайт прибрано #3501 (імплементація trial — окреме product-рішення)
- ✅ CRITICAL main CI 0/200 зелених + мерджі крізь червоне → причини усунені (#3502 shell-quote, #3503 Knip, auth #3491); Docker-pull flake — re-run; `enforce_admins` — founder
- ✅ CRITICAL integration-tier не бігає ніде → #3500/#3507/#3512; suite справді був зламаний від народження — підтверджено першим прогоном
- ✅ HIGH auth-bypass guard ніколи не бігав → у CI; одразу окупився (зловив 6 не-exempt-нутих публічних роутів — усі intentional, задокументовано)
- ✅ HIGH internal billing → неіснуюча таблиця → #3509
- ✅ MEDIUM PII у публічному репо → #3498 (git-історія лишається; ротація тест-юзера — опційна founder-дія)
- ✅ MEDIUM SENTRY_DSN warn-only → #3499 hard-fail
- ✅ HIGH AGENTS.md routing 404 + фантомний openclaw → #3510
- ✅ HIGH Hard Rule #26 / pr-ledger мертвий 25 днів → #3510 (backfill ~600 PR — окреме рішення: forward-only чи повний регенерат)
- ✅ MEDIUM localhost у prod trustedOrigins; подвійний CI-прогін → #3511
- ✅ HIGH Rule #18 server max-lines відсутній → виявився полагодженим на main 2026-06-09 (`eslint.server.js:97-120` + allowlist)

### Відкриті (пріоритезовано — це і є черга роботи)

**P1 — наступні:**

- **ws-10 (L, web-ui):** dual-writer у фінансовому застосунку — AI-chat money-writes ідуть лише в localStorage повз канонічний sync-pipeline; server endpoint `POST /api/finyk/manual-expenses` існує з 06-06, клієнт його не викликає. `[VERIFIED HIGH]` Файли: `apps/web/src/core/lib/chatActions/finykActions*`, `apps/server/src/routes/finyk.ts`.
- **ws-12 (M, review-and-merge):** audit-bookkeeping re-sync — README-лічильники хибні в обидва боки (finyk 2 vs «≈13»), `_runner-report` ганяє triage по закритих пунктах, launch-readiness 0/56 під свіжим штампом; Scope-04 (Hub Settings) так і не аудитований.
- **ws-13 (S, tech-debt; ex-Bucket C, піднято):** видалити 9–10 generic-скілів нульової релевантності (temporal-python, CQRS/saga/event-sourcing тощо) + обгортку sergeant-backend-api — забруднюють routing, skills-lock (джерело main-breaking конфліктів) і поверхню Rule #22; в анамнезі — malicious imported skill.

**P2 — далі:**

- Freshness-механіка міряє churn, не review (`bump-last-validated` штампує будь-який staged .md; 53% корпусу проштамповано одним link-rewrite комітом). Потрібен дизайн: ручний validate-маркер vs churn-bump.
- SLO/alert-стек декоративний: 24 правила не вантажить жоден runtime; Alertmanager не існує; AGENTS.md посилається на фантомний enforcement `/health` p95. Мінімум: прибрати фантомні згадки + UptimeRobot (founder) + рішення про Grafana Cloud rules sync.
- Merge-серіалізація: ≥3 колізії номерів міграцій на main; GitHub merge queue або timestamp-префікси.
- Coverage-пороги двобухгалтерні (vitest-конфіги vs bash-масив у ci.yml) + web-floor 39%/32% проти цілі 50/40.
- `visual-regression.yml`: header бреше («every PR»), фактично лише workflow_dispatch.
- pnpm audit critical-gate без exception-path (audit-exceptions ledger не читається гейтом).
- Monobank `historyFetch.ts`/`privat.ts` без тестів (фінансовий backfill).
- Hard Rule #1 — конвенція без механізму: нема глобального pg `setTypeParser` для int8.
- Orphan-схема: `syncV2Types.ts` (0 імпортерів, цитує неіснуючий ADR), m047/m070-072 billing-орфани (two-phase DROP post-launch), db-schema pg-runner з розбіжним ledger-default.
- i18n: en.ts 215 рядків vs uk.ts 847; allowlist 243 файли без ratchet.
- ESLint baselines без дедлайнів: react-hooks ~152 off-порушень, ~96 non-null assertions (burn-down «2026-Q3» без enforcement дати).
- Postgres-skew tiers: Testcontainers pg16 vs CI service pg17.

---

## Top 3 existential risks (оновлено)

1. **Revenue-вікно закривається** — тепер на 100% founder-gated: ФОП (календарний лаг 5–10 днів), ціна, Apple env. Кодова частина воронки чесна і готова. _Сценарій смерті без дій: ще місяць полірування інфри → нуль revenue-сигналу → вигорання до першого платного._
2. **Сітка ввімкнена, але дисципліна не закріплена** — integration-tier і guard-и бігають, та `enforce_admins=false` досі дозволяє мерджити крізь червоне, а merge-серіалізації нема. _Мітигація: required checks → enforce, merge queue._
3. **Меташар досі дорожчий за сигнал** — freshness-churn, декоративний SLO-стек, generic-скіли, два мертві трекери (launch-checklist, audits README). _Мітигація: ws-12 + freshness-редизайн + skills-чистка (ws-13)._

---

## Workflow delegation spec (remaining)

```yaml
audit_date: 2026-06-11
updated: 2026-06-11T18:00+03:00
executor_note: >
  P0 hвиля і ws-08/09/11 виконані (див. § Статус виконання). Нижче — черга.
  Items marked requires_founder: true need a human decision first.

work_streams:
  - id: ws-02
    title: ФОП + Stripe live keys + APPLE_* env + UptimeRobot
    priority: P0
    requires_founder: true
    effort: M
    agent_hint: deploy
    description: >
      Чисті founder-дії (реєстрація, акаунти, env у Railway). Агент після
      цього: smoke checkout у test mode, верифікація Apple-кнопки на проді,
      задокументувати STRIPE_ENABLED-фліп.

  - id: ws-01b
    title: Фінальна ціна + amend ADR-0051
    priority: P0
    requires_founder: true
    effort: S
    agent_hint: web-ui
    description: >
      Founder називає число → агент вшиває в PricingPage (замість em dash),
      узгоджує uk/en копірайт, amend-ить або supersede-ить ADR-0051.

  - id: ws-10
    title: Закрити dual-writer (AI-chat money-writes повз sync)
    priority: P1
    requires_founder: false
    effort: L
    agent_hint: web-ui
    description: >
      Перевести finyk manual-expenses з chatActions з localStorage-only на
      існуючий POST /api/finyk/manual-expenses, щоб AI-написані грошові рядки
      входили в канонічний pipeline і переживали SQLite-overlay.
    acceptance_criteria:
      - create_transaction через чат → server-persisted рядок, видимий після reload
      - contract-тести переписані з localStorage-асертів

  - id: ws-12
    title: Audit-bookkeeping re-sync
    priority: P1
    requires_founder: false
    effort: M
    agent_hint: review-and-merge
    description: >
      Перерахувати README-лічильники з per-doc closure notes, регенерувати
      _runner-report, закрити phantom-open (ux-roast PR-1a), оживити
      launch-readiness checklist (відмітити зроблене), запланувати Scope-04.
    acceptance_criteria:
      - README-лічильники збігаються з per-doc реальністю (spot-check 3 доки)
      - _runner-report без пунктів з існуючими closure notes

  - id: ws-13
    title: Видалити generic-скіли + sergeant-backend-api wrapper
    priority: P1
    requires_founder: false
    effort: S
    agent_hint: tech-debt
    description: >
      Прибрати 9-10 імпортних скілів нульової релевантності стеку +
      обгортку; оновити skills-lock, catalog, trigger-evals.
    acceptance_criteria:
      - .agents/skills/ без temporal/cqrs/saga/event-store/microservices/projection/api-design/architecture-patterns
      - pnpm lint:skills зелений

  - id: ws-14
    title: Merge-серіалізація
    priority: P2
    requires_founder: true
    effort: S
    agent_hint: deploy
    description: >
      GitHub merge queue (рекомендовано; 1 клік founder-а в branch protection)
      або timestamp-префікси міграцій. Закриває клас «3 колізії номерів
      міграцій + CI-red-on-main після парних мерджів».

  - id: ws-15
    title: Observability мінімум
    priority: P2
    requires_founder: false
    effort: M
    agent_hint: deploy
    description: >
      Прибрати фантомні Alertmanager-згадки з AGENTS.md/apps/server/AGENTS.md,
      позначити SLO.md/runbook «wired today» vs «designed for later», рішення
      про Grafana Cloud rules sync або видалення мертвих 24 правил.
```

---

## Що founder-у робити далі

Без змін з ранкової версії: **ФОП сьогодні** (єдиний календарний блокер), **ціна** (одне число — і ws-01b закривається за годину), `APPLE_*` env, UptimeRobot (5 хв). Плюс одна нова дія на 1 клік: **увімкнути enforce для required checks / merge queue** — сітка тепер працює, хай вона і тримає.
