# Playbook: Modify or Add an n8n Workflow

> **Last validated:** 2026-05-02 by @Skords-01. **Next review:** 2026-07-31.
> **Status:** Active

**Trigger:** "Додай новий n8n workflow" / "Зміни логіку workflow X" / зміна в `ops/n8n-workflows/` або `manifest.json`.

## Owner surface

- Primary surface: `ops/n8n-workflows`
- Governing skill: `sergeant-deploy-and-observability`

## Required context

- Почни з `sergeant-start-here`, потім відкрий `sergeant-deploy-and-observability`.
- Якщо workflow викликає AI/tooling behavior або console agent surface, звір пов'язаний specialist skill.
- Пам'ятай: Git є source of truth для n8n workflow artifacts.

## Steps

### 1. Визнач клас workflow

- business/product automation
- devops/CI
- security/health
- growth/marketing
- infra plumbing

### 2. Онови workflow artifact і metadata разом

- JSON workflow
- `manifest.json` — owner, status, risk tier, required env, required credentials
- [`ops/n8n-workflows/REPORTING-MATRIX.md`](../../ops/n8n-workflows/REPORTING-MATRIX.md) — рядок workflow → topic → cadence → owner → escalation. **Hard rule:** matrix і `manifest.json.riskTier` повинні мати ідентичний tier; mismatch блокує merge (Hard Rule #15).

### 3. Перевір safe import path

- Dry-run або export/import consistency
- Немає зашитих secrets
- Credential references лишаються reference-only

### 4. Зафіксуй operational impact

- Що запускає workflow
- Які env/credentials потрібні
- Який blast radius при помилці
- Чи потребує окремого review від owner

## Verification

- [ ] `pnpm ops:n8n:validate`
- [ ] `pnpm lint:governance-sync --strict`
- [ ] `pnpm format:check`
- [ ] `manifest.json` синхронізований із workflow artifact
- [ ] Secrets не закомічені

## When not to use this playbook

- Потрібно змінити лише application code без workflow artifacts.
- Працюєш із console agent або HubChat orchestration, а не з n8n.

## Related playbooks and skills

- [modify-console-agent.md](./modify-console-agent.md)
- [investigate-alert.md](./investigate-alert.md)
- Skill: `sergeant-deploy-and-observability`
