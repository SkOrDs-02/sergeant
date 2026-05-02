# Еволюція хостингу — що де хоститься і коли мігрувати

> **Last validated:** 2026-04-27 by Devin (automated). **Next review:** 2026-07-26.
> **Status:** Active

Reference-документ: де зараз живе кожен сервіс Sergeant, коли має сенс
мігрувати на інший хостинг / self-host, і чого робити **не** треба. Рішення
фіксуються тут, щоб не передоговорюватись щоквартально.

Суміжні документи:

- [`docs/launch/03-services-and-toolstack.md`](../launch/03-services-and-toolstack.md) — повний каталог сервісів з цінами.
- [`docs/integrations/railway-vercel.md`](../integrations/railway-vercel.md) — як налаштувати поточний стек (Railway + Vercel).
- [`docs/observability/`](../observability/) — SLO, метрики, runbook.
- [`docs/planning/dev-stack-roadmap.md`](../planning/dev-stack-roadmap.md) — топ-15 dev-інструментів.

---

## 1. Що таке observability (короткий глосарій)

Термін зустрічається у runbook-ах і playbook-ах, тож один раз розписуємо тут:

**Observability** — здатність відповідати на питання «що зараз відбувається в
системі і чому вона зламалась», **не додаючи новий код**. Три стовпи:

| Стовп       | Що це                                                       | У Sergeant                                                                                                                                 |
| ----------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Metrics** | Числа з часом (RPS, latency, error rate, DB pool, AI quota) | `prom-client` у [`apps/server/src/obs/metrics.ts`](../../apps/server/src/obs/metrics.ts), endpoint `GET /metrics` (bearer `METRICS_TOKEN`) |
| **Logs**    | Текстові події (`user signed in`, `query failed`)           | Pino JSON у stdout, ALS-контекст `{requestId, userId, module}` — див. [`docs/observability/logging.md`](../observability/logging.md)       |
| **Traces**  | Розпис одного запиту по функціях/сервісах (span tree)       | Ще не інструментовано; не MVP, OpenTelemetry додається у Фазі 3+                                                                           |

Суміжні SaaS:

- **Sentry** — ловить exceptions зі stack trace + `err.cause` чейн. Не замінює metrics/logs, доповнює.
- **PostHog** — про **поведінку юзера** (funnel, retention), не про помилки.
- **Grafana / Loki / Alertmanager** — UI + query + notification layer поверх Prometheus/Pino.

---

## 2. Правило класифікації сервісів

Перед кожним рішенням «хостити самому vs брати managed» застосовуй цей фільтр
у такому порядку:

1. **Чи можна це self-host-ити в принципі?** (Anthropic/FCM/APNs/Stripe — ні.)
2. **Скільки коштує managed free/hobby tier на твоєму обсязі?** Якщо $0 — беремо managed. Крапка.
3. **Скільки годин/місяць з'їсть self-host?** (setup + апдейти + інциденти). Помнож на свою ставку.
4. **Що станеться, якщо self-host ляже о 3 ночі?** Якщо відповідь «клієнти не побачать» — можна self-host. Якщо «клієнти побачать і я теж сплю» — managed.
5. **Чи self-host відповідає regulatory вимогам, яких managed не дає?** Для Sergeant — ні (ми вже обробляємо дані через Railway/Anthropic/Sentry).

---

## 3. Каталог: де живе кожен сервіс

### A. Managed SaaS — залишати, не тягнути на свій сервер

Self-host коштує більше часу ніж SaaS, і ти не хочеш бути operator-ом:

| Сервіс                   | Для чого                           | Чому managed                                                                                               |
| ------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Vercel** (Hobby)       | `apps/web` + CDN + preview deploys | Edge-nodes по світу, immutable cache, preview на кожен PR. Self-host CDN не має сенсу для SPA/PWA.         |
| **Railway** (Hobby)      | `apps/server` + Postgres + Redis   | Pre-deploy migrations, auto-deploy з GitHub, managed DB з бекапами. $5/міс — дешевше твого часу на setup.  |
| **Anthropic Claude**     | AI для chat / coach / nutrition    | Self-host LLM = GPU за $2–5k + інфра. Нерелевантно.                                                        |
| **Sentry** (free)        | Exceptions + stack traces          | Self-host Sentry = Postgres + Redis + Snuba + Clickhouse + Relay. Free tier 5k events/міс покриває MVP.    |
| **Resend** (free)        | Transactional email                | Власний SMTP = IP reputation, DKIM/SPF/DMARC, спам-фільтри Gmail. Пекло. $0 до 3k/міс.                     |
| **EAS Build**            | Нативні білди Expo (iOS/Android)   | iOS вимагає macOS + Apple sign keys. Self-host = купити Mac mini й тримати. Не зараз.                      |
| **Cloudflare R2**        | Фото їжі / тіла (Phase 2+)         | S3-сумісне, нуль egress fees. 10 GB free + $0.015/GB-міс. Self-host S3 (MinIO) — диски + бекапи.           |
| **Grafana Cloud** (free) | Metrics + Logs + Alerts UI         | 10k series Prometheus, 50 GB logs Loki, 14 днів retention. Покриває Sergeant на 1+ рік.                    |
| **PostHog Cloud** (free) | Product analytics, funnels, NSM    | Self-host PostHog = Clickhouse + Kafka + Zookeeper. Free tier 1M events/міс вистачає до кількох тисяч DAU. |
| **Stripe**               | Платежі                            | Self-host неможливий by definition.                                                                        |
| **FCM / APNs**           | Push нотифікації                   | Google/Apple, self-host неможливий.                                                                        |

### B. Managed зараз — можна перенести на свій сервер коли бюджет стане issue

Self-host технічно дешевший, але setup/maintenance з'їсть час поки ти не великий:

| Сервіс                  | Коли мігрувати на свій                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Postgres** (Railway)  | Коли Railway disk >50 GB або RAM >8 GB і ціна кусається. Тоді — Hetzner VPS з Postgres + wal-g у Backblaze B2.           |
| **Redis** (Railway)     | Коли Redis RAM >1 GB (rate-limits + sync cache + prompt cache) і Railway дорожчає. Той самий VPS.                        |
| **Railway сам по собі** | Коли фіксований $/міс перевищує $30–50 і трафік стабільний. Переїзд на Hetzner/Contabo + Docker Compose.                 |
| **Grafana Cloud free**  | Коли вичерпаний free tier (>10k active series або >50 GB logs/міс) — спочатку апгрейд до Pro ($49/міс), потім self-host. |

### C. Сервіси, які МАЮТЬ сенс на власному VPS (коли берете його)

Якщо вже береться Hetzner / Contabo — ось пріоритетний набір:

1. **BullMQ worker + scheduler** — Monobank polling, push digest cron, AI daily digests, weekly reports. Railway за background workers бере окремі гроші (вони крутяться 24/7 без HTTP trigger-у). На VPS — нуль додаткових коштів.

2. **Observability стек** (Prometheus + Grafana + Loki + Alertmanager) — коли переріс Grafana Cloud free. Docker Compose + 50 GB SSD під TSDB retention.

3. **Uptime-kuma** — external uptime checks. Пінгує `api.sergeant.app/health` з третього сервера, шле Telegram алерт коли Railway повністю ляже (у такому випадку і Sentry, і твої метрики теж лежать — без Uptime-kuma ти нічого не побачиш).

4. **Redis master** (якщо виносити з Railway) — rate-limits + sync cursor + AI prompt cache.

5. **pgbouncer** — connection pooler перед Postgres (якщо кількість connection-ів >100).

6. **Wireguard** — приватна мережа до БД / адмін-панелей без публічних портів.

7. **Локальний n8n / OpenClaw** — якщо [docs/launch/05-operations-and-automation.md](../launch/05-operations-and-automation.md) реально запускається і n8n cloud починає кусатись.

### D. Чого на власний VPS класти НЕ треба

- **S3-сумісне сховище (MinIO, SeaweedFS)** — Cloudflare R2 дешевший: ти платиш тільки за storage, не за диск+бекап диска+моніторинг диска. Перейти на self-host має сенс коли >500 GB.
- **Власний CDN** — Vercel/Cloudflare дають це безкоштовно. Перевідкривати колесо немає причин.
- **Self-host Sentry** — Snuba+Clickhouse+Relay — занадто дорого обслуговувати для <50k events/міс.
- **Власний LLM** — потреба у GPU, який не встигає за Anthropic по якості.

---

## 4. План по фазах

Кожна фаза прив'язана до розміру user-base і реальної виручки. Номери MAU — орієнтовні.

### Фаза 1 — MVP / закрита бета (0–100 юзерів) ← **ми тут**

**Інфраструктура:** Vercel + Railway + Sentry.

| Категорія      | Сервіс                             | $/міс   |
| -------------- | ---------------------------------- | ------- |
| Frontend       | Vercel (Hobby)                     | $0      |
| Backend + DB   | Railway (Hobby + Postgres + Redis) | ~$13    |
| AI             | Anthropic (dev usage)              | ~$10–50 |
| Error tracking | Sentry (free)                      | $0      |
| Email          | Resend (free)                      | $0      |
| Observability  | **НІЧОГО поверх Sentry**           | $0      |

**Разом:** ~$20–60/міс.

**Observability rules:**

- `/metrics` endpoint працює, але **ніхто не збирає**. Це ОК.
- Sentry + Railway dashboards (CPU/memory) = єдина точка моніторингу.
- Grafana Cloud **не** налаштовуємо — відволікає від фіч.

### Фаза 2 — публічний лаунч (100–1000 юзерів)

**Тригер:** готується Product Hunt / DOU / відкриваємо платежі.

**Додаємо:**

- **Grafana Cloud** (free tier) — скрейпимо `/metrics` через Grafana Agent (окремий маленький Railway-сервіс або локальний процес в apps/server контейнері). Імпортуємо `docs/observability/dashboards/sync.json`. Заливаємо `alert_rules.yml`. Підключаємо Telegram contact point.
- **pino-loki** транспорт у `apps/server` — Pino JSON пише одночасно в stdout (для Railway logs) і Loki push endpoint.
- **PostHog Cloud** (free) — funnel + retention events. Swap місцевого `analytics.ts`.
- **Stripe** — платежі. Див. [`docs/launch/06-monetization-architecture.md`](../launch/06-monetization-architecture.md).
- **UptimeRobot** (free) — простіший за Uptime-kuma, поки нема свого VPS.

**Разом:** ~$30–80/міс фіксованих (без маркетингу).

**Observability rules:**

- Кожен alert у `alert_rules.yml` має `runbook:` annotation → лінк на `docs/observability/runbook.md#секція`.
- SLO бюджети активні; burn-rate alert → Telegram (pager рівень).
- Self-host Grafana — **все ще ні**.

### Фаза 3 — growth (1000–5000 юзерів, реальна виручка)

**Тригер:** MRR стабільно >$200, background workload виріс.

**Додаємо перший VPS** (Hetzner CX22 ~€5/міс або Contabo VPS S ~$6/міс):

- **BullMQ worker + scheduler** — переїжджає з Railway (економія $5–10/міс worker slot + знімає CPU з web-service).
- **Uptime-kuma** — external health checks з незалежного хоста.
- (опційно) **n8n / OpenClaw** — якщо cloud-версія коштує >$20/міс.

**Postgres / Redis ще на Railway.** TSDB self-host поки рано.

**Разом:** ~$60–150/міс.

**Observability rules:**

- Tempo / OpenTelemetry traces можна вмикати (додаємо `@opentelemetry/api` у `apps/server`), export у Grafana Cloud Tempo. Free tier дає 50 GB traces.
- Якщо Grafana Cloud free вичерпано — апгрейд до Pro ($49/міс). Self-host **ще** не беремо.

### Фаза 4 — scale (5000+ юзерів, стійкий прибуток)

**Тригер:** Railway >$100/міс АБО DB >50 GB АБО Grafana Cloud Pro >$99/міс.

**Мігруємо:**

- **Postgres** → Hetzner VPS з streaming replication + wal-g у Backblaze B2. Cutover через logical replication, не big-bang.
- **Redis** → той самий або окремий VPS.
- (опційно) **Prometheus + Grafana + Loki self-host** — якщо Grafana Cloud Pro вже не вистачає.
- **pgbouncer** між app і Postgres.

**Railway** стає тільки для `apps/server` API (або теж мігрує на окремий VPS + reverse proxy).

**Разом:** ~$100–300/міс (плюс трафік / storage).

**Observability rules:**

- Required: власна observability стек вже self-host, бо хмарний Grafana для твоїх обсягів дорожчий за диск.
- Uptime-kuma з **третього регіону** — щоб падіння основного DC не ховало інциденти.

---

## 5. Антипатерни (чого НЕ робити)

- **«Візьму один потужний VPS, складу туди всі проекти».** Одна точка відмови, один апдейт Debian ламає все. Якщо self-host — кілька маленьких VPS з чітким поділом.
- **Self-host K8s / k3s / Nomad для соло-проекту.** Docker Compose рулить до кількох десятків тисяч RPS. Kubernetes — це hobby, не інструмент, до команди ≥3 dev-ів.
- **Переносити Postgres на свій VPS до Фази 4.** Бекапи, PITR, major-version upgrades, connection pooling — на це витрачаються тижні першого downtime-у. Managed Railway Postgres коштує $5–10/міс, твій час дорожчий.
- **Self-host Grafana до Фази 4.** Grafana не може алертити про саму себе — якщо ляже її сервер, ти не побачиш інцидент у проді. Хмарний Grafana має меншу кореляцію з твоєю інфрою.
- **Переплачувати за Grafana Cloud / Sentry Pro до Фази 2.** Free tier-ів вистачає на сотні юзерів.
- **Self-host Stripe / Anthropic / FCM.** Неможливо by definition. Згадано окремо, бо інколи питають «а чи можна».
- **Переїзд з Railway до того, як ціна Railway перевищить 3× ціну VPS.** Railway економить більше годин за місяць ніж коштує.

---

## 6. Міграційні тригери — короткий cheat-sheet

Коли бачиш що виконується хоч один — йди на наступну фазу:

| Тригер                                         | Дія                                                      |
| ---------------------------------------------- | -------------------------------------------------------- |
| Готується Product Hunt / DOU / публічний анонс | Фаза 2: увімкнути Grafana Cloud + PostHog + Stripe       |
| Stripe MRR стабільно >$200                     | Фаза 3: взяти перший VPS під BullMQ worker + Uptime-kuma |
| Railway рахунок >$50/міс                       | Фаза 3: подумати що винести на VPS                       |
| Railway рахунок >$100/міс АБО DB >30 GB        | Фаза 4: планувати міграцію Postgres                      |
| Grafana Cloud free вичерпаний (10k series)     | Фаза 3: апгрейд до Pro                                   |
| Grafana Cloud Pro >$99/міс                     | Фаза 4: self-host Prometheus + Grafana + Loki            |
| Sentry events >5k/міс                          | Апгрейд Sentry Team ($26/міс) — **не** self-host         |
| Фото їжі / тіла стають >5 GB                   | Вмикати Cloudflare R2, не тримати у Postgres BLOB        |

---

## 7. Запитання, які цей документ НЕ закриває

- Вибір регіонів VPS / multi-region deployment — коли прийде, окремий ADR.
- Міграція Railway → Fly.io / Render / Kamal — поки Railway вистачає, не обговорюємо.
- Database sharding — до 10M рядків у найбільшій таблиці не актуально.

---

## Посилання

- Повний каталог сервісів + ціни: [`docs/launch/03-services-and-toolstack.md`](../launch/03-services-and-toolstack.md).
- Monthly cost projection по фазах: [`03 §9`](../launch/03-services-and-toolstack.md#9-повна-monthly-cost-projection).
- Pre-launch чеклист (де observability — requirement): [`docs/launch/04-launch-readiness.md#3-моніторинг-та-алерти`](../launch/04-launch-readiness.md#3-моніторинг-та-алерти).
- Як налаштований поточний Railway + Vercel: [`docs/integrations/railway-vercel.md`](../integrations/railway-vercel.md).
- Observability reference: [`docs/observability/`](../observability/) (SLO, metrics, runbook, logging).
