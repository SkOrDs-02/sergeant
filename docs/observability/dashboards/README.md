# Дашборди Grafana

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active

JSON-файли дашбордів Grafana для observability сервера Sergeant — готові до імпорту.

## Дашборди

| Файл                 | Опис                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `http-red.json`      | HTTP RED-метрики — rate, errors, duration (p50/p95/p99). Фільтрує за `module` і `path`.                       |
| `db-use.json`        | Postgres pool USE — utilization, saturation (waiting clients), помилки за кодом, повільні запити, тривалості. |
| `slo-burn-rate.json` | Multi-window multi-burn-rate SLO-огляд — HTTP, Sync, Auth, AI, External HTTP, health процесу.                 |

## Як імпортувати

1. Відкрийте Grafana UI.
2. Перейдіть у **Dashboards → New → Import** (або іконка «+» → Import).
3. Натисніть **Upload JSON file** і виберіть потрібний `.json`-файл, **або** вставте вміст файлу в поле «Import via panel json».
4. У діалозі імпорту виберіть Prometheus-datasource для змінної `DS_PROMETHEUS`.
5. Натисніть **Import**.

## Datasource-змінні

Усі дашборди очікують одну datasource-змінну:

| Змінна          | Тип        | Опис                                                                    |
| --------------- | ---------- | ----------------------------------------------------------------------- |
| `DS_PROMETHEUS` | Prometheus | Prometheus-інстанс, який скрейпить ендпойнт `/metrics` сервера Sergeant |

Секція `__inputs` у кожному JSON оголошує цю змінну. Grafana запитає її значення під час імпорту.

## Темплейт-змінні (по дашборду)

### http-red.json

| Змінна   | Опис                                                            |
| -------- | --------------------------------------------------------------- |
| `path`   | Фільтр за HTTP-path (multi-select, за замовчуванням All)        |
| `module` | Фільтр за лейблом `module` (multi-select, за замовчуванням All) |

### db-use.json

Жодних додаткових темплейт-змінних, окрім `DS_PROMETHEUS`.

### slo-burn-rate.json

Жодних додаткових темплейт-змінних, окрім `DS_PROMETHEUS`. Усі SLI-запити посилаються на попередньо обчислені recording rules з `docs/observability/prometheus/recording_rules.yml`.

## Очікувані лейбли

Дашборди покладаються на лейбли, які емітить `apps/server/src/obs/metrics.ts`:

- **`module`** — доменний модуль (finyk, fizruk, nutrition, routine, core тощо).
- **`path`** — HTTP route path.
- **`status`** / **`status_class`** — HTTP status code / клас (2xx, 4xx, 5xx).
- **`op`** — назва операції з БД.
- **`code`** — Postgres error code.
- **`upstream`** — імʼя зовнішнього HTTP-сервісу (monobank, anthropic, off, usda тощо).
- **`outcome`** — категорія результату (ok, error, timeout, hit, miss тощо).
- **`endpoint`** — назва AI-ендпойнта (chat, coach, weekly-digest тощо).

## Залежність від recording rules

Дашборд **slo-burn-rate** використовує попередньо обчислені recording rules (метрики `sli:*`), визначені у [`../prometheus/recording_rules.yml`](../prometheus/recording_rules.yml). Переконайтесь, що ці правила завантажені у вашій конфігурації Prometheus. Пороги алертів — у [`../prometheus/alert_rules.yml`](../prometheus/alert_rules.yml).

## Сумісність

- **Grafana**: 10+ (schemaVersion 39).
- **Prometheus**: 2.x+ із підтримкою recording rules.
- **Timezone**: дашборди за замовчуванням використовують `Europe/Kyiv`.

## Пов'язані доки

- [Визначення SLO](../SLO.md)
- [Runbook](../runbook.md)
- [Dashboard PromQL reference](../dashboards.md)
