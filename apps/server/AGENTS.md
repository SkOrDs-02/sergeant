# Agents in apps/server

> **Last touched:** 2026-09-22 by @Skords-01. **Next review:** 2027-01-17.
> **Status:** Active

> **Single source of truth → root [`AGENTS.md`](../../AGENTS.md).** Цей файл — sub-tree quick reference для агентів, що працюють у `apps/server/`. Не дублюй repo policy: hard rules і CI matrix живуть у корені.

## Specialist skill

[`.agents/skills/sergeant-server-api/SKILL.md`](../../.agents/skills/sergeant-server-api/SKILL.md) — `apps/server`, `packages/api-client`, bigint coercion, contract triplet, Kyiv time rules. Для SQL/міграцій додатково підвантаж [`sergeant-data-and-migrations`](../../.agents/skills/sergeant-data-and-migrations/SKILL.md).

## Stack snapshot

Node 22 + Express + PostgreSQL 18 (pgvector, `pg`) + Better Auth (cookie + bearer) + Anthropic Claude (tool-use, streaming) + Voyage embeddings (AI memory). Деплой: Hetzner CX23 + Coolify — образ `ghcr.io/.../sergeant-api` (GitHub Actions [`deploy-api.yml`](../../.github/workflows/deploy-api.yml)); [`Dockerfile.api`](../../Dockerfile.api) без змін. Rationale: [ADR-0074](../../docs/governance/adr/0074-hosting-hetzner-coolify.md). Тести: Vitest unit + Testcontainers (real Postgres) інтеграційні.

## Quick commands

```bash
pnpm dev:server                                       # http://localhost:3000
pnpm db:up                                            # docker postgres
pnpm db:migrate                                       # apply SQL migrations
pnpm --filter @sergeant/server build
pnpm --filter @sergeant/server test                   # Vitest unit
pnpm --filter @sergeant/server test:integration       # Testcontainers
pnpm --filter @sergeant/server test:coverage
pnpm --filter @sergeant/server typecheck
pnpm api:generate-openapi                             # regenerate OpenAPI on contract change
pnpm api:check-openapi                                # freshness gate (CI-blocking)
```

## Surface-specific gotchas

- **DB types (Hard Rule #1):** `pg` returns `bigint` as **string**. Coerce to `number` in serializers — never leak strings to API consumers or RQ caches.
- **API contract triplet (Hard Rule #3):** server response shape ↔ `@sergeant/api-client` types ↔ test must move together. Run `pnpm api:generate-openapi` when shapes change (types in `packages/api-client/src/endpoints/*` are hand-written); CI gate: `pnpm api:check-openapi`.
- **Migrations (Hard Rule #4):** sequential numbering, no gaps. Two-phase for `DROP` (deploy a writer that ignores the column → ship migration → remove the writer). Generator: `pnpm gen` → `migration`. Lint gate: `pnpm lint:migrations`.
- **Domain invariants:** Europe/Kyiv timezone; minor units (kopiykas) as `number` for money; user IDs are Better Auth opaque strings (not UUID). Full anti-pattern list: [`docs/engineering/architecture/domain-invariants.md`](../../docs/engineering/architecture/domain-invariants.md).
- **Logging (Hard Rule #21):** Pino redaction policy enforced — never log raw secrets, headers, PII, or request bodies that contain them. Use `apps/server/src/obs/logger.ts` redact paths.
- **Auth secrets (Hard Rule #20):** no OpenClaw PATs in production; rotate via [`docs/start/instructions/rotate-secrets.md`](../../docs/start/instructions/rotate-secrets.md).

## Health & deploy

`/health` p95 < 100 ms (formalized: [`SLO.md § 2.1`](../../docs/operations/observability/SLO.md#21-health-endpoint-p95); alert-правило `BackendHealthP95High` визначене в `prometheus/alert_rules.yml` і, за [`SLO.md § Wired сьогодні`](../../docs/operations/observability/SLO.md), залите в Grafana Cloud Mimir та evaluating — SLO.md є єдиним джерелом істини щодо wiring. Живу доставку алертів підтверджуй у Grafana UI: `grafana-alloy`-скрейпер має історію cost-паузи). Health-probe віддає сам Node через Coolify proxy; міграції — ENTRYPOINT образу (`node dist-server/migrate.js && exec node dist-server/index.js`), Coolify `pre_deployment_command` **порожній і має таким лишатись** (розбір нижче). **Coolify-івський health check (`health_check_enabled`) вмикай лише на образі, який містить `/bin/wget`** — перевірка виконується всередині контейнера, а distroless-runtime без нього завалює КОЖЕН деплой і відкочує навіть справний (інцидент 2026-08-06; фікс — `COPY … /bin/wget` у [`Dockerfile.api`](../../Dockerfile.api)). Міграції беруть `MIGRATE_DATABASE_URL`, якщо він заданий, інакше `DATABASE_URL`. **На Coolify це те саме значення** — внутрішнє імʼя контейнера бази, публічного порту в неї немає. Окрема змінна лишилась із часів Railway, де pre-deploy виконувався поза внутрішньою мережею й потребував публічного URL; відколи міграції їдуть у тому самому контейнері, вона потрібна лише щоб розвести міграційне й рантаймове підключення (окремий користувач із DDL-правами), і за замовчуванням дублює `DATABASE_URL`. Наслідок для діагностики: **з робочої машини ця база недосяжна** — SQL проганяй у терміналі ресурсу Postgres у Coolify. Деталі — [ADR-0074](../../docs/governance/adr/0074-hosting-hetzner-coolify.md). Чат `/api/chat` має ДВА ходи з різними SLO, і плутати їх не можна (рішення founder-а 2026-09-02, знахідка AI-2). **Перший хід не стрімиться** — людина не бачить нічого, доки відповідь не допишеться, тож обіцянка про перший токен тут не має предмета: `p95(chat_first_turn_phase_ms{phase="total"}) < 15 s`. Це стеля-детектор із заміру, а не продуктова ціль: факт 2026-09-01 — медіана ≈6,7 с, максимум 13,7 с на 12 промптах. **Тур синтезу після tool-результатів стрімиться** — там перший токен існує і міряється: `p95(ai_first_token_ms) < 1.5 s`, з поправкою на модель (заміряно офлайн: flash-lite 365 мс, haiku-4.5 954 мс, sonnet-5 5 586 мс — тобто найповільніша промахує в 3,7×). Розбір, чому старе формулювання трималось так довго: [`metrics.md § 6a`](../../docs/operations/observability/metrics.md). AI memory endpoints require `VOYAGE_API_KEY` when `AI_MEMORY_ENABLED=true`.

**Pre-deploy мігрує зі СТАРОГО образу — міграція доїжджає на деплой пізніше (знахідка 2026-08-28).** Coolify виконує `pre_deployment_command` не у свіжому контейнері з нового образу, а через `docker exec` у тому, що ЩЕ ПРАЦЮЄ на попередньому. Доказ із debug-логу: о 21:42:37 команда пішла в контейнер `…212240236388`, а новий `…214231195839` створено о 21:42:46 — на дев'ять секунд пізніше. Отже `node dist-server/migrate.js` читає `.sql`-файли старого образу, нової міграції не бачить і чесно рапортує `migrate_ok`.

Наслідок: **кожна міграція застосовується рівно на один деплой пізніше за код, який на неї розраховує.** Спостережено на `128_backfill_manual_expense_sync_ops.sql` — приїхала з [#910](https://github.com/SkOrDs-02/Sergeant/pull/910) (21:17), лишалась `pending` увесь час, застосувалась лише pre-deploy-ом наступного деплою ([#911](https://github.com/SkOrDs-02/Sergeant/pull/911), 21:42).

Того разу пронесло, бо backfill даних — код без нього працює. Міграція, що додає колонку, яку новий код одразу читає, дасть 500-ки у вікні між деплоями N і N+1. `/healthz` розбіжність показує, але НЕ блокує: гейт `MIGRATION_DRIFT_BLOCKS_READINESS` (`lib/schemaDrift.ts` → `driftBlocksReadiness`) опційний і вимкнений.

**Зламане тут не рішення, а прив'язка до платформи.** Release-stage модель у [`migrate.mjs`](./migrate.mjs) обрана правильно (чому саме так — три причини в його doc-string: race на `INSERT schema_migrations`, напіврозкочана довга міграція, затримка readiness). Вона припускає, що job бачить НОВИЙ код — на Railway pre-deploy піднімав свіжий контейнер, Coolify ж перевикористовує старий. Повертати `ensureSchema()` у бут web-процесу без розбору цих трьох причин не можна.

**ВИПРАВЛЕНО 2026-09-21: міграції переїхали в ENTRYPOINT образу.** Крок тепер виконує сам контейнер, до старту веб-сервера:

```
ENTRYPOINT ["/bin/sh", "-c", "node dist-server/migrate.js && exec node dist-server/index.js"]
```

Це нове ім'я того самого release-stage, лише прив'язане до образу, а не до платформи: процес окремий (тобто `statement_timeout = 0`, `lock_timeout` і обхід pgBouncer з `migrate.mjs` лишаються в силі й не течуть у runtime-пул), але код у ньому вже НОВИЙ. Три причини з doc-string при цьому не порушені, і `ensureSchema()` у бут web-процесу **як і раніше не повертається**.

Розбір, чому саме так, а не міграція при старті процесу: причини 1 і 2 закриває `pg_advisory_lock` у [`db.ts`](./src/db.ts) (`MIGRATIONS_ADVISORY_LOCK_KEY`, другий процес спить і потім no-op-ить), а причина 3 непереборна — runtime-пулу потрібен `statement_timeout`, міграціям потрібен його нуль, і один пул обидва набори дати не може.

Наслідки, які варто тримати в голові:

- `pre_deployment_command` у Coolify **прибрано**. Повертати не треба: він запускав би міграцію вдруге, ще й зі старого образу.
- Крок fail-closed. Впала міграція → веб-сервер не стартує → healthcheck не проходить → Coolify відкочується на старий контейнер. Це бажана поведінка.
- Міграції проганяються на КОЖНОМУ старті контейнера, не лише на деплої. Ідемпотентні; порожній прогін ~350 мс.
- Недоступна на старті база тепер валить контейнер у рестарт-цикл замість підняти його з червоним readiness. Свідомий обмін: сервер без бази однаково марний, а тихий старт із розбіжною схемою гірший.
- Форму ENTRYPOINT стереже [`dockerfile-api-migrate-entrypoint.test.mjs`](../../scripts/__tests__/dockerfile-api-migrate-entrypoint.test.mjs): порядок кроків, `&&` замість `;`, `exec` перед `node index.js` (без нього PID 1 лишається за `sh`, SIGTERM не ретранслюється і graceful shutdown не працює), наявність `/bin/sh` з busybox і `/nodejs/bin` у PATH.

**Зелена джоба деплою ≠ деплой доїхав (інцидент 2026-09-14).** Хук
відповідає `2xx` на «запит прийнято», а далі Coolify тягне образ, піднімає
новий контейнер і чекає healthcheck — і якщо той не проходить, **тихо
відкочується на старий**: `New container is not healthy, rolling back to the
old container`. Джоба при цьому лишалась зеленою. Так знайшлося, що деплої
відкочувались підряд, а на VPS крутився старий образ: фікси мерджились, CI
був зелений, у проді не мінялось нічого. Це той самий клас поломки, що й
`401` на хук у серпні, лише на крок пізніше в ланцюжку.

Тепер у [`deploy-api.yml`](../../.github/workflows/deploy-api.yml) є крок
**Verify Coolify actually deployed**: він бере `deployment_uuid` з відповіді
хука, дочікується термінального статусу через `/api/v1/deployments/<uuid>` і
**фейлить джобу** на відкоті чи вичерпаному таймауті, друкуючи в summary
причину й порядок перевірки. Форму стереже парсерний тест
[`ci-deploy-verify-gate.test.mjs`](../../scripts/__tests__/ci-deploy-verify-gate.test.mjs)
(крок у джобі `check` — він парсить YAML і має бігати на КОЖНОМУ PR).
`continue-on-error` у цих двох кроках заборонений — тест на це теж.

**Причина того конкретного відкоту — `/health` віддавав 503 у новому
контейнері.** Readiness падає, коли не проходить `SELECT 1` до Postgres, а
старий контейнер при цьому працює: Coolify пише `.env` наново на кожен
деплой, тож старий живе зі СТАРИМИ значеннями. Звідси порядок розбору:
(1) звірити змінні нового контейнера з тими, що в робочому
(`docker inspect … --format '{{range .Config.Env}}…'`); (2) мережа — хост у
`DATABASE_URL` має бути внутрішнім імʼям контейнера, не `localhost`;
(3) `pg_stat_activity` проти `max_connections` — під час rolling update
живуть обидва контейнери. Пам'ятай ще й про те, що pre-deploy міграція
виконується в СТАРОМУ контейнері (див. абзац вище), тож її `migrate_ok`
нічого не каже про новий `.env`.

**`curl: not found` у логах деплою Coolify - це НЕ мертвий гейт.** Команду Coolify не бере з поля вводу: він збирає її сам з полів `health_check_*` (`generate_healthcheck_commands()` у `ApplicationDeploymentJob.php`) в один рядок `CMD-SHELL` виду `curl … || wget … || exit 1`. У distroless перша гілка падає ЗАВЖДИ, тож `/bin/sh: curl: not found` стоїть у логах навіть під цілком здоровим контейнером, а результат вирішує друга гілка, busybox-`wget`. Тому `Return code: 0` поруч із тим рядком читається як «wget отримав 200», а не як «shell проковтнув помилку». Заміряно 2026-08-29 на образі з [`Dockerfile.api`](../../Dockerfile.api): БД на місці → `/health` 200 → `healthy` / exit 0; БД недосяжна → 503 → `unhealthy` / exit 1 (лог додає `wget: server returned error: HTTP/1.1 503`); порт не слухає → `unhealthy` / exit 1 (`connection refused`); той самий runtime без `/bin/wget` → `unhealthy` / exit 1. Справді вимкнений гейт має інший підпис: коли `health_check_enabled = false`, Coolify **взагалі не додає** healthcheck у compose і одразу ставить `newVersionIsHealthy = true`, тож у логах немає ні рядка `Healthcheck URL (inside the container)`, ні `Attempt N of M`. Що виконується насправді - `docker inspect --format '{{json .Config.Healthcheck}}' <container>` на VPS. Додавати `HEALTHCHECK` в образ як «свій» безглуздо: Coolify читає його лише коли САМ будує з репо, а тут тягне готовий образ із ghcr, тож compose-healthcheck усе одно перекриє запечений.

**Деплой не замовлено ≠ деплой не потрібен (інцидент 2026-08-18 → 08-24).** Крок «Trigger Coolify deploy» у [`deploy-api.yml`](../../.github/workflows/deploy-api.yml) стояв під `continue-on-error`, і коли hook почав віддавати `401`, джоба лишалась зеленою. Образи справно збирались і лягали в `ghcr.io`, а на VPS шість днів крутився старий контейнер — жоден мерж у `main` не доїжджав. Тепер крок **фейлить джобу** на будь-якому не-2xx: образ на той момент уже запушено, тож червона джоба нічого не руйнує, а повідомляє рівно один факт — деплой не замовлено. `continue-on-error` сюди не повертати.

**Редирект від хука — це не відмова авторизації, і `-L` його не лікує.** Після перевипуску токена 2026-08-24 хук віддав не `401`, а **`302`**. Це інша хвороба: 3xx означає, що запит потрапив не на API-ендпоінт, а на веб-роут Coolify, і Laravel відкинув неавторизовану сесію на сторінку входу — тобто винен URL у `COOLIFY_DEPLOY_WEBHOOK`, а не токен. Дві типові причини: схема `http://` (Coolify підіймає на `https://` редиректом) або адреса застосунку з UI замість `/api/v1/deploy?uuid=…`. **Очевидний «фікс» через `curl -L` тут строго заборонений:** сторінка входу віддає `200 HTML`, тож із `-L` крок відрапортував би «деплой замовлено», не замовивши його — рівно те мовчазне зелене, яке цей крок і лікує. Тому 3xx лишається відмовою з власною підказкою в job summary. Окремий урок про діагностику: у першій версії підказки гілки для 3xx не було, і власник побачив пояснення лише про `401/403` та `000` — **список причин, у якому немає твого випадку, гірший за відсутність списку**, бо веде перевіряти справний токен.

**`401` від `/api/v1/deploy` — теж не синонім «протух токен».** Коли URL виправлено і запит доходить до API, кандидатів чотири, і лише перший про строк дії: (1) токен відкликано/перевипущено, а секрет старий; (2) **API вимкнено** глобально (Settings → API → Enable API) — тоді 401 віддає будь-який `/api/v1/*`; (3) **IP-allowlist** на API не містить діапазонів GitHub-раннерів — це класика «з ноутбука працює, з CI ні», і саме її найлегше проґавити; (4) у токена немає права **deploy**. Розділювальний тест — той самий `curl` зі своєї машини: пройшов там, але не в CI → це allowlist. Окремо крок обрізає пробіли й перенос рядка в `COOLIFY_DEPLOY_TOKEN` і **каже про це вголос**: вставлений із буфера токен із `\n` ламає Bearer-заголовок і виглядає точно як протухлий, тож без цієї підказки перевипускають справний токен.

**Леджер міграцій ніс три чужі імені — і через це сигнал дрейфу був константним (знахідка 2026-09-17).** Подія `schema_drift` о 07:10 UTC: `applied: 144`, `shipped: 143`, `pending: [141, 142]`, `unknown: [047_tg_topic_archive.sql, 096_fizruk_injuries.sql, 097_finyk_fizruk_pk_text.sql]`. Арифметика замикається (`141 matched + 3 unknown = 144`), тобто теперішні імена тих самих міграцій — `048_tg_topic_archive.sql`, `097_fizruk_injuries.sql`, `096_finyk_fizruk_pk_text.sql` — у леджері вже були: **той самий DDL зареєстровано двічі, під іменами з репозиторію-попередника й нинішнього**. Історії цих файлів у git немає взагалі — поточний чекаут починається 2026-09-14, тож перенумерація сталась при переїзді репо, а не в комітах.

Пронесло лише через ідемпотентність тих трьох міграцій: на парі з `CREATE TABLE` без `IF NOT EXISTS` другий прогін поклав би деплой. Гірший же наслідок був тихим: `unknown` ніколи не порожній → сигнал `schemaDrift.ts` константний → **`MIGRATION_DRIFT_BLOCKS_READINESS` не можна було ввімкнути в принципі**, бо гейт відкидав би кожен деплой. Це рівно стан «червоний завжди = вимкнений», яким у корені двічі обґрунтовано ратчети бандл-бюджетів.

Лікує [`143_schema_migrations_legacy_names.sql`](./src/migrations/143_schema_migrations_legacy_names.sql): дублікат видаляється лише за наявності теперішнього імені, одинак — перейменовується зі збереженням `applied_at`, свіжа база — no-op. Усі чотири стани закриті тестом поруч і перевірені на живому Postgres 16. **Після її застосування `unknown` має стати порожнім — і лише тоді вмикати `MIGRATION_DRIFT_BLOCKS_READINESS` має сенс.**

**І тут же виявилось, що перевірити це з дашборда було неможливо (знахідка того ж дня, ввечері).** `reportSchemaDriftAtBoot` слав у Sentry рівно один сигнал — про `pending`, — а `unknown` клав лише в `logger.warn`. Вихід із функції стоїть на `inSync`, а той рахується як `pending.length === 0 && !migrationsDirMissing`: `unknown` у нього НЕ входить. Отже щойно 143 накотилась і `pending` спорожнів, функція почала виходити раніше, і стан `unknown` зник із дашборда взагалі — саме тоді, коли його треба було прочитати, щоб підтвердити результат роботи.

Це той самий візерунок, що й решта знахідок цього дня (мітка `preview` на проді, три види збою Сільпо без алерту, заморожена бета): **сигнал, який відповідає на питання, заради якого все робилось, до дашборда не доїжджає.** Мовчання при цьому читається однаково і як «полагоджено», і як «не перевірялось».

Тепер сигналів **два, і вони незалежні** — `drift` (образ попереду бази, `error`, ендпоінти 500-тять) і `unknown_migrations` (база попереду образу, `warning`, зазвичай відкат на старіший реліз). Розводяться тегом `signal` і рівнем; спільний заголовок склеїв би два різні стани в одну issue. База вміє бути одночасно і позаду, і попереду — тоді летять обидва.

**Додаєш гілку в цю функцію — став емит ПЕРЕД раннім виходом по `inSync`, не після.** Саме порядок і був дефектом, а не відсутність коду: рядок у логах існував увесь час. Break-test у `schemaDrift.test.ts` тримає рівно це: на коді до правки три тести падають, і головний — з «0 викликів замість 1».

**Міграція, що чіпає таблиці РАННЕРА, мусить стояти під guard-ом на їх наявність.** Урок із того самого дня: 143 була першою міграцією в історії репо, яка звертається до `schema_migrations` — і повалила три CI-джоби поспіль із `42P01 relation "schema_migrations" does not exist` (`Server integration tests`, `RAG eval gate`, `Migration down drill`).

Причина не в міграції, а в тому, ХТО її виконує. `schema_migrations` створює раннер (`db.ts::ensureSchema`), жоден `.sql` її не заводить. А **24 місця в репо програють `.sql`-файли напряму по свіжій базі, і лише 2 з них створюють леджер**: `test/createIntegrationApp.ts`, `test/pg-container.ts`, `lib/ragEval/testcontainer.ts`, `transcribe-usd-cap.e2e.test.ts`, усі `migrations/__tests__/*` з `resetSchema` тощо. Для них відсутність леджера — норма, а не поломка.

Тому правило: звертаєшся з міграції до `schema_migrations` (або іншої runner-owned структури) — загортай тіло в `DO`-блок під `to_regclass(...) IS NULL → RETURN`. Патчити два десятки гарнесів замість цього — свідомо гірший обмін. Зразок — [`143_schema_migrations_legacy_names.sql`](./src/migrations/143_schema_migrations_legacy_names.sql); статичний лейн його тесту вимагає, щоб guard стояв ПЕРЕД DML.

**І окремо про те, чому це не спіймалось локально.** Без Docker живі лейни скіпаються, а ручна перевірка на своєму Postgres створювала леджер сама — бо перевіряли ПОВЕДІНКУ міграції, а не шлях гарнеса. Перевіряй обидва: `for f in $(ls *.sql | grep -v down | sort); do psql -v ON_ERROR_STOP=1 -f $f; done` по чистій базі ловить рівно цей клас за секунди.

**Схему після деплою перевіряй, а не припускай.** `/health` (readyz) зелений, поки відповідає БД — він нічого не знає про міграції. Розбіжність «образ ↔ база» показує `/healthz`: він порівнює накочені міграції з тими, що є в образі, і на pending віддає `503` зі списком. Саме так знайшлось, що після редеплою 08-24 накотилась 123, а 124 — ні. Той самий чек є в [`smoke-tests.json`](../../scripts/smoke-tests.json) як `diag:healthz` (tier `critical`), але спрацьовує він рідко: [`post-deploy-smoke.yml`](../../.github/workflows/post-deploy-smoke.yml) тригериться на `deployment_status`, якого Coolify не шле, тож після деплою не запускається — лишається нічний cron і ручний `workflow_dispatch`.

**І цей чек сам був зламаний — третій випадок «завжди червоне = вимкнений гейт» поспіль.** Оголошені форми відповідей розійшлися з фактичними: пʼять probe-ів (`/livez`, `/health/liveness`, `/readyz`, `/health`, `/startupz`) віддають ПЛАЙН-ТЕКСТ `ok`, а конфіг чекав JSON `{ok: boolean}` — тобто ловив `json_parse_error` замість перевірки; `/healthz`, `/health/workers` і `/api/status` віддають `{status, timestamp, …}`, а конфіг чекав `{ok, db}`. Заміряно на живому проді 2026-08-24: зі старим конфігом **8 із 15 тестів падали з `shape_mismatch` на цілком здоровому сервісі**, з новим ті самі 8 зелені. Для текстових probe-ів тепер `expectedBodyContains`, а не `shape` — `shape` на не-JSON тілі не може дати нічого, крім помилки розбору. Правиш ендпоінт — став форму сюди тим самим заміром, а не з памʼяті.

## Спостережуваність інтеграцій

**Сигналив рівно один вид збою з чотирьох — і це ховало поломку синку Сільпо (знахідка 2026-09-17).** `silpoErrorToAppError` кликав Sentry тільки на `schema_drift`. Три інші види — `tool_error`, `protocol_error`, `upstream_unavailable` — лишали слід лише в `silpo_connection.last_failed_at` / `last_error_code`, тобто в таблиці, куди ніхто не дивиться. Наслідок: про зламаний синк дізнавались із того, що чеки перестали приходити, а не з дашборда.

Причина не в недогляді, а в конструкції: **`errorHandler` шле в Sentry лише НЕ-operational 5xx**, а все, що повертає цей мапер, — `AppError`, тобто operational. Отже будь-який збій інтеграції, про який ти хочеш бачити подію, потребує ЯВНОГО `captureException` у самому мапері. Додаєш вид відмови — вирішуй одразу, він сигналить чи ні; мовчання за замовчуванням тут коштує тижнями сліпоти.

Три властивості, які тримає тест поруч (`receipts.test.ts`):

- **Дедуп-вікно ведеться ПО ВИДУ, не одне спільне.** Спільний лічильник зробив би алерти взаємно глушними: `upstream_unavailable` (найчастіший і найменш цікавий) з'їдав би вікно, і `schema_drift`, який стається раз на місяці й вимагає правки коду, мовчав би 15 хвилин після нього.
- **Текст відмови Сільпо в подію НЕ потрапляє** — крім `schema_drift`, де опис форми складаємо ми самі. Чужий текст може нести поля покупки (Hard Rule #21), а вид збою для діагностики достатній; причина лишається в логах.
- **Заголовок `schema_drift` лишається дослівно тим, що був.** Заголовок — ключ групування Sentry, тож зміна формату завела б НОВУ issue замість того, щоб перевідкрити закриту, і зв'язок «та сама поломка повернулась» загубився б саме тоді, коли він потрібен.

**Очікувані стани користувача не сигналять узагалі** (`not_connected`, `reauth_required`, `auth_required`, `config_missing`, `rate_limited`): їх показує інтерфейс, а алерт на них дав би постійний червоний — тобто той самий вимкнений гейт, яким у корені обґрунтовано ратчети бандл-бюджетів.

## Бета-контур: деплой, який не може оновитись

**`beta-tau-gilt.vercel.app` стояв на серпневій збірці, а бот далі вів туди людей (знахідка 2026-09-17).** Усі 36 подій `SERGEANT-API-M` за 30 днів — з цього одного хоста, усі з iPhone, усі до логіну. Прод-близнюк (`SERGEANT-WEB-R` на `app.sergeant.com.ua`) при цьому мовчав з 1 вересня: корінь wasm-збою вилікувано 29 серпня.

Три речі склались так, що жодна з них сама по собі не помітна:

1. **Гілки `beta` в репозиторії не було.** Бета — окремий Vercel-проєкт (`run-beta-wave.md` § 0.3), який збирається з гілки `beta`. Чекаут почався 2026-09-14 при переїзді репо, гілка не переїхала — і проєкту не стало з чого збиратись. Останні збірки лишились серпневими.
2. **Сам себе такий деплой не лікує.** Реліз-цикл SW — `prompt` без `skipWaiting` (AI-DANGER у `apps/web/src/sw.ts`), тож `reloadOnceForChunkError` переасемблює ТОЙ САМИЙ старий прекеш. Проти стейл-прекешу лікує лише оновлення воркера, а не перезавантаження сторінки.
3. **У мертвий хост вів живий канал.** `TELEGRAM_BETA_APP_URL` (`src/env/telegramEnv.ts`) мав дефолт саме на цю адресу, і `/app` та `/install` у боті казали «Sergeant тут: …». **Закрито 2026-09-17 (рішення власника):** дефолт тепер порожній, а обидві команди в цьому стані віддають спільний текст про паузу й наступний раунд (`betaTexts.ts` → `NO_APP_URL_REPLY`). Правило на майбутнє записане тут же в AI-DANGER: адреса в дефолті легальна лише тоді, коли за нею стоїть деплой, який ОНОВЛЮЄТЬСЯ; хост, який більше ні з чого не збирається, гірший за порожній рядок.

**Урок ширший за випадок: замороженому фронтенду нема чим повідомити, що він заморожений.** Сервер про свою відсталість кричить (`/healthz` порівнює міграції з образом), а зібраний бандл — ні: він працює рівно так, як його зібрали, і єдиний його симптом — помилки, що виглядають як помилки коду, а не як вік. Тому `release` у події варто читати ПЕРШИМ: коли серпневий SHA приходить у вересні, діагноз уже поставлено.

**Наслідок для DSN.** Усі 47 браузерних подій у проєкті `sergeant-api` за 30 днів — з цього ж хоста: бета зібрана зі старим `VITE_SENTRY_DSN`. Попередження про це стоїть у [`env-vars.md § 13`](../../docs/engineering/integrations/env-vars.md) з 2026-08-16, але воно не мало як спрацювати — змінна живе у Vercel, поза чекаутом. Репо тут може лише документувати; перевіряти доводиться руками.

## Deeper docs

- App README: [`apps/server/README.md`](./README.md)
- Domain invariants: [`docs/engineering/architecture/domain-invariants.md`](../../docs/engineering/architecture/domain-invariants.md)
- Routing catalog: [`docs/start/agents/agent-skills-catalog.md`](../../docs/start/agents/agent-skills-catalog.md)
- Better Auth wiring: [`.agents/skills/better-auth-best-practices/SKILL.md`](../../.agents/skills/better-auth-best-practices/SKILL.md)
- HubChat tool/executor coordination: [`.agents/skills/sergeant-module-ai/SKILL.md`](../../.agents/skills/sergeant-module-ai/SKILL.md)
