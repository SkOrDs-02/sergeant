# Service Level Objectives й Burn-rate-алерти

> **Last touched:** 2026-09-02 by @claude. **Next review:** 2026-12-22.
> **Status:** Active

> Автор: obs-team. Огляд щокварталу, або коли міняється архітектура.

Цей документ визначає **SLI/SLO** для Sergeant і прив'язує до них **multi-window
multi-burn-rate** алерти (Google SRE Workbook, Ch. 5). Формули SLI зібрані у
[`prometheus/recording_rules.yml`](./prometheus/recording_rules.yml), алерти —
у [`prometheus/alert_rules.yml`](./prometheus/alert_rules.yml). Порядок дій під
час алерту — у [`runbook.md`](./runbook.md).

## Статус wiring (чесний зріз, 2026-07-26)

> **Не читай «0 firing» як здоров'я, поки не перевірив, що ruler взагалі
> оцінює правила.** Редакція від 2026-06-26 стверджувала «0 firing / 0 pending
> — здоровий стан». Під час аудиту 2026-07-26 ruler відповідав
> `rule evaluation is disabled for tenant 3147374` — тобто нуль означав «жоден
> алерт не може спрацювати». Grafana Cloud **автоматично вимикає rule
> evaluation тенанту, у який не надходять метрики**: інжест помер 14 липня,
> слідом замовк і ruler. Після відновлення скрейпу evaluation увімкнувся сам,
> без втручання в portal. Перевірочна команда:
>
> ```bash
> curl -s -H "Authorization: Bearer $GRAFANA_TOKEN" \
>   "https://skords01.grafana.net/api/datasources/proxy/uid/grafanacloud-prom/api/v1/rules" \
>   | head -c 200
> ```
>
> `"status":"error"` з `rule evaluation is disabled` = алертингу немає взагалі.

**Wired сьогодні ✅**

- **Метрики → Grafana Cloud Prometheus.** Сервіс `grafana-alloy` скрейпить
  `/metrics` сервера (кожні 15s, bearer `METRICS_TOKEN`) і `remote_write`-ить у
  Grafana Cloud (`prometheus-prod-39-prod-eu-north-0`, tenant `3147374`).
  Живе на **Coolify** (Hetzner), не на Railway. `up{job="sergeant-server"}=1`,
  ~250 семплів на скрейп.
- **Grafana-managed алерти.** Група `sergeant-meta` у теці `Sergeant Ops`:
  `SergeantMetricsPipelineDown` (детект зникнення метрик через `NoData` →
  `Alerting`) і `SergeantHttp5xxBurnFast`. Оцінюються **в Grafana**, а не в
  Mimir — тому переживають вимкнення тенант-ruler-а й лишаються останньою
  лінією захисту саме тоді, коли Mimir замовкає. Маршрут — contact point
  `telegram-ops` за `severity=page`. Форма правил канонічна
  (`A(range) → B(reduce) → C(threshold)`): скорочена `A(instant) → C` дає
  вічний `NoData` і мовчазно неробочий алерт.
- **Помилки + performance traces → Sentry** (`SENTRY_DSN`, per-route sampling).
  Проєкти: `sergeant-api`, `sergeant-web`, `sergeant-mobile`.
- **Продуктова аналітика → PostHog EU** (проєкт `167740`), web-трафік.

- **Mimir ruler → знову оцінює.** [`recording_rules.yml`](./prometheus/recording_rules.yml)
  і [`alert_rules.yml`](./prometheus/alert_rules.yml) — 11 груп, **24 alerting +
  29 recording rules**, 0 firing / 0 pending (цього разу справді здоровий стан).
  `sli:*` recording-метрики знову обчислюються (`sli:http_latency_p95_ms:rate5m`
  ≈ 27 ms на момент перевірки), тому burn-rate-панелі наповнюються.
- **PostHog server-side capture увімкнено.** `POSTHOG_PROJECT_API_KEY` додано в
  Coolify, сервер передеплоєно 2026-07-26 — `subscription_started` зі Stripe
  тепер має долітати.

**Зламано / не працює ❌**

- **Логи → Loki не йдуть.** Креди валідні (прямий push дає `204`), env-змінні
  `GRAFANA_CLOUD_LOKI_{URL,USERNAME,TOKEN}` задані в Coolify, `pino-loki` є в
  залежностях — але інстанс порожній (0 лейблів за 29 днів). Транспорт мовчки
  не емітить; причина не встановлена.
- **Голова growth-воронки не фаїться.** `signup_completed` спрацював 1 раз за
  365 днів проти 100 `onboarding_completed` — подія викликається лише в
  email+пароль шляху (`AuthContext.tsx`), а OAuth-редиректи Google/Apple її
  оминають. Наслідок: усі воронкові інсайти Founder Pulse віддають 0 рядків.

> **Урок про fail-open.** `POSTHOG_PROJECT_API_KEY` був відсутній у Coolify,
> тому [`posthogCapture.ts`](../../../apps/server/src/lib/posthogCapture.ts)
> навмисно повертав `skipped` — і `subscription_started` не фаявся **жодного
> разу за 180 днів**, не зронивши жодної помилки. Fail-open правильний для
> Stripe-вебхука (аналітика не має ламати білінг), але означає, що відсутність
> телеметрії треба ловити **окремим** сигналом — тишу ніхто не помічає.

**Ще не зроблено / поза runtime 📐**

- **Alertmanager не використовується.** [`alertmanager.yml`](./alertmanager.yml) —
  **Deprecated** legacy-артефакт; маршрутизація йде через Grafana Cloud managed
  alerting (contact point `telegram-ops`), не через self-hosted Alertmanager.
- **Імпорт дашбордів** ([`dashboards/`](./dashboards/)) у Grafana Cloud — ручний
  крок без звірки, тому drift накопичується мовчки.
- **UptimeRobot** (зовнішній blackbox-сигнал downtime) — досі founder-gated.
  Це єдина ланка, що не залежить від власного пайплайна.

### Інцидент 2026-07-14 → 2026-07-26 (12 днів без метрик)

Коміт `1d20c958c` (2026-07-12) прибрав `ops/grafana-alloy/railway.toml` разом з
рештою Railway-конфігів, але Coolify-еквівалент не створили. Колектор помер
2026-07-14 06:07 UTC — обидва скрейп-таргети зникли одночасно. Ніхто не
помітив, бо сигнал про смерть пайплайна мав іти **тим самим пайплайном**, а
Mimir-ruler до того ж не оцінював правила. Урок закріплено правилом
`SergeantMetricsPipelineDown`, яке спрацьовує саме на `NoData`.

## TL;DR

| Домен          | SLI (availability)                                                          | Ціль   | Latency SLO (p95)          |
| -------------- | --------------------------------------------------------------------------- | ------ | -------------------------- |
| HTTP API       | non-5xx / total                                                             | 99.0 % | `/api/*` без AI — `< 1s`   |
| Sync           | non-`error` + non-`too_large` + non-`unauthorized` (ok/conflict/empty рах.) | 99.5 % | `< 2.5s`                   |
| Auth           | outcome ∉ {`error`} (bad_credentials/rate_limited — не відмова сервісу)     | 99.0 % | session lookup `< 100ms`   |
| AI (Anthropic) | outcome = `ok` / total                                                      | 97.0 % | non-stream request `< 30s` |
| External HTTP  | outcome ∈ {`ok`,`hit`,`miss`} / total (per-upstream)                        | 95.0 % | —                          |

**Вікно**: 30 діб rolling. **Error budget** = `1 - SLO`. Наприклад для HTTP API
1 % бюджету ≈ 7h12m downtime / місяць. Що робити, коли бюджет вигорає —
див. [`error-budget-policy.md`](./error-budget-policy.md).

---

## 1. HTTP API availability (SLO 99.0 %)

**SLI**

```
sum(rate(http_requests_total{status=~"5.."}[w]))
/
sum(rate(http_requests_total[w]))
```

**Чому 99 %**: це персональний PWA, не SaaS із SLA. 99 % (≈7h/міс budget)
пускає трохи повітря для майже-безкоштовного хостингу (Hetzner CX23, ~$7/міс) і рідких
Anthropic outage-ів, які ми проксіюємо.

**Виключення**: 4xx помилки не рахуються як відмови сервісу (це валідація /
auth). Вони моніторяться окремо через `rate_limit_hits_total{outcome="blocked"}`
та `app_errors_total{status=~"4.."}`.

**Burn-rate алерти**:

- **Page (fast)** — 1h+5m long/short window, поріг 14.4×(1-SLO) = 14.4 %. Спрацьовує,
  коли за останню годину вигорає ≈2 % місячного бюджету.
- **Ticket (slow)** — 6h+30m window, поріг 6×(1-SLO) = 6 %. Повільніший burn
  для тривалих деградацій, які не тригерять fast.

## 2. HTTP latency (SLO p95 < 1s, non-AI)

**SLI**

```
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_ms_bucket{path!~"/api/(chat|coach|weekly-digest|nutrition/.*)"}[w])) by (le)
)
```

AI endpoint-и виключаємо — у них власний latency SLO в секції 4.

**Алерт**: просто threshold `> 1000` стабільно 15m. Burn-rate на latency не
рахуємо — latency SLO легше обсервити на дашборді, ніж через error-budget.

### 2.1 Health endpoint p95

Health/readiness/liveness probes мають окремий легший SLO: p95 `< 100ms` over
5m для `path=~"/health(|/.*)|/healthz|/readyz|/livez|/startupz"`.

Recording rule: `job:health_p95_5m` у
[`prometheus/recording_rules.yml`](./prometheus/recording_rules.yml). Alert:
`BackendHealthP95High` у
[`prometheus/alert_rules.yml`](./prometheus/alert_rules.yml), `severity=ticket`,
`for=5m`.

Це не page, бо повільний health endpoint сам по собі не означає downtime; це
ранній сигнал cold-start / DB pool / event-loop деградації, який треба
розслідувати перш ніж Coolify почне рестартити unhealthy-контейнер. Route для
`severity=ticket` уже є в [`alertmanager.yml`](./alertmanager.yml).

## 3. Sync (SLO 99.5 %)

**SLI (доступність)**

```
sum(rate(sync_operations_total{outcome=~"error|too_large|unauthorized"}[w]))
/
sum(rate(sync_operations_total[w]))
```

`conflict` і `empty` — очікувані бізнес-стани (не відмова), тому не у чисельнику.

**Чому 99.5 %**: sync — критичний шлях (без нього клієнт не бачить оновлень
з інших девайсів), тому жорсткіший бюджет ніж у HTTP.

**Latency SLO**: `histogram_quantile(0.95, sum(rate(sync_duration_ms_bucket[w])) by (le)) < 2500`

### 3.1 Термінальні reject-и per-op (`SyncApplyFailedSpike`)

SLI вище рахує **запити**, а не окремі операції: батч, у якому кожен op
відхилено, повертає HTTP 200 і потрапляє в чисельник як успіх. Саме ця сліпа
пляма дала багу з типами PK у Рутині прожити 12 днів — сервер увесь час писав
`sync_v2_apply_failed` і крутив лічильник, але правило, яке б на це дивилось,
не існувало (аудит `docs/90-work/audits/web-qa-pre-beta.md`).

```
sum(rate(sync_op_log_apply_total{status="rejected",reason!="lww_conflict"}[15m])) by (table, reason)
> 0
```

`lww_conflict` виключено навмисно — це штатний програш last-write-wins, а не
відмова. Будь-яка інша термінальна причина (`apply_failed`, `missing_id`,
`table_not_allowed`, …) означає, що дані користувача не доїхали і самі не
доїдуть.

**Поріг**: перші 15 хв поспіль з ненульовим rate по будь-якій парі
`(table, reason)` → warning. Стійкий ненульовий rate по одній таблиці — це
майже завжди розлад схеми, а не поодинокий збійний рядок, тому мітка `table`
у правилі обовʼязкова: без неї «трохи реджектів» розмазується по всіх модулях
і виглядає як шум.

**Клієнтський бік**: `markRejected` у `apps/web/src/core/syncEngine/singleton.ts`
шле той самий факт у Sentry (`area=sync`, `reject_reason`), щоб розлад було
видно навіть там, де до Prometheus руки не дійшли.

**Статус**: design-only, як і решта правил у цьому документі — див. § «Статус
wiring».

## 4. Auth (SLO 99.0 %)

**SLI**

```
sum(rate(auth_attempts_total{outcome="error"}[w]))
/
sum(rate(auth_attempts_total[w]))
```

`bad_credentials`, `rate_limited`, `invalid` — це поведінка користувача, не
відмова сервісу, тому вилучені з чисельника.

**Session lookup latency SLO**: `histogram_quantile(0.95, sum(rate(auth_session_lookup_duration_ms_bucket[w])) by (le)) < 100` — кожен запит до API проходить через
session-check; якщо цей p95 > 100ms → падає p95 всього API.

## 5. AI (Anthropic) (SLO 97.0 %)

**SLI**

```
sum(rate(ai_requests_total{outcome!="ok"}[w]))
/
sum(rate(ai_requests_total[w]))
```

**Чому 97 %**: LLM-бекенди самі по собі шумні (rate-limit, model overload),
і rate-limit на Anthropic ми наразі не обходимо. 97 % = 21h6m budget / міс.

**Latency SLO**: `histogram_quantile(0.95, sum(rate(ai_request_duration_ms_bucket[w])) by (le, endpoint)) < 30000` — per-endpoint, щоб швидкі
(coach-insight, ~3s) не ховали повільні (weekly-digest, ~30s).

## 6. External HTTP per-upstream (SLO 95.0 %)

**SLI**

```
sum(rate(external_http_requests_total{upstream="X",outcome=~"error|timeout"}[w]))
/
sum(rate(external_http_requests_total{upstream="X"}[w]))
```

Для Monobank/Privat/OFF/USDA/UPCitemdb. Поріг м'якший бо ми не контролюємо
їхню доступність. Алерт — тільки ticket-рівня (не page).

## 7. Process-рівня (не SLO, hard alerts)

Жорсткі алерти без burn-rate логіки. `page` — для симптомів, що ламають
увесь процес або фронтують реальних користувачів:

- `unhandled_rejections_total` має інкремент за 5m → **page** (request hung/double-response).
- `uncaught_exceptions_total` має інкремент за 5m → **page** (process стан inconsistent).
- `db_pool_waiting > 0` протягом 10m → **page** (усі запити stalled).

`ticket` — для сигналів "завжди баг, але не обов'язково прод-аварія":

- `app_errors_total{kind="programmer"}` має інкремент за 5m → **ticket** + Sentry issue.
  Одноразовий throw на краю валідації не варто будити on-call о 3-й ночі.

---

## Burn-rate-математика (коротко)

Для SLO з бюджетом `B = 1 - SLO` (напр. B=0.01 для 99 %):

- **Page (1h+5m window)**: burn rate ≥ `14.4`, тобто `error_ratio_1h ≥ 14.4·B` **І** `error_ratio_5m ≥ 14.4·B`.
  За такого темпу весь 30-day бюджет згорить за `30d / 14.4 ≈ 2d` (50h). За 1h
  при цьому спалюється `14.4 / (30·24) ≈ 2 %` місячного бюджету — звідси
  короткий trigger-window і page-severity.
- **Ticket (6h+30m window)**: burn rate ≥ `6`, тобто `error_ratio_6h ≥ 6·B` **І** `error_ratio_30m ≥ 6·B`.
  Бюджет згорить за `30d / 6 = 5d`.

Дві умови AND (long-window + short-window) захищають від false-positive, коли
ratio пульсує.

Деталі: https://sre.google/workbook/alerting-on-slos/ розділ "Multiwindow, Multi-Burn-Rate Alerts".

---

## 8. Frontend Core Web Vitals (baseline-збір)

**SLI** (per-metric): частка "good"-вимірів по CWV порогах Google.

```
sum(rate(web_vitals_duration_ms_count{metric="LCP",rating="good"}[w]))
/
sum(rate(web_vitals_duration_ms_count{metric="LCP"}[w]))
```

Аналогічно для `INP`, `FCP`, `TTFB`; CLS — окремий histogram `web_vitals_cls`.

**Ціль**: поки **не фіксуємо SLO** — спочатку збираємо ~2 тижні baseline з
реальних браузерів, щоб побачити розподіл на наших девайсах і мережах. Google
рекомендує таргетувати **≥75 % "good"** сесій на p75 (що еквівалентно
`rating="good"` або кращому) — повернемось до формалізації алертів коли
набереться дата.

**Джерело**: `web-vitals` npm пакет на клієнті (див. `apps/web/src/core/observability/webVitals.ts`),
батч через `navigator.sendBeacon` на `visibilitychange=hidden` / `pagehide`,
бекенд-ендпоінт `POST /api/metrics/web-vitals` (rate-limited 60 req/min/IP),
запис у `web_vitals_duration_ms{metric,rating}` і `web_vitals_cls{rating}`.

**Кардинальність**: 4×3 + 3 = 15 серій × бакети — безпечно.

**Застереження**: endpoint анонімний (збір CWV має сенс і від гостей), тому
дані можуть бути "забруднені" ботами / devtools-сесіями. Якщо спам стане
проблемою — додати `window.chrome.webstore`-heuristics або CAPTCHA fingerprint
у payload.

---

## Як підключити

Prometheus `scrape_config` має тягти `GET /metrics` з Hetzner/Coolify
entrypoint-у з `Authorization: Bearer $METRICS_TOKEN`. Приклад:

```yaml
scrape_configs:
  - job_name: sergeant
    metrics_path: /metrics
    authorization:
      credentials: "${METRICS_TOKEN}"
    static_configs:
      - targets: ["<sergeant-api-host>"]
```

Потім у Prometheus конфіг додати rule_files:

```yaml
rule_files:
  - "docs/03-operations/observability/prometheus/recording_rules.yml"
  - "docs/03-operations/observability/prometheus/alert_rules.yml"
```

Current production routing: `severity=page` → Telegram incidents (n8n WF-98 виведено — ADR-0090) +
founder DM, `severity=ticket` → Sentry issue or backlog ticket. PagerDuty is not
currently wired and should be treated as a future escalation option, not an
active dependency.
