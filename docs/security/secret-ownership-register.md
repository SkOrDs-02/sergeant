# Secret Ownership Register

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

Operational metadata registry for secrets and privileged system credentials in Sergeant. This register documents ownership and blast radius, never secret values.

## Register

> **Schema note (2026-05-06).** Колонки `Status` і `Lifetime` додані як частина action-item §A4 з [`docs/audits/archive/2026-05-04-csp-disable-retrospective.md`](../audits/archive/2026-05-04-csp-disable-retrospective.md). `Status` = `active` для секретів у production-обігу або `removed YYYY-MM-DD` (з опційним коментарем) для retired-row-ів, що залишаються тут як audit-trail для governance/SOC2. `Lifetime` = `ongoing` для активних або `YYYY-MM-DD → YYYY-MM-DD` для closed-вікон. Retired-row-и не видаляємо — фіксуємо у §Retired secrets нижче.

| System / secret group                                | Owner   | Storage location                             | Consumer systems                                              | Rotation cadence                          | Rollback / compatibility note                                               | Compromise impact                                           | Status | Lifetime | Last reviewed |
| ---------------------------------------------------- | ------- | -------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- | ------ | -------- | ------------- |
| Better Auth secret and session-critical auth secrets | Founder | Railway prod env, local `.env`, CI if needed | `apps/server`, auth/session flows                             | On compromise or auth-architecture change | Rotation invalidates sessions; do during low-traffic window                 | Global login/session disruption                             | active | ongoing  | 2026-05-01    |
| Postgres production credentials                      | Founder | Railway managed secret references            | `apps/server`, migration tooling, health checks               | On compromise or provider rotation event  | Coordinate with runtime and migration access                                | Full data-plane compromise risk                             | active | ongoing  | 2026-05-01    |
| Anthropic / OpenAI provider keys                     | Founder | Railway prod env                             | AI endpoints, console-agent workloads, HubChat orchestration  | Monthly review, immediate on suspicion    | No backward compatibility; update all runtimes together                     | Cost abuse, feature outage, prompt-serving disruption       | active | ongoing  | 2026-05-01    |
| Sentry auth / DSN / admin secrets                    | Founder | Railway env, vendor console                  | `apps/server`, `apps/web`, alerting workflows                 | Quarterly or on compromise                | DSN swaps are usually low-risk; admin-token rotation may break integrations | Lost error visibility or unauthorized issue access          | active | ongoing  | 2026-05-01    |
| PostHog project / admin secrets                      | Founder | Railway env, vendor console                  | product analytics, release annotations, behavioral dashboards | Quarterly or on compromise                | Reconfigure integrations after rotation                                     | Behavioral data exposure, analytics tampering               | active | ongoing  | 2026-05-01    |
| Telegram bot token / console-agent credentials       | Founder | Railway env                                  | `tools/openclaw`, bot runtime                                 | On compromise or role change              | Rotation can interrupt bot flows until redeploy                             | Internal bot impersonation or action abuse                  | active | ongoing  | 2026-05-01    |
| Push / mobile distribution credentials               | Founder | App store consoles, local release tooling    | `apps/mobile`, `apps/mobile-shell`, release workflows         | On compromise or certificate expiry cycle | Store propagation may delay full recovery                                   | Broken mobile release pipeline or malicious app update risk | active | ongoing  | 2026-05-01    |
| n8n integration credentials                          | Founder | n8n runtime, vendor consoles                 | workflow automations, webhook relays                          | Quarterly review, immediate on compromise | Validate workflow health after rotation                                     | Automation misuse or external service abuse                 | active | ongoing  | 2026-05-01    |

## Retired secrets

Audit-trail row-и для retired runtime-flag-ів і secret group-ів. Зберігаємо тут (а не видаляємо) для SOC2-evidence і кореляції з incident-record-ами.

| System / secret group             | Owner   | Storage location | Consumer systems             | Rotation cadence              | Rollback / compatibility note                                                                                                                                                                                                                                       | Compromise impact                                                                                                                                                                                                                                                         | Status             | Lifetime                | Last reviewed |
| --------------------------------- | ------- | ---------------- | ---------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------- | ------------- |
| `CSP_DISABLE` runtime kill-switch | Founder | Railway prod env | `apps/server` CSP middleware | n/a (kill-switch — не secret) | Видалено з коду + EnvSchema у [PR #1631](https://github.com/Skords-01/Sergeant/pull/1631) (2026-05-04). Введено у [PR #128](https://github.com/Skords-01/Sergeant/pull/128) (2026-04-18); warn-on-boot — [PR #345](https://github.com/Skords-01/Sergeant/pull/345). | Якщо enabled у проді — повний CSP-bypass на API origin. Audit ([`2026-05-04-csp-disable-retrospective.md`](../audits/archive/2026-05-04-csp-disable-retrospective.md)) підтвердив: ніколи не enabled у production за 16-day window (Railway env + Sentry + boot-log = 0). | removed 2026-05-04 | 2026-04-18 → 2026-05-04 | 2026-05-06    |

## Rules

- Every secret group must have one owner.
- If a secret is consumed by multiple runtimes, rotation notes must describe coordination order.
- Machine credentials must map to one documented system purpose; avoid `misc` or shared buckets.
- If a secret group is retired, переноситься у §Retired secrets у тому самому PR, що видаляє consuming surface; `Status` стає `removed YYYY-MM-DD`, `Lifetime` фіксує закрите вікно.

## Related docs

- [access-policy.md](./access-policy.md)
- [access-matrix.md](./access-matrix.md)
- [rotate-secrets.md](../playbooks/rotate-secrets.md)
