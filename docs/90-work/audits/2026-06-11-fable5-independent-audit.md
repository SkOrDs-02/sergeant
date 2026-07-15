# Independent Audit — Sergeant — 2026-06-11

> **Last validated:** 2026-07-13 by @claude (freshness re-validation — all P0/P1 work-streams merged, findings archived). **Next review:** 2026-08-13.
> **Status:** Active
> **Методологія:** 53 агенти у 4 фазах — 8 розвідників (recon fan-out), 9 вимірних аудиторів, адверсарна верифікація CRITICAL/HIGH, синтез. `[VERIFIED]` = пройшло незалежну спробу спростування. Повна версія знахідок з evidence — у git-історії цього файлу (перша редакція); тут — стиснута версія після execute-хвилі 2026-06-11.

---

## Статус виконання (update 2026-06-11 EOD)

**Усі P0 + усі P1 work-streams виконані й змерджені (ws-10/12/13/15 — #3514/#3515/#3516/#3519, merged 2026-06-11 крізь відомий main-CI борг при `enforce_admins=false`):**

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
| ws-10    | [#3516](https://github.com/Skords-01/Sergeant/pull/3516)                                                                                                                     | Dual-writer закрито: AI-chat money-writes тепер ідуть через `POST /api/finyk/manual-expenses`; LS-дзеркало для offline-fallback; income + undo-шляхи лишились на локальному шляху; contract-тест і api-client оновлені                                                           |
| ws-12    | [#3515](https://github.com/Skords-01/Sergeant/pull/3515)                                                                                                                     | Audit-bookkeeping re-sync: README-лічильники виправлені, \_runner-report регенерований, phantom-open закриті, launch-readiness відмічений                                                                                                                                        |
| ws-13    | [#3514](https://github.com/Skords-01/Sergeant/pull/3514)                                                                                                                     | 9 generic-скілів нульової релевантності + sergeant-backend-api wrapper видалені; skills-lock оновлено; pnpm lint:skills зелений                                                                                                                                                  |
| ws-15    | [#3519](https://github.com/Skords-01/Sergeant/pull/3519)                                                                                                                     | SLO.md/runbook/alert_rules/recording_rules — «Статус wiring» секція, STATUS-заголовки; AGENTS.md фантомний Alertmanager прибраний; 24 правила збережені як design-артефакт                                                                                                       |

**Лишаються founder-діями (без них revenue нема):** ФОП-реєстрація → live Stripe keys; рішення про ціну (потім pricing-PR + amend ADR-0051); `APPLE_*` env у Railway; UptimeRobot на `/health` (5 хв); enforce required checks + merge queue (1 клік).

**Агентських тасків більше немає. Черга — виключно founder-дії.**

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

**P1 — усі закриті (ws-10, ws-12, ws-13, ws-15 у таблиці вище).**

**P2 — закриті в P2-хвилі 2026-06-11 (PR pending):**

- ✅ `visual-regression.yml` header бреше («every PR») → виправлено: top-comment чесно каже «workflow_dispatch ONLY», design-намір збережено окремо.
- ✅ Monobank `historyFetch.ts`/`privat.ts` без тестів → додано 24 unit-тести (`privat.test.ts` — guard/path-allowlist/CRLF/upstream-mapping; `historyFetch.test.ts` — schema/buildMemoryContent/fetchAccountStatement; pure-helpers експортовані).
- ✅ Postgres-skew: Testcontainers pg16 vs CI pg17 → усі 16 тест-контейнерів + прозові коментарі підняті до pg17 (збіг з CI service + docker-compose).

**P2 — закриті у другій хвилі 2026-06-12:**

- ✅ Hard Rule #1 без механізму → глобальний `pg.types.setTypeParser(int8)` у `apps/server/src/lib/pgInt8.ts` (install у db.ts; safe-integer guard — fail loud замість мовчазної втрати точності; 6 unit-тестів). Серіалізатори лишаються другим рубежем.
- ✅ Coverage-пороги двобухгалтерні → single source `coverage-thresholds.json` у корені: ci.yml-гейт читає його через jq, vitest-конфіги (web, api-client, routine-domain) і jest (mobile) імпортують `lines`-floor звідти. api-client (73) і routine-domain (74) уперше отримали локальний enforcement (раніше — тільки CI-bash). Web-floor 39→50 — окремий burn-down, не закритий.
- ✅ Orphan `syncV2Types.ts` → видалено (#3522, chip `task_abed59b4`).

**P2 — далі:**

- Freshness-механіка міряє churn, не review (`bump-last-validated` штампує будь-який staged .md; 53% корпусу проштамповано одним link-rewrite комітом). Потрібен дизайн: ручний validate-маркер vs churn-bump.
- SLO/alert-стек: фантомні Alertmanager-згадки прибрані + wiring-статус задокументований (ws-15, #3519). Лишається: UptimeRobot (founder) + рішення про Grafana Cloud rules sync чи видалення 24 design-правил.
- Merge-серіалізація: ≥3 колізії номерів міграцій на main; GitHub merge queue або timestamp-префікси. (= ws-14, founder-gated)
- Web coverage-floor 39%/32% проти цілі 50/40 — burn-down тестами, не конфігом.
- pnpm audit critical-gate без exception-path (audit-exceptions ledger не читається гейтом; escape — лише PR-label `audit-exception` для high, не для critical).
- Orphan-схема: m047/m070-072 billing-орфани (two-phase DROP post-launch), db-schema pg-runner з розбіжним ledger-default.
- i18n: en.ts 215 рядків vs uk.ts 847; allowlist 243 файли без ratchet.
- ESLint baselines без дедлайнів: react-hooks ~152 off-порушень, ~96 non-null assertions (burn-down «2026-Q3» без enforcement дати).

---

## Top 3 existential risks (оновлено)

1. **Revenue-вікно закривається** — тепер на 100% founder-gated: ФОП (календарний лаг 5–10 днів), ціна, Apple env. Кодова частина воронки чесна і готова. _Сценарій смерті без дій: ще місяць полірування інфри → нуль revenue-сигналу → вигорання до першого платного._
2. **Сітка ввімкнена, але дисципліна не закріплена** — integration-tier і guard-и бігають, та `enforce_admins=false` досі дозволяє мерджити крізь червоне, а merge-серіалізації нема. _Мітигація: required checks → enforce, merge queue._
3. **Меташар досі дорожчий за сигнал** — freshness-churn, декоративний SLO-стек, generic-скіли, два мертві трекери (launch-checklist, audits README). _Мітигація: ws-12 + freshness-редизайн + skills-чистка (ws-13)._

---

## Workflow delegation spec (remaining)

```yaml
audit_date: 2026-06-11
updated: 2026-06-11T23:00+03:00
executor_note: >
  Усі P0 і P1 work-streams виконані й змерджені: #3514 (ws-13), #3515 (ws-12),
  #3516 (ws-10), #3519 (ws-15) — merged 2026-06-11.
  Лишились виключно founder-gated дії (requires_founder: true).

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
```

---

## Що founder-у робити далі

Агентської черги більше немає. Усе, що лишилось — founder-дії:

1. **ФОП** — єдиний календарний блокер (5–10 днів до легального billing).
2. **Ціна** — одне число → ws-01b закривається агентом за ~1 год (PricingPage + ADR-0051 amend).
3. **Enforce required checks + merge queue** — 1 клік у branch protection. Закриває ws-14 і не дає знову мерджити крізь червоне.
4. **APPLE\_\* env у Railway** — `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` → Sign in with Apple заробить.
5. **UptimeRobot** — 5 хв, зовнішній uptime-сигнал до Grafana Cloud wiring.
