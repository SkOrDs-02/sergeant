# Observability

> **Last touched:** 2026-07-21 by @Skords-01. **Next review:** 2026-10-19.
> **Status:** Active

SLOs, runtime signals, dashboards, and production operations.

| Document                                                     | Purpose                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| [`SLO.md`](./SLO.md)                                         | Service-level objectives                                    |
| [`error-budget-policy.md`](./error-budget-policy.md)         | Error budget policy and release freeze expectations         |
| [`metrics.md`](./metrics.md)                                 | Prometheus metrics reference                                |
| [`dashboards.md`](./dashboards.md)                           | Grafana dashboard overview                                  |
| [`dashboards/`](./dashboards/README.md)                      | Dashboard JSON models                                       |
| [`posthog-ftux-dashboards.md`](./posthog-ftux-dashboards.md) | PostHog FTUX-overview dashboard runbook (5 insights)        |
| [`posthog-founder-pulse.md`](./posthog-founder-pulse.md)     | PostHog Founder Pulse dashboard runbook (WF-60 growth)      |
| [`logging.md`](./logging.md)                                 | Pino, ALS, Sentry, Loki logging guidance                    |
| [`frontend.md`](./frontend.md)                               | Frontend observability                                      |
| [`lighthouse-ci.md`](./lighthouse-ci.md)                     | Lighthouse CI perf-budget gate (LCP/FCP/TBT, S10-T3)        |
| [`runbook.md`](./runbook.md)                                 | Runtime incident runbook                                    |
| [`engineering-metrics.md`](./engineering-metrics.md)         | DevEx / operating-system metrics and weekly digest ritual   |
| [`alert-bot-routing.md`](./alert-bot-routing.md)             | Маршрутизація алертів через n8n-воркфлоу до `tg_alert_acks` |
| [`csp-monitoring.md`](./csp-monitoring.md)                   | Моніторинг порушень Content Security Policy                 |
| [`env-vars.md`](./env-vars.md)                               | Змінні середовища для observability-підсистем               |
| [`hub-perf-baseline.md`](./hub-perf-baseline.md)             | RUM-baseline продуктивності вкладок HubChat                 |
| [`log-levels.md`](./log-levels.md)                           | Політика рівнів логування (Pino)                            |
| [`log-retention.md`](./log-retention.md)                     | Крон-архівування логів і політика зберігання                |
| [`pg-pool-sizing.md`](./pg-pool-sizing.md)                   | Налаштування пулу з'єднань Postgres, правила розміру, дебаг |
| [`sentry-sampling.md`](./sentry-sampling.md)                 | Політика sampling трейсів Sentry по маршрутах               |
| [`telegram-control-plane.md`](./telegram-control-plane.md)   | Telegram як control plane для Sergeant Ops                  |
| [`telemetry-rollout-plan.md`](./telemetry-rollout-plan.md)   | План розгортання телеметрії                                 |
| [`prometheus/`](./prometheus)                                | Prometheus alert_rules.yml та recording_rules.yml           |
