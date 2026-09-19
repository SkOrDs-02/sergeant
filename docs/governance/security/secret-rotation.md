> **Last touched:** 2026-09-19 by @claude. **Next review:** 2027-09-21.
> **Status:** Reference — звіт аудиту секретів 2026-06-03 і vendor-by-vendor кроки на ту дату. Канонічна процедура ротації — [`rotate-secrets.md`](../../start/instructions/rotate-secrets.md); власники, каденс і blast radius — [`secret-ownership-register.md`](./secret-ownership-register.md). Vendor-кроки нижче лишаються корисною шпаргалкою, але рішення «що і коли ротувати» береться з тих двох документів.

# Ротація Production Secrets

> **Пріоритет на дату аудиту:** 🔴 P0 (критична безпека)  
> **Аудит:** 2026-06-03 виявив 10+ credentials у локальному `.env`

## Чому це критично

Локальний `.env` файл містить production credentials. Хоча `.gitignore` виключає його з комітів, ризик залишається через:

- **IDE cloud sync** (VSCode Settings Sync, JetBrains Account sync)
- **Backup системи** (Time Machine, OneDrive, Google Drive)
- **AI-асистенти** (Claude, Copilot, Codex можуть читати `.env` для контексту)
- **Випадковий commit** (human error, `git add .`)

## Покрокова інструкція ротації

### 1. GitHub Personal Access Token (PAT)

**Формат токена:** `ghp_…` (сам токен і його усічені фрагменти в публічному репо не зберігаємо)

#### Revoke (відкликати старий)

1. Перейди на https://github.com/settings/tokens
2. Знайди токен з назвою, що відповідає використанню (наприклад, "Sergeant CI", "Local dev")
3. Натисни **Delete** поруч з токеном
4. Підтверди видалення

#### Створити новий

1. На тій самій сторінці натисни **Generate new token (classic)** або **Fine-grained token**
2. Для classic:
   - **Note:** `Sergeant Local Dev 2026-06`
   - **Expiration:** 90 days (або No expiration для service accounts)
   - **Scopes:** `repo`, `workflow`, `read:packages` (мінімальні необхідні)
3. Натисни **Generate token**
4. **Скопіюй токен негайно** — він показується тільки один раз

#### Оновити

- **Локально:** заміни значення `GITHUB_TOKEN` у `.env`
- **GitHub Actions:** Settings → Secrets and variables → Actions → `GITHUB_TOKEN` (якщо це repo-level secret)
- **Coolify:** якщо токен використовує backend → app `sergeant-api` → Environment Variables → онови й redeploy

---

### 2. Vercel Token

**Формат токена:** `vcp_…`

#### Revoke

1. Перейди на https://vercel.com/account/tokens
2. Знайди токен у списку
3. Натисни **Delete** (іконка смітника)
4. Підтверди

#### Створити новий

1. На тій самій сторінці натисни **Create Token**
2. **Name:** `Sergeant Local 2026-06`
3. **Scope:** вибери відповідний team або personal account
4. **Expiration:** 90 days (рекомендовано)
5. Натисни **Create**
6. Скопіюй токен

#### Оновити

- **Локально:** заміни `VERCEL_TOKEN` у `.env`
- **GitHub Actions:** якщо Vercel deploy використовує цей токен → repo Settings → Secrets → Actions → `VERCEL_TOKEN`

---

### 3. Railway Token _(retired)_

Railway виведено з експлуатації ([ADR-0074](../adr/0074-hosting-hetzner-coolify.md)); акаунт і CLI-токен ротації не потребують — якщо `RAILWAY_TOKEN` ще лежить у локальному `.env` чи в repo Secrets → Actions, просто видали його (останній CI-споживач, `db-backup-verify.yml`, мігрував на прямий `pg_dump` з Coolify через `MIGRATE_DATABASE_URL`). Історичні кроки — у git history цього файлу.

---

### 4. n8n API Key _(retired)_

n8n виведено з експлуатації ([ADR-0090](../adr/0090-n8n-decommissioned.md)); інстансу немає, ключ ротації не потребує — якщо `N8N_API_KEY` ще лежить у локальному `.env`, просто видали його. Історичні кроки — у git history цього файлу.

---

### 5. Voyage AI API Key

**Формат ключа:** `pa-…`

#### Revoke

1. Перейди на https://dash.voyageai.com/api-keys
2. Знайди ключ у списку
3. Натисни **Delete** або **Revoke**

#### Створити новий

1. Натисни **Create API Key**
2. **Name:** `Sergeant Local 2026-06`
3. Натисни **Create**
4. Скопіюй ключ

#### Оновити

- **Локально:** заміни `VOYAGE_API_KEY` у `.env`
- **Coolify:** app `sergeant-api` → Environment Variables → онови `VOYAGE_API_KEY` і redeploy

---

### 6. Sentry DSN

**Формат DSN-токена:** `sntryu_…`

#### Revoke

1. Перейди на https://sentry.io/settings/projects/
2. Вибери проект Sergeant
3. Перейди на **Client Keys (DSN)**
4. Знайди ключ у списку
5. Натисни **Disable** або **Delete**

#### Створити новий

1. На тій самій сторінці натисни **Create Client Key**
2. **Name:** `Sergeant Local 2026-06`
3. Натисни **Create**
4. Скопіюй DSN

#### Оновити

- **Локально:** заміни `SENTRY_DSN` у `.env`
- **Coolify:** app `sergeant-api` → Environment Variables → онови `SENTRY_DSN` і redeploy
- **Frontend:** якщо `SENTRY_DSN` використовується у `apps/web` → онови environment variable у Vercel dashboard

---

### 7. PostHog API Key + Project Token

**Формати ключів:** `phx_…` (API key), `phc_…` (project token)

#### Revoke

1. Перейди на https://app.posthog.com/project/settings
2. Вибери проект Sergeant
3. Для **API Key:**
   - Перейди на **API Keys**
   - Знайди ключ у списку
   - Натисни **Delete**
4. Для **Project Token:**
   - Перейди на **Project API Key**
   - Натисни **Reset** (це згенерує новий токен і інвалідує старий)

#### Створити новий

1. **API Key:** натисни **Create API Key**, введи назву, натисни **Create**
2. **Project Token:** після Reset скопіюй новий токен

#### Оновити

- **Локально:** заміни `POSTHOG_API_KEY` та `POSTHOG_PROJECT_TOKEN` у `.env`
- **Coolify:** app `sergeant-api` → Environment Variables → онови backend-значення і redeploy
- **Frontend:** Vercel dashboard → Environment Variables → онови `POSTHOG_PROJECT_TOKEN`

---

### 8. Grafana API Key + Loki Key

**Формати ключів:** `glsa_…` (Grafana API key), `glc_…` (Loki key)

#### Revoke

1. Перейди на Grafana instance (наприклад, https://grafana.sergeant.app або Grafana Cloud)
2. Увійди як admin
3. Для **Grafana API Key:**
   - Перейди на **Configuration** → **API Keys**
   - Знайди ключ у списку
   - Натисни **Delete**
4. Для **Loki Key:**
   - Перейди на **Configuration** → **Data Sources** → **Loki**
   - Знайди credentials у налаштуваннях
   - Натисни **Reset** або згенеруй нові credentials у Loki dashboard

#### Створити новий

1. **Grafana API Key:** натисни **Add API key**, введи назву, вибери роль (Admin/Editor/Viewer), натисни **Create**
2. **Loki Key:** згенеруй нові credentials у Loki dashboard або Grafana Cloud portal

#### Оновити

- **Локально:** заміни `GRAFANA_API_KEY` та `LOKI_KEY` у `.env`
- **Coolify:** якщо Alloy/backend використовує ці ключі → онови їх у відповідному Coolify resource/app і redeploy

---

## Після ротації

### 1. Перевір, що все працює

```bash
# Запусти локально
pnpm dev:db
pnpm dev:server
pnpm dev:web

# Перевір, що немає 401/403 помилок у логах
```

### 2. Видали старий `.env` (опціонально)

Якщо ти підозрюєш, що `.env` був скомпрометований:

```bash
# Створи backup (зашифрований)
gpg -c .env
# Видали оригінал
rm .env
# Створи новий з ротованими секретами
cp .env.example .env
# Заповни новими значеннями
```

### 3. Онови документацію

- Якщо ти змінив назви секретів або додав нові → онови `.env.example`
- Якщо ти змінив scopes або permissions → онови цей документ

### 4. Закоміть зміни (якщо є)

```bash
git add .env.example docs/governance/security/secret-rotation.md
git commit -m "docs(security): update secret rotation guide after 2026-06 audit"
```

## Автоматизація ротації (майбутнє)

Розглянути:

- **GitHub Actions secret scanning** — автоматичне виявлення leaked tokens
- **HashiCorp Vault** або **AWS Secrets Manager** — централізоване управління секретами
- **Scoped Coolify deploy/webhook credentials** замість персональних owner credentials — для CI/CD
- **Short-lived tokens** (1 година) замість long-lived — де можливо

## Додаткові ресурси

- [GitHub Security Best Practices](https://docs.github.com/en/code-security/getting-started/github-security-features)
- [Vercel Security](https://vercel.com/docs/security)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
