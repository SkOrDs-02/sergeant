# Secret Ownership Register

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-30.
> **Status:** Active

Operational metadata registry for secrets and privileged system credentials in Sergeant. This register documents ownership and blast radius, never secret values.

## Register

| System / secret group                                | Owner   | Storage location                             | Consumer systems                                              | Rotation cadence                          | Rollback / compatibility note                                               | Compromise impact                                           | Last reviewed |
| ---------------------------------------------------- | ------- | -------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------- |
| Better Auth secret and session-critical auth secrets | Founder | Railway prod env, local `.env`, CI if needed | `apps/server`, auth/session flows                             | On compromise or auth-architecture change | Rotation invalidates sessions; do during low-traffic window                 | Global login/session disruption                             | 2026-05-01    |
| Postgres production credentials                      | Founder | Railway managed secret references            | `apps/server`, migration tooling, health checks               | On compromise or provider rotation event  | Coordinate with runtime and migration access                                | Full data-plane compromise risk                             | 2026-05-01    |
| Anthropic / OpenAI provider keys                     | Founder | Railway prod env                             | AI endpoints, console-agent workloads, HubChat orchestration  | Monthly review, immediate on suspicion    | No backward compatibility; update all runtimes together                     | Cost abuse, feature outage, prompt-serving disruption       | 2026-05-01    |
| Sentry auth / DSN / admin secrets                    | Founder | Railway env, vendor console                  | `apps/server`, `apps/web`, alerting workflows                 | Quarterly or on compromise                | DSN swaps are usually low-risk; admin-token rotation may break integrations | Lost error visibility or unauthorized issue access          | 2026-05-01    |
| PostHog project / admin secrets                      | Founder | Railway env, vendor console                  | product analytics, release annotations, behavioral dashboards | Quarterly or on compromise                | Reconfigure integrations after rotation                                     | Behavioral data exposure, analytics tampering               | 2026-05-01    |
| Telegram bot token / console-agent credentials       | Founder | Railway env                                  | `apps/console`, bot runtime                                   | On compromise or role change              | Rotation can interrupt bot flows until redeploy                             | Internal bot impersonation or action abuse                  | 2026-05-01    |
| Push / mobile distribution credentials               | Founder | App store consoles, local release tooling    | `apps/mobile`, `apps/mobile-shell`, release workflows         | On compromise or certificate expiry cycle | Store propagation may delay full recovery                                   | Broken mobile release pipeline or malicious app update risk | 2026-05-01    |
| n8n integration credentials                          | Founder | n8n runtime, vendor consoles                 | workflow automations, webhook relays                          | Quarterly review, immediate on compromise | Validate workflow health after rotation                                     | Automation misuse or external service abuse                 | 2026-05-01    |

## Rules

- Every secret group must have one owner.
- If a secret is consumed by multiple runtimes, rotation notes must describe coordination order.
- Machine credentials must map to one documented system purpose; avoid `misc` or shared buckets.
- If a secret group is retired, remove it here in the same PR that removes the consuming surface.

## Related docs

- [access-policy.md](./access-policy.md)
- [access-matrix.md](./access-matrix.md)
- [rotate-secrets.md](../playbooks/rotate-secrets.md)
