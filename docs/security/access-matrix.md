# Access Matrix

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

Canonical inventory of privileged surfaces and access expectations for Sergeant.

## Privileged surfaces

| Surface                                    | Tier     | Owner   | Typical holder types                         | Why it is privileged                                         | Grant / revoke path                                 | Review cadence |
| ------------------------------------------ | -------- | ------- | -------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------- | -------------- |
| GitHub repo owner/admin                    | `Tier 0` | Founder | Founder                                      | Can control code, branches, secrets, workflows, and recovery | GitHub org/repo settings; document via playbook     | Monthly        |
| Domain / DNS registrar                     | `Tier 0` | Founder | Founder                                      | Can redirect product traffic and auth domains                | Vendor dashboard; revoke immediately on role change | Quarterly      |
| Stripe or Paddle billing admin             | `Tier 0` | Founder | Founder                                      | Can change money flow, refunds, payout settings, tax profile | Vendor dashboard; rotate if compromise suspected    | Monthly        |
| Apple / Google store owner access          | `Tier 0` | Founder | Founder                                      | Can publish or remove mobile builds and billing metadata     | Vendor dashboard; keep narrow fallback access       | Quarterly      |
| Railway production admin                   | `Tier 1` | Founder | Founder, core engineer                       | Can deploy API, mutate env, reach prod DB indirectly         | Railway project membership                          | Biweekly       |
| Vercel production admin                    | `Tier 1` | Founder | Founder, core engineer                       | Can deploy web and mutate project env                        | Vercel project membership                           | Biweekly       |
| PostgreSQL production admin                | `Tier 1` | Founder | Founder, core engineer                       | Can mutate or destroy system-of-record data                  | Via Railway DB access / restricted credentials      | Biweekly       |
| Sentry admin                               | `Tier 1` | Founder | Founder, core engineer                       | Can alter alerts, integrations, retention, issue workflow    | Vendor membership                                   | Monthly        |
| PostHog admin                              | `Tier 1` | Founder | Founder, core engineer, temporary contractor | Can view behavioral data and change analytics config         | Vendor membership                                   | Monthly        |
| n8n admin / workflow editor                | `Tier 1` | Founder | Founder, core engineer                       | Can change production automations and integrations           | n8n workspace access                                | Biweekly       |
| Anthropic/OpenAI provider key management   | `Tier 1` | Founder | Founder                                      | Controls AI cost, availability, and prompt-serving paths     | Provider console + secret rotation playbook         | Monthly        |
| Telegram bot token / console-agent control | `Tier 1` | Founder | Founder, core engineer                       | Can impersonate internal bot actions                         | Bot secret owners only                              | Monthly        |
| Grafana / metrics read access              | `Tier 2` | Founder | Founder, core engineer, temporary contractor | Operational visibility only                                  | Vendor access or read token                         | Monthly        |
| Sentry read-only access                    | `Tier 2` | Founder | Founder, core engineer, temporary contractor | Visibility into incidents without config mutation            | Vendor role                                         | Monthly        |
| PostHog read-only dashboards               | `Tier 2` | Founder | Founder, core engineer, temporary contractor | Behavioral visibility without admin changes                  | Vendor role                                         | Monthly        |

## Review rules

- Every row above must remain unique; do not split the same privileged surface across multiple docs.
- If a new privileged vendor or console appears, add it here in the same PR that introduces it.
- Tier 0 and Tier 1 surfaces must always have one named owner, even if multiple people hold access.

## Related docs

- [access-policy.md](./access-policy.md)
- [secret-ownership-register.md](./secret-ownership-register.md)
- [security-incident-policy.md](../governance/security-incident-policy.md)
