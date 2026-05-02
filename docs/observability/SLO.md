# Service Level Objectives й Burn-rate-алерти

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active

> Автор: obs-team. Огляд щокварталу, або коли міняється архітектура.

Цей документ визначає **SLI/SLO** для Sergeant і прив'язує до них **multi-window
multi-burn-rate** алерти (Google SRE Workbook, Ch. 5). Формули SLI зібрані у
[`prometheus/recording_rules.yml`](./prometheus/recording_rules.yml), алерти —
у [`prometheus/alert_rules.yml`](./prometheus/alert_rules.yml). Порядок дій під
час алерту — у [`runbook.md`](./runbook.md).

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
пускає трохи повітря для майже-безкоштовного хостингу Railway і рідких
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

Prometheus `scrape_config` має тягти `GET /metrics` з Railway/Replit
entrypoint-у з `Authorization: Bearer $METRICS_TOKEN`. Приклад:

```yaml
scrape_configs:
  - job_name: sergeant
    metrics_path: /metrics
    authorization:
      credentials: "${METRICS_TOKEN}"
    static_configs:
      - targets: ["sergeant.railway.app"]
```

Потім у Prometheus конфіг додати rule_files:

```yaml
rule_files:
  - "docs/observability/prometheus/recording_rules.yml"
  - "docs/observability/prometheus/alert_rules.yml"
```

Alertmanager роутить `severity=page` → PagerDuty/telegram, `severity=ticket` →
email/Sentry issue.
