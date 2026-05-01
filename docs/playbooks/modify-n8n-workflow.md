# Playbook: Modify or Add an n8n Workflow

> **Last validated:** 2026-05-01 by @devin-ai-integration[bot]. **Next review:** 2026-07-30.
> **Status:** Active

**Trigger:** «Додай новий n8n воркфлоу» / «Зміни логіку воркфлоу X» / зміна в `ops/n8n-workflows/` / оновлення manifest.json.

---

## Передумови

- Git — джерело істини для n8n-воркфлоу ([ADR-0026](../adr/0026-n8n-workflow-source-of-truth.md)).
- JSON воркфлоу живе в `ops/n8n-workflows/`.
- `manifest.json` фіксує owner, status, riskTier, requiredEnv, requiredCredentials.
- CI валідує через `pnpm ops:n8n:validate`.

## Кроки

### 1. Визначити, що саме змінюється

- **Новий воркфлоу** → перейди до §2
- **Зміна існуючого** → перейди до §3
- **Тільки manifest metadata** → перейди до §4

### 2. Створення нового воркфлоу

1. Обери наступний вільний номер у `ops/n8n-workflows/` (формат `NN-<slug>.json`). Діапазони:
   - `01–14` — бізнес-логіка (billing, finyk, product)
   - `15–17` — devops / CI інтеграції
   - `18–19` — security / health
   - `50–59` — SEO snapshots (GSC / ranks / pagespeed / backlinks)
   - `60–69` — growth & revenue snapshots (funnel / cohorts / revenue / acquisition / feature adoption)
   - `70–79` — marketing / mentions / social / app-store reviews
   - `80–89` — email кампанії / events
   - `98–99` — інфраструктурні (error-handler, heartbeat)
2. Створи JSON файл. Якщо маєш доступ до n8n UI — побудуй там і експортуй:
   ```bash
   pnpm n8n:export
   ```
3. Додай запис у `manifest.json`:

   ```json
   "NN-my-workflow.json": {
     "owner": "<team>",
     "status": "experimental",
     "riskTier": "P2",
     "requiredEnv": ["TELEGRAM_ALERT_CHAT_ID"],
     "requiredCredentials": ["Sergeant Ops Bot"],
     "notes": "Короткий опис що робить воркфлоу."
   }
   ```

   - `owner`: `ops` | `finyk` | `product` | `devex` | `growth` | `security`
   - `status`: `experimental` (дефолт для нових) | `prod-ready`
   - `riskTier`: `P0` (revenue/data) | `P1` (alert/security) | `P2` (growth/info)

4. Валідуй:
   ```bash
   pnpm ops:n8n:validate
   ```

### 3. Зміна існуючого воркфлоу

1. Якщо зміна зроблена в n8n UI — експортуй:
   ```bash
   pnpm n8n:export
   ```
2. Якщо зміна в JSON напряму — переконайся, що структура валідна.
3. Оновити `manifest.json` якщо змінились:
   - `requiredEnv` / `requiredCredentials` (додано чи прибрано)
   - `status` (experimental → prod-ready або навпаки)
   - `notes`
4. Валідуй:
   ```bash
   pnpm ops:n8n:validate
   ```
5. Перед імпортом у живий n8n — dry-run:
   ```bash
   pnpm n8n:import -- --dry-run
   ```

### 4. Зміна тільки manifest metadata

1. Відредагуй `ops/n8n-workflows/manifest.json`.
2. Валідуй: `pnpm ops:n8n:validate`.

### 5. Перевірки перед PR

```bash
pnpm ops:n8n:validate              # manifest + JSON consistency
pnpm lint:governance-sync          # dangling refs check
pnpm format:check                  # Prettier
```

### 6. Commit

Scope: `agents` (для n8n workflow змін).

```bash
git add ops/n8n-workflows/
git commit -m "feat(agents): add workflow NN — <short description>"
```

## Безпека

- Не комітити секрети, API ключі чи токени в JSON воркфлоу.
- Credentials мають бути reference-only (ім'я credential-а в n8n, не значення).
- P0 воркфлоу (billing, payment recovery, error handler) — змінювати лише з рев'ю від `@Skords-01`.
