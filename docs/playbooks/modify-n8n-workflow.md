# Playbook: Зміна або додавання n8n-воркфлоу

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

**Trigger:** "Додай новий n8n workflow" / "Зміни логіку workflow X" / зміна в `ops/n8n-workflows/` або `manifest.json`.

## Owner surface

- Primary surface: `ops/n8n-workflows`
- Governing skill: `sergeant-deploy-and-observability`

## Required context

- Почни з `sergeant-start-here`, потім відкрий `sergeant-deploy-and-observability`.
- Якщо воркфлоу викликає AI / tooling behavior або зачіпає поверхню console-агента — звір пов'язаний специалізований skill (`sergeant-hubchat`).
- Памʼятай: Git є source of truth для n8n-воркфлоу-артефактів. Якщо хтось редагував воркфлоу через UI — синхронізуй назад у репо до того, як накладати свої зміни.

## Кроки

### 1. Визнач клас воркфлоу

- business / product automation — наприклад нагадування користувачам або side-effect із оплати
- devops / CI — інфраструктурні чи реліз-помічники
- security / health — алерти, аудит, ротації
- growth / marketing — кампанії, lifecycle-листи
- infra plumbing — внутрішня сантехніка між сервісами

### 2. Онови артефакт воркфлоу і метадані разом

- JSON-воркфлоу (експортований із n8n)
- `manifest.json` — `owner`, `status`, `risk tier`, `required env`, `required credentials`
- [`ops/n8n-workflows/REPORTING-MATRIX.md`](../../ops/n8n-workflows/REPORTING-MATRIX.md) — рядок воркфлоу: `topic → cadence → owner → escalation`. **Жорстке правило:** матриця і `manifest.json.riskTier` повинні мати однаковий тир; mismatch блокує merge (Hard Rule #15).

> Для нового воркфлоу: `pnpm gen new-n8n-workflow` (Initiative 0009 PR 5.1b extras) — генерує `ops/n8n-workflows/<NN>-<slug>.json` стаб (schedule trigger + Code-нод TODO) і відразу вставляє відповідний запис у `manifest.json` так, що `pnpm exec node scripts/n8n/validate-n8n-workflows.mjs` проходить без додаткових ручних правок. Далі — заміна логіки Code-нода, оновлення `requiredEnv` / `requiredCredentials` під реальні залежності.

### 3. Перевір безпечний шлях імпорту

- Спробуй dry-run або export/import у тестове середовище — переконайся, що JSON туди-сюди не ламається.
- Жодних зашитих у JSON секретів — лише посилання на credentials по імені.
- Credential-посилання залишаються reference-only (n8n credential id, а не сам токен).

### 4. Зафіксуй operational impact у PR-описі

- Що саме запускає воркфлоу (cron, webhook, manual trigger).
- Які env / credentials потрібні і де вони мають бути виставлені (Railway, n8n cloud, локальний `.env`).
- Який blast radius при помилці — кого зачепить, які системи можуть зламатися.
- Чи потребує окремого ревʼю від owner-а суміжного домену (наприклад фінанси, безпека).

## Verification

- [ ] `pnpm ops:n8n:validate`
- [ ] `pnpm lint:governance-sync --strict`
- [ ] `pnpm format:check`
- [ ] `manifest.json` синхронізований із workflow-артефактом
- [ ] Секрети не закомічені (звір `secret-scan` лог)

## Коли цей playbook НЕ використовувати

- Треба змінити лише application code без n8n-артефактів — використовуй `feature-delivery` чи `add-feature-flag.md`.
- Працюєш із console-агентом або HubChat orchestration, а не з n8n — використовуй `modify-console-agent.md` чи `add-hubchat-tool.md`.

## Споріднені playbook-и та skills

- [modify-console-agent.md](./modify-console-agent.md)
- [investigate-alert.md](./investigate-alert.md)
- Skill: `sergeant-deploy-and-observability`
