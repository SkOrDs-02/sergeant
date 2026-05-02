# Відстеження свіжості документації

> **Last validated:** 2026-05-02 by @Skords-01. **Next review:** 2026-07-31.
> **Status:** Active

Ця система гарантує, що критична документація лишається актуальною — у документах вшиваються freshness-заголовки, а нічний джоб відкриває GitHub-issue для протермінованих файлів. **Список відстежуваних файлів автоматично виводиться з самого репо** — нічого додавати в JSON-allowlist не треба.

---

## Як це працює

1. **Freshness-заголовок** — у кожному відстежуваному документі біля початку (перші 15 рядків) є blockquote канонічного формату:

   ```markdown
   > **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
   ```

2. **Auto-discovery** — `scripts/docs/freshness-config.mjs` через `git ls-files '*.md'` сканує кожен `.md`, шукає канонічний заголовок та автоматично додає файл до списку відстежуваних із `defaultCadenceDays = 90`. Виключення (templates, ADR, code-adjacent README) — у `excludeGlobs` із розумних дефолтів.

3. **Конфіг** — `scripts/docs/freshness-config.json` містить лише **відхилення від дефолтів**:
   - `cadenceOverrides` — інший cadence для конкретних файлів (60 днів для runbook, 180 для аудитів);
   - `explicitInclude` — файли без заголовка, які треба тримати у списку (рідкість);
   - `explicitExclude` — файли, які навмисно вимкнено;
   - `excludeGlobs` — додаткові glob-патерни поверх дефолту.

   ```json
   {
     "cadenceOverrides": {
       "docs/observability/runbook.md": 60,
       "docs/audits/archive/ux-audit-2025.md": 365
     }
   }
   ```

4. **Нічний workflow** — `.github/workflows/docs-freshness.yml` запускає `scripts/docs/check-freshness.mjs` щодня о 07:00 UTC. Для кожного файлу, у якого минула дата **Next review**, скрипт відкриває GitHub-issue з лейблами `documentation` і `freshness-overdue`.

5. **Coverage-gate** — `node scripts/docs/check-freshness.mjs --check-coverage` фейлиться, якщо в репо знайдено `.md` без freshness-заголовка, який при цьому не виключено через `excludeGlobs` / `explicitExclude`. Запускається в pre-merge CI, щоб новий док не пройшов без header-а.

6. **Ідемпотентність** — скрипт вшиває коментар-маркер (`<!-- doc-freshness:<path> -->`) у тіло issue. Перед створенням нової issue він шукає вже відкриту з таким маркером і пропускає, якщо знайшов.

---

## Підтримувані формати заголовка

| Формат     | Приклад                                                                   | Нотатки                                                                                               |
| ---------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Канонічний | `> **Last validated:** 2026-04-27 by @user. **Next review:** 2026-07-26.` | Бажаний. Auto-discovery враховує лише цей формат.                                                     |
| Legacy     | `> Last reviewed: 2026-04-27. Reviewer: @user`                            | Стиль AGENTS.md до PR-11.A. Розпізнається парсером, але **не** включається auto-discovery — мігруйте. |

Коли знайдено legacy-заголовок (через `explicitInclude` або старий `freshness-allowlist.json`), скрипт обчислює дату наступного рев'ю як `lastValidated + cadenceDays`.

---

## Як додати документ у freshness-список

> Зазвичай нічого не треба робити з конфігом — просто додайте заголовок. Дату й handle оновить **auto-bump pre-commit hook** (`scripts/docs/bump-last-validated.mjs`).

1. Додайте freshness-заголовок до документа (одразу після title):

   ```markdown
   # Мій документ

   > **Last validated:** YYYY-MM-DD by @yourhandle. **Next review:** YYYY-MM-DD.
   > **Status:** Active
   ```

   Дата наступного рев'ю — `today + 90` (стандартний cadence).

2. Якщо документ потребує іншого cadence-у — додайте запис у `scripts/docs/freshness-config.json` → `cadenceOverrides`:

   ```json
   "cadenceOverrides": {
     "docs/my-runbook.md": 60
   }
   ```

3. Якщо файл — це не код-агностичний governance-док (наприклад, це auto-generated SDK-doc), додайте його шлях у `excludeGlobs` чи `explicitExclude`.

4. Запустіть локально, щоб переконатися, що файл потрапив у tracking:

   ```bash
   pnpm docs:freshness-dashboard
   open dist/freshness-dashboard.html
   ```

---

## Зміна cadence-у

Поправте поле в `scripts/docs/freshness-config.json` → `cadenceOverrides`. Оновіть дату **Next review** у заголовку документа, щоб вона збігалася. Рекомендовані cadence-и:

| Cadence  | Для чого                                                        |
| -------- | --------------------------------------------------------------- |
| 60 днів  | Високо-критичні ops-доки (runbook, hotfix, ротація секретів)    |
| 90 днів  | Стандартні доки (README, CONTRIBUTING, SLO, індекс playbook-ів) |
| 180 днів | Аудити, специфікації-проєкти, історичні roadmap-и               |
| 365 днів | Snapshot-аудити, які мали б бути замінені, а не оновлені        |

---

## Свідомо виключено

Дефолтний `excludeGlobs` (`scripts/docs/freshness-config.mjs` → `DEFAULT_CONFIG`) виключає:

- `docs/adr/**` — Architecture Decision Records іммутабельні (див. нижче).
- `**/_TEMPLATE*.md`, `**/TEMPLATE*.md`, `docs/playbooks/INDEX.md` — шаблони / згенеровані індекси.
- `apps/**/README.md`, `packages/**/README.md`, `ops/**/README.md` — code-adjacent доки, які живуть із кодом.
- `apps/server/src/ai-prompts/**` — промпти, які версіюються разом зі своїми консумерами.
- `.github/**`, `.agents/**`, `.claude/**` — UI-templates і агентські skill-набори, що приходять зверху.
- `CHANGELOG.md`, `THIRD_PARTY_LICENSES.md` — генеровані / суто історичні.

### Architecture Decision Records (`docs/adr/**`)

ADR-и **навмисно виключені**. ADR фіксує контекст, альтернативи та обґрунтування рішення **на момент його прийняття** — це історичний запис, а не «живий» документ. Коли базове рішення змінюється:

1. Напишіть новий ADR, який описує нове рішення з актуальним контекстом.
2. Виставте `Status: Accepted` на новому ADR і `Status: Superseded by ADR-NNNN` на старому.
3. Додайте рядок `Supersedes: ADR-MMMM` у заголовок нового ADR.

Це стандартний патерн із [оригінальної пропозиції Майкла Найгарда](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) та спільноти [adr.github.io](https://adr.github.io/).

Якщо ADR коли-небудь потребує операційних метаданих, які треба перевалідовувати за cadence-ом (наприклад, таблиця квот, прайс-лист), винесіть ці дані в окремий док під `docs/integrations/`, `docs/launch/` або `docs/observability/` і додайте **його** заголовок — а сам ADR не чіпайте.

---

## Локальний запуск

```bash
# Dry-run (issue не створюються) — показує overdue-статус кожного відстежуваного файлу
DRY_RUN=1 node scripts/docs/check-freshness.mjs

# Coverage-gate — фейлиться, якщо є .md без freshness-заголовка
node scripts/docs/check-freshness.mjs --check-coverage

# Реальний запуск (потрібен GITHUB_TOKEN з issues:write)
GITHUB_TOKEN=ghp_... node scripts/docs/check-freshness.mjs

# HTML-дашборд із усіма відстежуваними файлами
pnpm docs:freshness-dashboard
open dist/freshness-dashboard.html
```

---

## Legacy: `freshness-allowlist.json`

`scripts/docs/freshness-allowlist.json` тепер порожній (`[]`) і існує лише як backward-compat fallback. Усі 83 попередні записи мігровані: 14 із них живуть у `cadenceOverrides` (інші cadence-и), решта 69 авто-виявляються через сам канонічний заголовок. Файл буде видалено в наступному cleanup-PR після того, як ми переконаємося, що жоден зовнішній скрипт від нього не залежить.

---

## Тести

```bash
node --test scripts/docs/__tests__/check-freshness.test.mjs
node --test scripts/docs/__tests__/freshness-config.test.mjs
```
