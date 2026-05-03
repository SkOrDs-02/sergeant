# Deploy

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.
> **Status:** Active

Step-by-step deploy walkthroughs for Sergeant runtime surfaces. These are operational recipes — for the architectural rationale of the hosting split see [`../adr/0009-hosting-split-railway-vercel.md`](../adr/0009-hosting-split-railway-vercel.md), and for the runtime inventory see [`../architecture/service-catalog.md`](../architecture/service-catalog.md).

## Documents

| Document                     | Purpose                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| [`console.md`](./console.md) | Deploy `apps/console` (Telegram bot) on Railway via `Dockerfile.console` |

## Related

- [`../integrations/railway-vercel.md`](../integrations/railway-vercel.md) — Railway/Vercel platform setup
- [`../playbooks/hotfix-prod-regression.md`](../playbooks/hotfix-prod-regression.md) — emergency rollback recipe
- [`../observability/runbook.md`](../observability/runbook.md) — production incident runbook
