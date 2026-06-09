<!-- Lifecycle: Active -->
<!-- Owner: @Skords-01 -->
<!-- Last validated: 2026-06-03 -->
<!-- Next review: 2026-09-03 -->

> **Last validated:** 2026-06-09 by @claude. **Next review:** 2026-09-07.
> **Status:** Active

# Ротація Production Secrets

> **Статус:** Active  
> **Пріоритет:** 🔴 P0 (критична безпека)  
> **Аудит:** 2026-06-03 виявив 10+ credentials у локальному `.env`

## Чому це критично

Локальний `.env` файл містить production credentials. Хоча `.gitignore` виключає його з комітів, ризик залишається через:

- **IDE cloud sync** (VSCode Settings Sync, JetBrains Account sync)
- **Backup системи** (Time Machine, OneDrive, Google Drive)
- **AI-асистенти** (Claude, Copilot, Codex можуть читати `.env` для контексту)
- **Випадковий commit** (human error, `git add .`)

## Покрокова інструкція ротації

### 1. GitHub Personal Access Token (PAT)

**Поточний токен:** `ghp_yYDCBT5...` (truncated для безпеки)

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
- **Railway:** якщо токен використовується у Railway service → Railway dashboard → Variables → онови

---

### 2. Vercel Token

**Поточний токен:** `vcp_7H3VgFh...`

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

### 3. Railway Token

**Поточний токен:** `f9ed9d0a-...`

#### Revoke

1. Перейди на https://railway.app/account/tokens
2. Знайди токен у списку
3. Натисни **Delete**
4. Підтверди

#### Створити новий

1. Натисни **Create Token**
2. **Name:** `Sergeant Local 2026-06`
3. Натисни **Create**
4. Скопіюй токен

#### Оновити

- **Локально:** заміни `RAILWAY_TOKEN` у `.env`
- **GitHub Actions:** якщо Railway CLI використовується у CI → repo Settings → Secrets → Actions → `RAILWAY_TOKEN`

---

### 4. n8n API Key

**Поточний ключ:** `eyJhbGci...` (JWT формат)

#### Revoke

1. Перейди на n8n instance (наприклад, https://n8n.sergeant.app або self-hosted URL)
2. Увійди як admin
3. Перейди на **Settings** → **API**
4. Знайди API key у списку
5. Натисни **Delete** або **Revoke**

#### Створити новий

1. На тій самій сторінці натисни **Create an API Key**
2. **Label:** `Sergeant Local 2026-06`
3. Натисни **Create**
4. Скопіюй ключ (показується один раз)

#### Оновити

- **Локально:** заміни `N8N_API_KEY` у `.env`
- **n8n workflows:** якщо workflows використовують цей ключ для HTTP Request nodes → онови credentials у n8n UI

---

### 5. Voyage AI API Key

**Поточний ключ:** `pa-MmKpcms...`

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
- **Railway:** якщо backend використовує Voyage AI → Railway dashboard → Service → Variables → онови `VOYAGE_API_KEY`

---

### 6. Sentry DSN

**Поточний DSN:** `sntryu_d3a9...`

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
- **Railway:** Railway dashboard → Service → Variables → онови `SENTRY_DSN`
- **Frontend:** якщо `SENTRY_DSN` використовується у `apps/web` → онови environment variable у Vercel dashboard

---

### 7. PostHog API Key + Project Token

**Поточні ключі:** `phx_LaujFK...` (API key), `phc_A8dsjh...` (project token)

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
- **Railway:** Railway dashboard → Service → Variables → онови обидва значення
- **Frontend:** Vercel dashboard → Environment Variables → онови `POSTHOG_PROJECT_TOKEN`

---

### 8. Grafana API Key + Loki Key

**Поточні ключі:** `glsa_gIDey...` (Grafana API key), `glc_eyJv...` (Loki key)

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
- **Railway:** якщо backend відправляє логи у Loki → Railway dashboard → Service → Variables → онови обидва значення

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
git add .env.example docs/04-governance/security/secret-rotation.md
git commit -m "docs(security): update secret rotation guide after 2026-06 audit"
```

## Автоматизація ротації (майбутнє)

Розглянути:

- **GitHub Actions secret scanning** — автоматичне виявлення leaked tokens
- **HashiCorp Vault** або **AWS Secrets Manager** — централізоване управління секретами
- **Railway service tokens** замість user tokens — для CI/CD
- **Short-lived tokens** (1 година) замість long-lived — де можливо

## Додаткові ресурси

- [GitHub Security Best Practices](https://docs.github.com/en/code-security/getting-started/github-security-features)
- [Vercel Security](https://vercel.com/docs/security)
- [Railway Security](https://docs.railway.app/reference/security)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

---

**Наступна перевірка:** 2026-09-03 (через 3 місяці)
