# Deploy

> **Last touched:** 2026-07-21 by @cursoragent. **Next review:** 2026-10-18.
> **Status:** Active

Step-by-step deploy walkthroughs for Sergeant runtime surfaces. **Current backend:** Hetzner CX23 + Coolify ([ADR-0074](../../04-governance/adr/0074-hosting-hetzner-coolify.md)). **OpenClaw:** decommissioned ([ADR-0075](../../04-governance/adr/0075-openclaw-gateway-decommissioned.md)).

## Documents

| Document                                                         | Purpose                                                                       |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`openclaw.md`](./openclaw.md)                                   | **Archived** — historical OpenClaw deploy (removed ADR-0075)                  |
| [`vercel.md`](./vercel.md)                                       | Vercel project settings, headers contract, COEP compatibility matrix          |
| [`monorepo-deploy-filtering.md`](./monorepo-deploy-filtering.md) | Per-surface deploy filters (Vercel `ignoreCommand`; historical Railway notes)   |

## Related

- [`../integrations/railway-vercel.md`](../../02-engineering/integrations/railway-vercel.md) — legacy Railway setup + Vercel/cookie contract
- [`../playbooks/hotfix-prod-regression.md`](../../00-start/playbooks/hotfix-prod-regression.md) — emergency rollback recipe
- [`../observability/runbook.md`](../observability/runbook.md) — production incident runbook
