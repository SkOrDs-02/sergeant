# Deploy

> **Last validated:** 2026-06-09 by @claude. **Next review:** 2026-09-07.
> **Status:** Active

Step-by-step deploy walkthroughs for Sergeant runtime surfaces. These are operational recipes — for the architectural rationale of the hosting split see [`../adr/0009-hosting-split-railway-vercel.md`](../../04-governance/adr/0009-hosting-split-railway-vercel.md), and for the runtime inventory see [`../architecture/service-catalog.md`](../../02-engineering/architecture/service-catalog.md).

## Documents

| Document                                                         | Purpose                                                                       |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`openclaw.md`](./openclaw.md)                                   | Deploy `tools/openclaw` (Telegram bot) on Railway via `Dockerfile.openclaw`   |
| [`vercel.md`](./vercel.md)                                       | Vercel project settings, headers contract, COEP compatibility matrix          |
| [`monorepo-deploy-filtering.md`](./monorepo-deploy-filtering.md) | Per-surface deploy filters (Vercel `ignoreCommand` + Railway `watchPatterns`) |

## Related

- [`../integrations/railway-vercel.md`](../../02-engineering/integrations/railway-vercel.md) — Railway/Vercel platform setup
- [`../playbooks/hotfix-prod-regression.md`](../../00-start/playbooks/hotfix-prod-regression.md) — emergency rollback recipe
- [`../observability/runbook.md`](../observability/runbook.md) — production incident runbook
