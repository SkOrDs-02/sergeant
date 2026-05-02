# Error-budget-політика

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active

> Автор: obs-team. Огляд щокварталу (див. [`docs/governance/policy-review.md`](../governance/policy-review.md)).
>
> Натхнення: [Google SRE Workbook, Ch. 5 — Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)
> та [Ch. 2 — Implementing SLOs](https://sre.google/workbook/implementing-slos/).

Цей документ описує **що робити, коли error budget вигорає** — від штатного
режиму до повного release freeze. SLI/SLO визначення та burn-rate алерти
задокументовані в [`SLO.md`](./SLO.md) (single source of truth).

---

## 1. Бюджети за SLO (30-day rolling window)

| Домен          | SLO    | Error budget (= 1 − SLO) | ≈ допустимий downtime / місяць |
| -------------- | ------ | ------------------------ | ------------------------------ |
| HTTP API       | 99.0 % | 1.00 %                   | 7 h 18 min                     |
| Sync           | 99.5 % | 0.50 %                   | 3 h 39 min                     |
| Auth           | 99.0 % | 1.00 %                   | 7 h 18 min                     |
| AI (Anthropic) | 97.0 % | 3.00 %                   | 21 h 54 min                    |
| External HTTP  | 95.0 % | 5.00 %                   | 36 h 30 min                    |

Latency-бюджети (p95 порушення) рахуються окремо — breach відображається
на дашборді, але **не тригерить freeze** (latency SLO легше обсервити
візуально; burn-rate на latency не рахуємо — див. SLO.md §2).

---

## 2. Зони policy

### 🟢 Зелена — бюджет > 50 %

Нормальний режим розробки:

- Усі типи змін дозволені (features, refactors, dependency bumps, docs).
- Burn-rate алерти можуть спрацьовувати ситуативно (один-два тікети) — обробляємо
  за [`runbook.md`](./runbook.md) і рухаємося далі.

### 🟡 Жовта — бюджет 10–50 %

**Freeze ризикованих змін.** Мета — уповільнити витрату бюджету.

| Заборонено                                   | Дозволено                                  |
| -------------------------------------------- | ------------------------------------------ |
| Нові endpoints / routes                      | Bug fixes (не feature)                     |
| Міграції з `DROP` / `RENAME` (two-phase ≥ 2) | Phase-1 міграції (ADD COLUMN NULL/DEFAULT) |
| Dependency major bumps                       | Dependency patch/minor (security)          |
| Великі refactors (> 200 LOC diff)            | Observability / monitoring fixes           |
| Нові AI tool definitions                     | Hotfixes для активних інцидентів           |
| —                                            | Security fixes (будь-якої severity)        |

### 🔴 Червона — бюджет < 10 % АБО burn-rate alert (page) active

**Freeze усіх non-critical змін.**

**Дозволено (always-allowed):**

- Security fixes (CVE high / critical).
- Hotfixes для активних інцидентів (customer-impacting).
- Data-loss / data-corruption fixes.
- GDPR / legal compliance patches.
- Rollback-only PRs.
- Observability fixes (алерти, дашборди, метрики).

**Заборонено:**

- Feature work (будь-яке).
- Refactors (будь-які).
- Dependency bumps (окрім security).
- Docs зміни (окрім observability/incident docs).
- Non-security CI config зміни.

Кожен PR у червоній зоні, що не є rollback, **вимагає** лейбл
`error-budget-exception` та approval від мінімум одного reviewer.

### ⚫ Чорна — бюджет вичерпано (0 %)

**Повний release freeze.**

1. Активувати incident bridge (Telegram/Slack ops-channel).
2. Усі зміни — лише rollback або hotfix для активного інциденту.
3. Провести post-mortem протягом 48 годин.
4. Roadmap reset: переглянути sprint backlog, пріоритизувати reliability items.
5. Зняти freeze тільки коли бюджет повернеться у червону зону (> 0 %) **і**
   post-mortem action items закриті або заплановані.

---

## 3. Оголошення та зняття freeze

| Дія                               | Хто                                    | Як                                                                         |
| --------------------------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| Оголошення жовтої / червоної зони | On-call інженер або tech lead          | GitHub issue з лейблом `error-budget-freeze` + повідомлення в ops-channel  |
| Оголошення чорної зони            | Tech lead                              | GitHub issue `error-budget-freeze` + `severity:critical` + incident bridge |
| Зняття freeze                     | Tech lead (або on-call за погодженням) | Закриття issue `error-budget-freeze` + повідомлення в ops-channel          |
| Exception у червоній/чорній зоні  | Автор PR                               | Лейбл `error-budget-exception` на PR + 1 approver                          |

**Escalation**: якщо burn-rate alert не resolved протягом 1 години —
on-call ескалює до tech lead. Якщо бюджет продовжує горіти після першого
hotfix — створюємо dedicated incident.

---

## 4. Виключення (always-allowed навіть у червоній/чорній зоні)

Наступні типи змін **завжди дозволені**, незалежно від зони:

1. **Security CVE patches** (high / critical) — відомі вразливості не чекають на бюджет.
2. **Data-loss / data-corruption fixes** — integrity даних пріоритетніша за freeze.
3. **GDPR / legal compliance** — юридичні зобов'язання не зупиняються.
4. **Customer-impacting hotfixes** для активних інцидентів — якщо користувач не може
   виконати core flow (login, sync, transactions), фіксимо негайно.

**Вимоги до кожного виключення:**

- PR має лейбл `error-budget-exception`.
- Мінімум 1 approver (не автор).
- У PR description — пояснення, чому це не може чекати.

---

## 5. Як перевірити поточну зону

### Prometheus query (HTTP API приклад)

```promql
# Поточний error rate за 30 днів
1 - (
  sum(rate(http_requests_total{status=~"5.."}[30d]))
  /
  sum(rate(http_requests_total[30d]))
)
```

Результат порівнюємо з SLO (0.99 для HTTP API):

```
budget_remaining = (current_availability - SLO) / (1 - SLO)
```

Наприклад, якщо `current_availability = 0.995`:

```
budget_remaining = (0.995 - 0.99) / (1 - 0.99) = 0.5 = 50%  → жовта зона
```

### Аналогічно для інших SLO

| SLO           | Query (error ratio)                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP API      | `rate(http_requests_total{status=~"5.."}[30d]) / rate(http_requests_total[30d])`                                                          |
| Sync          | `rate(sync_operations_total{outcome=~"error\|too_large\|unauthorized"}[30d]) / rate(sync_operations_total[30d])`                          |
| Auth          | `rate(auth_attempts_total{outcome="error"}[30d]) / rate(auth_attempts_total[30d])`                                                        |
| AI            | `rate(ai_requests_total{outcome!="ok"}[30d]) / rate(ai_requests_total[30d])`                                                              |
| External HTTP | `rate(external_http_requests_total{upstream="X",outcome=~"error\|timeout"}[30d]) / rate(external_http_requests_total{upstream="X"}[30d])` |

### Дашборд

Рекомендований Grafana-дашборд: [`dashboards.md`](./dashboards.md).
Панель «Error Budget Remaining (%)» має показувати поточний % бюджету
для кожного SLO з кольоровими зонами (зелена > 50 %, жовта 10–50 %,
червона < 10 %, чорна = 0 %).

---

## 6. Перегляд політики

Ця політика переглядається **раз на квартал** у рамках загального policy
review (див. [`docs/governance/policy-review.md`](../governance/policy-review.md)).

Під час перегляду оцінюємо:

- Чи були freeze за минулий квартал? Скільки разів входили в жовту/червону/чорну зону?
- Чи пороги зон адекватні? (50/10/0 % — дефолтні, можна скоригувати).
- Чи exception процес працює? Чи не зловживають `error-budget-exception`?
- Чи SLO самі по собі актуальні? (якщо ні — оновити [`SLO.md`](./SLO.md) першим).
