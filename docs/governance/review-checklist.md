# Review Checklist

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Active

Checklist для reviewer'ів і pre-merge self-review.

## Trigger

Використовуй цей checklist для PR review, merge readiness і будь-якої зміни в governance, migrations, HubChat, deploy або multi-surface feature work.

## Перевір обов'язково

1. Чи відповідає зміна одному primary skill і одному primary playbook.
2. Чи оновлені docs разом із кодом, якщо змінилась поведінка, contract або workflow.
3. Чи є drift між `AGENTS.md`, `hard-rules.json`, playbooks, PR template і CODEOWNERS.
4. Чи є правильні verification commands і чи відповідають вони touched surface.
5. Чи безпечні migrations, rollout steps, env changes і deploy order.

## Surface-specific questions

- API/server: оновлено `packages/api-client`, tests, serializers і contract checks?
- Migrations: sequential numbering, two-phase DROP, local migrate path, review notes для rollout?
- HubChat: tool defs, executor path, action cards, risky labelling і prompt budget узгоджені?
- Mobile: немає DOM leakage, web-only imports або дублювання shared domain logic?
- Console/n8n/ops: немає write-side effects у read-only agents, metadata і manifests синхронізовані?
- Docs/governance: оновлено індекси, schema gates, freshness headers?
