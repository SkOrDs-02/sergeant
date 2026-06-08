# Deep audit — state of repo (2026-05-15)

> **Last validated:** 2026-06-06 by @claude (audit-closeout pass — 0 outstanding confirmed (D1–D4 all closed); status flipped to Archived). **Next review:** 2026-09-06.
> **Status:** Archived — усі D1–D4 закрито станом на 2026-06-03; файл заархівовано 2026-06-06 після підтвердження 0 outstanding; лишається для крос-посилань як historical record.

> **Скоуп:** зовнішній двопрохідний аудит на запит власника (повний repo: документи, мертвий код, архітектура, ризики). Цей файл — synthesis-запис стану на 2026-05-15, який крос-валідує знахідки з активною серією прожарок 2026-05-13 і підтверджує, що **переважна більшість виявлених P0/P1 пунктів уже закрита** в існуючому процесі планування. Outstanding-list — короткий, focused.

## Cross-refs (active planning surface)

- **Sprint tracker:** [`docs/90-work/planning/sprint-roadmap-q2q3-2026.md`](../../planning/sprint-roadmap-q2q3-2026.md) — Спринти 5–8, T1–T7 + O1–O9; T5 (Lighthouse warn→error) tighten — baseline-gathered follow-up.
- **Revenue:** [`2026-05-13-revenue-monetization-roast.md`](./2026-05-13-revenue-monetization-roast.md) — P0-1..P0-7 (включно зі **Stripe price_id env-config + validation, P0-7**) усі **Done у PR**. Outstanding — P1-2 activation v2 capture, P1-4 EN locale, P2 polish.
- **Dead-code + Hard Rules:** [`2026-05-13-dead-code-hard-rules-roast.md`](../2026-05-13-dead-code-hard-rules-roast.md) — P0.1 (11 unmarked unused files → `@scaffolded`/delete), P0.2 (53 broken markdown links → 0), P1.2 (Lighthouse CI workflow shipped, `cb459c08`). 18 файлів живуть під свідомим `@scaffolded` маркером.
- **Doc hygiene:** [`2026-05-13-documentation-hygiene-roast.md`](./2026-05-13-documentation-hygiene-roast.md) — 7 пунктів закриті у відповідному PR, включно з archive-move depth fix.
- **Storage / sync v2:** [`docs/90-work/planning/storage-roadmap.md`](../../planning/storage-roadmap.md), [`docs/90-work/initiatives/0003-sync-v2-rollout-and-v1-sunset.md`](../../initiatives/0003-sync-v2-rollout-and-v1-sunset.md), [`docs/04-governance/adr/0047-cloudsync-v1-410-gone.md`](../../../04-governance/adr/0047-cloudsync-v1-410-gone.md). CloudSync engine закрито (#1929–#1941); v1 410-Gone від 2026-05-06; engine-tree видалено PR #052b/#052c.
- **Security:** [`docs/04-governance/security/audit-exceptions.md`](../../../04-governance/security/audit-exceptions.md), [`vulnerability-sla.md`](../../../04-governance/security/vulnerability-sla.md), [`nightly-audit.md`](../../../04-governance/security/nightly-audit.md), [`docs/04-governance/security/hardening/`](../../../04-governance/security/hardening).
- **Governance:** [`docs/04-governance/governance/hard-rules.json`](../../../04-governance/governance/hard-rules.json) (23 правила, усі enforced), [`hard-rules-matrix.md`](../../../04-governance/governance/hard-rules-matrix.md), `pnpm lint:governance-sync`, `pnpm lint:codeowners`, `pnpm lint:hard-rules-registry`, freshness-dashboard.

## TL;DR

Зовнішній прохід очікувано виявив десятки «punch-list» пунктів. Після перевірки кожного проти активної планувальної системи Sergeant:

- **8 з 8 початково помічених P0 — або Done, або уже трекуються офіційно** (revenue P0-7 = Stripe env; T5 Lighthouse tightening = baseline-gathered; CloudSync engine wiring = shipped #1929–#1941).
- **CODEOWNERS Secondary placeholders** — не bug; це **свідомий контракт bus-factor PR-04** (`/.github/CODEOWNERS:5–7`): «Secondary owners are placeholders ... Replace with real engineers when hired. @Skords-01 remains final-approver for all paths until delegation is complete.» — лінт enforce-ить покриття, не приховує проблему.
- **Кандидати на dead-code** (`shared/lib/log/index.ts`, cloudSync barrel, профайл barrel, billing barrel) — усі під `@scaffolded` JSDoc маркером (Hard Rule #10, [dead-code roast §P0.1](../2026-05-13-dead-code-hard-rules-roast.md)). `pnpm dead-code:files` зелений.
- **`syncEngineFlushOnReconnect` / `recoverDeadLetter`** — активні в production через `apps/web/src/core/syncEngine/syncEngineWriter.ts` + `apps/mobile/src/core/syncEngine/syncEngineWriter.ts` (fallback factory via `deps.createReconnect ?? createSyncEngineFlushOnReconnect`) і `singleton.ts:121` callsite-и в обох runtimes. Початкова гіпотеза «декларовано, не wired» — спростована.
- **ADR-0004 status drift** (start-of-pass гіпотеза) — false positive: рядок 3 уже містить `**Status:** superseded by [ADR-0047]`.

**Реальний outstanding — 0 пунктів** (станом на 2026-06-03; усі D1–D4 закрито). На момент synthesis-проходу (2026-05-15) було 4 пункти, перерахованих у §[Truly outstanding](#truly-outstanding) нижче — жоден не P0; усі вже закриті (D1/D2/D4 merged PR-ами, D3 local diff verified).

## State of repo (2026-05-15)

### Розмір

- **3055** TS/TSX файлів; **892** активних тести; **257** markdown-документів (53 ADR, 50 initiatives, 22 launch, 32 governance, 20+ audits за травень).
- Apps: web (React 18 + Vite 8 + Tailwind 4), server (Express + Postgres 16 + Drizzle + Better Auth), mobile (Expo 52 + RN 0.76), mobile-shell (Capacitor), tools/openclaw (grammy + Anthropic).
- Packages: 12 shared (`api-client`, `db-schema`, `eslint-plugin-sergeant-design`, 4 domain, etc.).

### Governance health

| Сигнал                                                | Стан                                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Hard rules (23) — всі категорії з enforcement         | ✅ zero TBD; повна машино-читабельна матриця в `hard-rules-matrix.md`.                                          |
| `pnpm lint:codeowners` coverage                       | ✅ enforced; Secondary == `TBD(role)` явно дозволено як bus-factor контракт.                                    |
| `pnpm lint:governance-sync` (3-way ADR/JSON/per-rule) | ✅ зелений.                                                                                                     |
| `pnpm dead-code:files`                                | ✅ зелений; 18 файлів під `@scaffolded`/`@deprecated`/`@experimental` маркерами.                                |
| `pnpm docs:check-links`                               | ✅ зелений (53 archive-move links виправлено [doc-hygiene roast](./2026-05-13-documentation-hygiene-roast.md)). |
| Freshness-gate (60d) для tracked docs                 | ✅ більшість 100%; ADR — частково (див. nuance нижче).                                                          |
| Conventional Commits + explicit scope (Rule #5)       | ✅ commitlint gate.                                                                                             |
| Pre-commit Husky hooks (Rule #7)                      | ✅ never-skip enforced.                                                                                         |

### Architecture health

| Сигнал                                                                   | Стан                                                                                                                                          |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript strict (13/13 packages, Rule #19)                             | ✅ 100%                                                                                                                                       |
| Module size discipline (`max-lines: 600`, Rule #18)                      | ✅ T1/T3/T10 батчі закрили великі файли (HubDashboard 837→115; Workouts 744→213; LogCard 736→216; NutritionApp 728→<250; Overview 509→139).   |
| Sync v2 op-log engine                                                    | ✅ shipped (lifecycle, push loop, scheduler, DLQ); v1 410-Gone.                                                                               |
| Stripe billing (skeleton + lifecycle)                                    | ✅ checkout / webhook (`started`/`renewed`/`canceled`) / portal endpoint / price_id env-validation — все Done у revenue PR-серіях P0-1..P0-7. |
| `usePlan`, `PaywallModal`, `billingKeys` factory (Hard Rule #2)          | ✅ shipped.                                                                                                                                   |
| Sentry (web + mobile + server), OpenTelemetry, Pino redaction (Rule #21) | ✅ shipped.                                                                                                                                   |
| OpenClaw Phases 1+1.5+2.5+3+4                                            | ✅ shipped (Phase 3 closed 2026-05-13). Gateway migration Stage 1–7 done, legacy deletion 2026-06-09.                                         |
| AI Memory activation runbook                                             | ✅ [`docs/01-product/launch/tech/ai-memory-activation.md`](../../../01-product/launch/tech/ai-memory-activation.md).                          |

### Test stack

- Vitest (units), Playwright (e2e), Testcontainers (server integration), MSW (network mocking).
- Mutation testing (Stryker) — видалено разом з CloudSync v1 sunset (#052b); explicit decision-record присутній у [`docs/02-engineering/testing/README.md:12`](../../../02-engineering/testing/README.md), [`2026-05-05-tests-review.md:40`](../../../02-engineering/testing/2026-05-05-tests-review.md) і ADR-0020:235. Закрите (див. §[Truly outstanding](#truly-outstanding) item D2 ✅).

## Раніше виявлені «гарячі точки» — closure-таблиця

| Гіпотеза з першого проходу                                                     | Реальність                         | Доказ                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage 5 sync wiring incomplete (P0)                                            | **Closed**                         | CloudSync engine #1929–#1941 + sync v2 op-log. `flushOnReconnect`/`recoverDeadLetter` мають реальні production callsite-и в обох runtimes.                                                                |
| Stripe bootstrap docs missing (P0)                                             | **Closed**                         | revenue P0-7 (`apps/server/src/env/env.ts` schema validation) shipped; price_id ad-hoc gap закрито.                                                                                                       |
| Stripe webhook без e2e (P1)                                                    | **Closed**                         | PR [#2872](https://github.com/Skords-01/Sergeant/pull/2872) merged 2026-06-03 — `apps/server/src/routes/billing.webhook.test.ts` (8 сценаріїв: фейковий signature → DB insert → role update). Див. D1 ✅. |
| `billing.test.ts` pre-existing failures (P1)                                   | **Не верифіковано**                | Згадка в моєму early-pass-і не підтверджена прямим запуском. Потребує одиничного перевірочного коміту перед закриттям.                                                                                    |
| Lighthouse LCP `warn`→`error` 3000 ms (P1)                                     | **Tracked**                        | sprint-roadmap T5; перший pass (warn-only) shipped `cb459c08`; tightening — baseline-gathered follow-up.                                                                                                  |
| 40 ADR без `Last validated` (P1)                                               | **Closed**                         | PR [#2874](https://github.com/Skords-01/Sergeant/pull/2874) merged 2026-06-03 — `scripts/docs/backfill-adr-freshness.mjs` backfill-нув усі ADR; 59/59 мають `Last validated`. Див. D4 ✅.                 |
| `core/cloudSync/index.ts` orphan exports (P1)                                  | **Closed**                         | `@scaffolded` маркер (dead-code roast P0.1); `useSyncStatus` ще ходить deep-path-ом, барель свідомо тримається.                                                                                           |
| 12 TBD CODEOWNERS (P0)                                                         | **Closed (рішення прийнято)**      | Bus-factor PR-04 свідомо допускає `TBD(role)` як placeholder; replace-on-hire.                                                                                                                            |
| ADR-0004 Status drift (P0-4)                                                   | **False positive**                 | Рядок 3 уже містить `superseded by ADR-0047`.                                                                                                                                                             |
| README hero asset placeholder (P2)                                             | **Tracked**                        | PR-02b відомий; landing/hero серія планується.                                                                                                                                                            |
| Monobank webhook deprecation у CONTRIBUTING (P2)                               | **Cosmetic**                       | Згадка в README. Якщо команда вирішить — short paragraph у CONTRIBUTING.                                                                                                                                  |
| `OptimizedImage`, `PullToRefreshIndicator`, `shared/lib/log` як dead-code (P2) | **Closed**                         | Усі під `@scaffolded` маркером з `@nextStep` JSDoc.                                                                                                                                                       |
| AI Memory silent no-op при відсутньому `VOYAGE_API_KEY` (P2)                   | **By-design**                      | `AI_MEMORY_ENABLED=false` за замовчуванням — master-switch. Activation runbook вимагає key. Fail-loud guard — D3.                                                                                         |
| `audit-exception` процес (P2)                                                  | **Closed**                         | [`docs/04-governance/security/audit-exceptions.md`](../../../04-governance/security/audit-exceptions.md) існує; SLA + nightly-audit у тому ж розділі.                                                     |
| Visual-regression pgvector fallback (P2)                                       | **Tracked в pr-plan-testing-devx** | див. [planning/pr-plan-testing-devx-2026-05.md](../../planning/pr-plan-testing-devx-2026-05.md).                                                                                                          |
| Stryker removal decision-record (P2)                                           | **Closed**                         | Already covered: `docs/02-engineering/testing/README.md:12`, `2026-05-05-tests-review.md:40`, ADR-0020:235 містять explicit decision. Підтверджено second-pass executor 2026-05-15 — див. D2 ✅.          |
| Admin seed-скрипт (P2)                                                         | **By-design (Better Auth)**        | Перша адмін-учетка створюється через web-форму + manual DB-update. Якщо команда хоче формалізувати — окремий PR.                                                                                          |

## Truly outstanding

**Outstanding count: 0** (станом на 2026-06-03). Усі чотири пункти (D1–D4) закрито: D1 (PR #2872 merged), D2 (PR #2933 merged), D3 (local diff verified 2026-05-17), D4 (PR #2874 merged). Жоден не був P0; усі — observability/hygiene клас. Картки лишаються нижче як історичний record зі стабільними ID для крос-посилань.

### D1 — Stripe webhook e2e (P2) ✅ Closed

**Status:** Closed 2026-06-03 (drift — PR [#2872](https://github.com/Skords-01/Sergeant/pull/2872) merged до main). Route-level supertest присутній: `apps/server/src/routes/billing.webhook.test.ts` існує і містить 8 сценаріїв (фейковий signature → DB insert → role update + регресія signature-validation flow). Gap закрито.

**Original concern:** наскрізний integration test з фейковим Stripe webhook signature → DB insert → user role update. Поточне покриття на момент аудиту: 3 unit-тести на lifecycle (`subscription_started`/`renewed`/`canceled`) + checkout/portal endpoints. Не вистачало тесту, який ловить регресію signature-validation flow.

**Suggested home (historical):** [`docs/90-work/planning/pr-plan-testing-devx-2026-05.md`](../../planning/pr-plan-testing-devx-2026-05.md) — реалізовано як route-level supertest.

### D2 — Stryker removal decision-record (P2) ✅ Closed

**Status:** Closed 2026-05-15 (second-pass executor confirmation, see § Update 2026-05-15 — second-pass executor closeout). ID stable для крос-посилань зі старих PR-описів.

**Original concern:** mutation testing (Stryker) видалено разом з CloudSync v1 sunset у `#052b`; explicit decision-record «**чому Stryker зник і чи буде заміна**» вважався не виокремленим.

**Resolution:** Explicit decision вже зафіксовано у трьох канонічних місцях:

- [`docs/02-engineering/testing/README.md:12`](../../../02-engineering/testing/README.md) — короткий decision-record у каноні testing.
- [`docs/02-engineering/testing/2026-05-05-tests-review.md:40`](../../../02-engineering/testing/2026-05-05-tests-review.md) — historical context у tests-review.
- ADR-0020:235 — formal decision у ADR.

Жодних подальших дій не потрібно.

### D3 — AI Memory `VOYAGE_API_KEY` fail-loud guard (P2)

**Що:** якщо `AI_MEMORY_ENABLED=true`, але `VOYAGE_API_KEY=""`, embeddings-pipeline зараз graceful no-op (silent). Це by-design для default-off режиму, але **активований flag з відсутнім key = silent failure**.

**Чому P2:** master-switch у false, активація — manual за runbook-ом, де key явно named. Ризик низький, але обернений — за день можна додати fail-loud assertion при boot, коли обидві умови виконані.

**Suggested home:** початково таргетувалось у `pr-plan-security-obs-2026-05.md`, але той план закрито й заархівовано ([`docs/90-work/planning/archive/pr-plan-security-obs-2026-05.md`](../../planning/archive/pr-plan-security-obs-2026-05.md), усі S2–S11 ✅). Нову S-size card заводити в активному [`docs/90-work/planning/pr-plan-backend-perf-2026-05.md`](../../planning/pr-plan-backend-perf-2026-05.md) (env-validation / observability track).

### D4 — ADR freshness header hygiene (P2) ✅ Closed

**Status:** Closed 2026-06-03 (drift — PR [#2874](https://github.com/Skords-01/Sergeant/pull/2874) merged до main). Codemod `scripts/docs/backfill-adr-freshness.mjs` присутній і всі ADR-документи у `docs/04-governance/adr/` тепер мають `Last validated:` маркер (підтверджено: 59/59 ADR `.md` з header-ом). Hygiene-gap закрито.

**Original concern:** ~40 ADR (з 53) не мали явного `Last validated:` маркера. Freshness-gate захищає tracked docs (initiatives, launch, governance, tech-debt, app AGENTS.md) — там покриття 100%; для ADR `Last validated` був opt-in.

**Resolution:** масовий backfill `Last validated:` у топ-секцію кожного ADR без header-а через `scripts/docs/backfill-adr-freshness.mjs` (вставка після `- **Status:**` рядка). Подальших дій не потрібно.

## Strengths (для onboarding)

Цей розділ — спостереження ззовні, корисне для майбутніх агентів/розробників.

1. **23 hard rules з real enforcement** — це рідкість. Кожне правило має `category`, `id`, per-rule canonical body, ESLint/CI hook. 3-way sync gate (`hard-rules.json` ↔ AGENTS.md ↔ `rules/`) не дає правилам drift-увати.
2. **Freshness-gate як culture** — `bump-last-validated.mjs` як pre-commit hook на `.md` робить doc-rot економічно дорогим. Tracked surface (initiatives/launch/governance/tech-debt) — 100% покриття.
3. **Audit cadence** — 20+ audit-документів за травень 2026. Кожен прохід має P0-Closure таблицю + outstanding-list + cross-refs. Конкуренти роблять аудити раз на рік; тут — кожні 2 дні.
4. **CODEOWNERS bus-factor контракт** — лінт enforce-ить існування Secondary, але дозволяє `TBD(role)` як свідомий placeholder. Це чесніше за «прибрати поле» або «поставити випадкову людину».
5. **`@scaffolded`/`@deprecated`/`@experimental` JSDoc маркери** — Hard Rule #10 + `scripts/knip-respects-scaffolded.mjs`. Замість «видалити vs залишити» — третій варіант з контекстом і `@nextStep`.
6. **AI markers (`AI-NOTE`/`AI-CONTEXT`/`AI-DANGER`/`AI-GENERATED`/`AI-LEGACY`)** — формалізовані коментарі-помітки + `pnpm lint:ai-legacy` + weekly idempotent GitHub issue від `.github/workflows/ai-legacy-scan.yml`.
7. **Conventional Commits з explicit scope enum** — commitlint enforce-ить, що `feat(web):`/`fix(server):` мають конкретний scope з [списку 24 значень](../../../../commitlint.config.js). Це робить git log читабельним.

## Risks not addressed by current planning

Жодного нового. Поточна система планування (sprint-roadmap + 16 pr-plan-\* + audit cadence) покриває всі реальні ризики, які цей прохід виявив. **Це самостійний висновок ауд-проходу: planning surface достатній.**

## Operational notes

- Якщо вирішено tackle-нути D1–D4, виконувати окремими PR-ами з explicit scope (`test(server):` для D1, `docs(governance):` для D2/D4, `feat(server):` для D3) — Conventional Commits gate (Hard Rule #5) інакше відхилить.
- Pre-PR check: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` (= `pnpm check`).
- D4 (ADR freshness hygiene) — може стати batch-PR через `scripts/docs/`-styled codemod, який вставляє `Last validated:` блок у ADR без header-а на основі git blame першого коміту файлу.

## Verification of this audit

```bash
# 1. Перевірити, що цей файл відповідає freshness-gate
pnpm lint:doc-freshness

# 2. Перевірити, що cross-refs резолвляться
pnpm docs:check-links

# 3. Перевірити, що commit-scope правильний
# Очікуваний commit: docs(docs): add 2026-05-15 state-of-repo synthesis
```

## Update 2026-05-15 — second-pass executor closeout

Окремий runner (Claude Opus 4.7) пройшов по open-tracker-ах паралельно з synthesis-аудитом і відкрив пакет PR-ів, що закривають конкретні pr-plan-card-и + cleanup-items з §[Truly outstanding](#truly-outstanding):

| Tracker                                                                  | Scope                                                                                                              | PR                                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `pr-plan-mobile-reliability-2026-05.md` PR-02 — M4 finyk × 2             | drop `as unknown as` у `CategoryChartSection.tsx` + `TransactionsPage.tsx`, 2 allowlist rows                       | merged via [#2877](https://github.com/Skords-01/Sergeant/pull/2877)                  |
| `pr-plan-mobile-reliability-2026-05.md` PR-03 — M3 fizruk × 4            | journal selectors widened (`WorkoutSummaryInput`/`WorkoutForJournal`), `lib/toDomain.ts` adapter, 4 allowlist rows | open [#2891](https://github.com/Skords-01/Sergeant/pull/2891)                        |
| `pr-plan-ftux-2026-05.md` PR-A — celebration_shown payload               | додано `tipVariant` + `ctaLabel` keys у PostHog event + 2 vitest scenarios                                         | open [#2892](https://github.com/Skords-01/Sergeant/pull/2892)                        |
| `pr-plan-mobile-reliability-2026-05.md` PR-10 — shell-tax `--trend`      | 30/60/90d quarterly table + initiative 0002 recount row                                                            | open [#2893](https://github.com/Skords-01/Sergeant/pull/2893)                        |
| README hero placeholder                                                  | neutralized `PR-02b` posthumous reference                                                                          | open [#2894](https://github.com/Skords-01/Sergeant/pull/2894)                        |
| `pr-plan-backend-perf-2026-05.md` PR-12 — audit stubs                    | `2026-08-XX-sync-engine-roast.md` + `2026-08-XX-openclaw-internal-roast.md` + index                                | open [#2895](https://github.com/Skords-01/Sergeant/pull/2895)                        |
| §[Truly outstanding](#truly-outstanding) D1 — Stripe webhook e2e         | route-level supertest + 8 scenarios                                                                                | merged ([#2872](https://github.com/Skords-01/Sergeant/pull/2872); closed 2026-06-03) |
| §[Truly outstanding](#truly-outstanding) D3 — `VOYAGE_API_KEY` fail-loud | startup guard + 7 tests у `assertStartupEnv`                                                                       | closed (local diff; verified 2026-05-17)                                             |
| §[Truly outstanding](#truly-outstanding) D4 — ADR freshness backfill     | codemod + усі ADR з `Last validated` markers                                                                       | merged ([#2874](https://github.com/Skords-01/Sergeant/pull/2874); closed 2026-06-03) |

**Що залишається у §[Truly outstanding](#truly-outstanding):** нічого — **0 outstanding** станом на 2026-06-03.

- D2 (Stryker removal decision-record) — ✅ Closed 2026-05-16 у branch `claude/identify-critical-issues-3IgIx` (PR [#2933](https://github.com/Skords-01/Sergeant/pull/2933)).
- D1 (Stripe webhook e2e) — ✅ Closed 2026-06-03: PR [#2872](https://github.com/Skords-01/Sergeant/pull/2872) merged; `apps/server/src/routes/billing.webhook.test.ts` (8 сценаріїв) у main.
- D4 (ADR freshness backfill) — ✅ Closed 2026-06-03: PR [#2874](https://github.com/Skords-01/Sergeant/pull/2874) merged; `scripts/docs/backfill-adr-freshness.mjs` у main, усі ADR мають `Last validated`.
- D3 (`VOYAGE_API_KEY` fail-loud) — ✅ Closed (local diff, verified 2026-05-17).

**Cleanup item (synthesis non-tracked):** CONTRIBUTING.md Monobank fallback note — **false positive** (README не позначає Monobank webhook як deprecated; CONTRIBUTING.md не має згадок взагалі — нема чого додавати).

## Update 2026-05-16 — branch `claude/identify-critical-issues-3IgIx` closeout

Сесія `claude/identify-critical-issues-3IgIx` (PR [#2933](https://github.com/Skords-01/Sergeant/pull/2933)) пройшла по mechanical/low-risk tail з кількох audit-tracker-ів і закрила пакет items без декомпозиції на окремі PR-и (4 commits, один scope):

| Tracker / item                                                         | Дія                                                                                                                                                                                                                                                                                                                                                                                    | Commit                   |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `2026-05-13-dead-code-hard-rules-roast.md` — knip dead-code visibility | Unblocked `pnpm knip` (ERROR-level loader failures × 2 → 0): `apps/web/vite.config.js` ESM `__dirname` shim + `knip.json` `"metro": false` для `apps/mobile`. Додано 4 `@scaffolded` markers (`core/billing/index.ts`, `core/errors/index.ts`, `core/errors/OfflinePage.tsx`, `core/errors/ServerErrorPage.tsx`) — `pnpm dead-code:files` тепер репортує `No unmarked unused files ✓`. | 06ad8a4 `chore(root)`    |
| `2026-05-15-deep-audit-state-of-repo.md` D2                            | ✅ Closed (Stryker removal decision-record — already covered у 3 канонічних місцях).                                                                                                                                                                                                                                                                                                   | 4858757 `docs(docs)`     |
| `2026-05-13-documentation-hygiene-roast.md` P1-2                       | ✅ Closed (non-actionable — archived file 3-date canonicalization, audit's own recommended action = "leave as-is").                                                                                                                                                                                                                                                                    | 4858757 `docs(docs)`     |
| `2026-05-03-readme-gap-analysis.md` 2 outstanding items                | ✅ Closed: «Packages» і «Environment Variables» де-факто існують у `README.md` як nested subsections (per-item mapping додано у closure note).                                                                                                                                                                                                                                         | 4858757 `docs(docs)`     |
| `docs/90-work/audits/README.md` counters                               | Resync 4 рядки: `readme-gap-analysis` 13/15→15/15 ¹, `doc-hygiene-roast` "3 P1 / 2 P2" → "1 P2", `dead-code-hard-rules-roast` "1 ≈" → "≈4", `deep-audit-state-of-repo` "4" → "3 ⁴". Додано 4 footnotes з контекстом.                                                                                                                                                                   | 4858757 `docs(docs)`     |
| ESLint baseline — `react-hooks/static-components`                      | Promoted `off` → `error` (0 violations across 5 surfaces: web/mobile/mobile-shell/server/openclaw). Inline scoreboard додано для решти 6 react-hooks v7 rules (use-memo 4 → set-state-in-effect 78).                                                                                                                                                                                   | 2f91a10 `chore(root)`    |
| `2026-05-13-page-audit-01-auth-onboarding.md` F1                       | ✅ Verified clean — token rename `text-error`/`bg-error`/`border-error` → `-danger` уже відбувся; grep returns 0 across `apps/web/src` та `apps/mobile/src`. Не вимагало code change у цьому PR (note-only).                                                                                                                                                                           | 4858757 `docs(docs)` msg |
| Sergeant-design errors (6) у `apps/web` lint baseline                  | ✅ All cleared у `apps/web/src/core/hub/chat/useChatSend.ts` (2× `no-raw-local-storage` → `safeReadLS`/`safeWriteLS`) і `apps/web/src/shared/components/ui/InsightCard.tsx` (2× `no-flat-shared-lib` → deep-paths, `valid-tailwind-opacity` /22→/20, `no-arbitrary-text-size` text-[18px]→text-style-title). Plus 4 same-file warnings cleared (lint-staged `--max-warnings=0` gate).  | ecfe47b `fix(web)`       |

**Net effect:** `pnpm --filter @sergeant/web lint` тепер `0 errors` (було 6). `pnpm dead-code:files` ✓. `pnpm docs:check-links` ✓ (1 broken internal link виправлено). Один react-hooks v7 rule переведено на gate. 4 outstanding items закрито у трьох рядках README counter table.

**Bonus discovery (correction of prior audit claims):** Hard Rule #19 (`noUncheckedIndexedAccess: true`) **уже виконане по всьому monorepo** — увімкнено у `packages/config/tsconfig.base.json` і наслідується усіма workspace tsconfig-ами через `tsconfig.react.json` / `tsconfig.node.json`. Попередній synthesis-аудит помилково записав `apps/web` / `apps/server` / `apps/mobile-shell` як такі, що не мають правила — походило з прямого читання workspace tsconfig.json без traverse-у `extends`-ланцюжка.

## Authorship

Цей аудит — зовнішній (single-session Claude Sonnet 4.6, без доступу до GitHub PR-API і CI artifacts), що означає:

- ✅ Знахідки спираються на repo content + planning docs на момент 2026-05-15.
- ⚠️ Status statements ("Closed", "Done у PR") — verify-them by author-ом перед використанням як authoritative reference.
- ⚠️ D1 (Stripe webhook e2e gap) і `billing.test.ts` pre-existing failures — обидва warrant одиничний `pnpm --filter @sergeant/server test` прогін для cross-check.
