# Audit-винятки

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** Active

> Відстежені вразливості, які тимчасово допускаються через PR-лейбл `audit-exception`,
> а також bypass-и GitHub secret-scanning push-protection-у.

## Як цей файл працює

Якщо `pnpm audit --audit-level=high` репортить про вразливість, яку не можна виправити одразу (наприклад, нема патчу, проблема upstream), задокументуй її тут, щоб команда мала видимість. Додай до PR лейбл `audit-exception`, щоб обійти блокуючий audit-step у CI.

Кожен запис має містити:

| Поле           | Опис                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| **Advisory**   | Посилання на npm/GitHub-advisory                                         |
| **Package**    | Назва враженого пакета й встановлена версія                              |
| **Severity**   | `high` або `critical`                                                    |
| **Reason**     | Чому зараз не можна виправити                                            |
| **Mitigation** | Що знижує ризик (наприклад, не використовується в prod, input-валідація) |
| **Due date**   | Коли виняток має бути переоцінений або закритий                          |
| **Owner**      | Хто відповідальний за трек фіксу                                         |

## Поточні винятки

> `pnpm audit --audit-level=high` (prod + full tree) — проходить чисто.
> Запис нижче — `moderate` зі щоночного full-репорту (`pnpm audit` без
> `--audit-level=high` + OSV-Scanner SARIF), записаний для трекінгу, не як
> blocker для CI.

### ajv ReDoS via expo-dev-launcher (CVE-2025-69873)

| Field      | Value                                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Advisory   | https://github.com/advisories/GHSA-2g4f-4pwh-qvx6 (CVE-2025-69873)                                                                                                                                                                   |
| Package    | `ajv@8.11.0` (vulnerable range `>=7.0.0-alpha.0 <8.18.0`; patched in `8.18.0`)                                                                                                                                                       |
| Severity   | moderate (CVSS 5.3) — ReDoS лише через опцію `$data`                                                                                                                                                                                 |
| Path       | `apps/mobile > expo-dev-client@5.0.20 > expo-dev-launcher@5.0.35 > ajv@8.11.0`                                                                                                                                                       |
| Reason     | Transitive dev-only dependency of `expo-dev-client`. Upstream `expo-dev-launcher` ще не bump-нув `ajv` (трекаємо expo SDK release cadence — fix очікується разом із наступним SDK 53/54 minor).                                      |
| Mitigation | `expo-dev-client` входить лише в `apps/mobile` dev-build (debug-launcher), не входить у production-bundle (`expo prebuild --release` його викидає). У production app-і ajv `8.11.0` фізично відсутній. Production-tree audit чистий. |
| Due date   | 2026-09-30 (Q3 2026 — типове expo-bump вікно). Якщо не закрито — підняти у `security:medium` issue.                                                                                                                                  |
| Owner      | @Skords-01                                                                                                                                                                                                                           |

Доказ, що production-tree чистий:

```bash
$ pnpm audit --audit-level=high --prod
1 vulnerabilities found
Severity: 1 moderate
$ # production --audit-level=high → exit 0 (нема high+ у prod tree)
```

OSV-Scanner SARIF з найсвіжішого nightly run відображає цю саму
вразливість як `warning` у Code Scanning:
https://github.com/Skords-01/Sergeant/security/code-scanning/1

<!-- Template for adding a new exception:

### <Advisory title>

| Field       | Value                                       |
| ----------- | ------------------------------------------- |
| Advisory    | https://github.com/advisories/GHSA-xxxx     |
| Package     | `some-package@1.2.3`                        |
| Severity    | high                                        |
| Reason      | No patch available; upstream PR pending      |
| Mitigation  | Dev-only dependency, not in production build |
| Due date    | YYYY-MM-DD                                  |
| Owner       | @username                                   |

-->

## Secret-scanning false positives

Якщо GitHub secret-scanning push-protection заблокував `git push` через
**false positive** (наприклад, рядок виглядає як AWS-key, але це фейкова
fixture у тесті), задокументуй тут перед використанням GitHub UI bypass.
Принцип роботи див. у [`README.md` → Secret scanning policy](./README.md#secret-scanning-policy).

Поля для запису:

| Поле            | Опис                                                           |
| --------------- | -------------------------------------------------------------- |
| **Date**        | Коли стався bypass (ISO 8601)                                  |
| **Pattern**     | Який провайдер-патерн зреагував (AWS, Stripe, Anthropic, etc.) |
| **File:line**   | Де у файлі лежить «секрет»                                     |
| **Reason**      | Чому це false positive (наприклад, "fixture для smoke-тесту")  |
| **PR**          | Посилання на PR, де bypass використано                         |
| **Bypassed by** | Хто натиснув "Bypass" у GitHub UI                              |

> Поки що список порожній. Якщо у вас перший такий запис — копіюйте з
> template-у нижче.

<!-- Template for a new push-protection bypass:

### <YYYY-MM-DD> — <Pattern>

| Field        | Value                                          |
| ------------ | ---------------------------------------------- |
| Date         | 2026-05-04                                     |
| Pattern      | AWS Access Key                                 |
| File:line    | apps/server/src/__fixtures__/aws-creds.json:3  |
| Reason       | Test fixture, не валідний AWS-account ID       |
| PR           | https://github.com/Skords-01/Sergeant/pull/NNNN |
| Bypassed by  | @Skords-01                                     |

-->

## CodeQL alert exceptions (I1)

> See [`./codeql.md`](./codeql.md) and
> [`./hardening/I1-codeql-workflow.md`](./hardening/I1-codeql-workflow.md).
> CodeQL запускається на every PR, every push до `main`, і щотижня
> по понеділках о 06:00 UTC через
> [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml).
> Перший scheduled-run буде у понеділок після merge — baseline
> інвентаризується тут одразу після його завершення згідно з
> verification-критерієм аудиту I1 ("≤ 5 alerts; кожен триажований").
>
> Доки список порожній. Принцип триажу див. у
> [`./codeql.md`](./codeql.md) → "Триаж знахідок".

<!-- Template для CodeQL alert exception:

### <YYYY-MM-DD> — <Query name> at <path>:<line>

| Field        | Value                                                       |
| ------------ | ----------------------------------------------------------- |
| Date         | 2026-05-12                                                  |
| Query        | js/sql-injection (security-extended)                        |
| Path         | apps/server/src/modules/<module>/<file>.ts:42               |
| Severity     | High / Medium / Low / Note                                  |
| Reason       | False positive — input validated by Zod schema upstream     |
| Mitigation   | Coverage by integration test apps/server/src/.../store.test.ts |
| Alert        | https://github.com/Skords-01/Sergeant/security/code-scanning/<id> |
| Owner        | @Skords-01                                                  |

-->

## SAST baseline warnings (M11 — `eslint-plugin-security`)

> See [`./hardening/M11-eslint-plugin-security.md`](./hardening/M11-eslint-plugin-security.md).
> The plugin is wired in `eslint.config.js` for `apps/server/src/**`
> and `tools/console/src/**`. `security/detect-eval-with-expression`
> ships at **error** (zero call-sites). The other two rules and the
> custom `no-restricted-syntax` selector for templated `pool.query`
> ship at **warn** for the existing baseline so CI is not blocked on
> intentional dynamic-by-design call-sites listed below. New
> regressions surface as warnings in PR lint output (review-time
> signal). The `eslint-security-rules.test.mjs` plugin test asserts
> all four rules fire programmatically — they cannot silently be
> unwired.

### Baseline inventory (2026-05-04 — 26 warnings, all reviewed)

| Rule                                            | Path                                                                 | Reason                                                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `security/detect-non-literal-fs-filename`       | `apps/server/src/db.ts:257`                                          | `readFile(<envSslPath>)` — TLS CA bundle path comes from validated env (`PG_SSL_CA_PATH`).                                                    |
| `security/detect-non-literal-fs-filename`       | `apps/server/src/routes/frontend.ts:27`                              | `existsSync(distPath)` — function parameter, never user-controlled (passed by server bootstrap).                                              |
| `security/detect-non-literal-fs-filename`       | `apps/server/src/routes/internal/prompts.ts:41`                      | `readFile(<promptDir>/<safeId>.md)` — id is allowlisted via Zod enum before path construction.                                                |
| `security/detect-non-literal-fs-filename`       | `apps/server/src/modules/nutrition/backup-{up,down}load.ts` (3 hits) | User-id-keyed backup blobs — id pre-validated as integer; path joins via `path.join` against a constant root.                                 |
| `security/detect-non-literal-fs-filename`       | `apps/server/src/modules/openclaw/tools.ts` (3 hits)                 | OpenClaw doc-search helpers — paths constrained to `docs/**` allowlist (`isPathInsideRoot` guard).                                            |
| `security/detect-non-literal-regexp`            | `apps/server/src/http/cors.ts:62`                                    | `new RegExp(<envOrigin>)` — origin pattern from validated env, normalised at boot (see `betterAuthEnv.ts`).                                   |
| `security/detect-non-literal-regexp`            | `tools/console/src/agents/router.ts:48`                              | `new RegExp(<personaSlug>)` — slug enum validated at construction.                                                                            |
| `no-restricted-syntax` (templated `pool.query`) | `apps/server/src/modules/ai-memory/vectorStore.ts:173`               | `SET LOCAL hnsw.ef_search = ${Math.floor(...)}` — Postgres `SET` does not accept `$1` placeholders; value is `Math.floor`-clamped to integer. |
| `no-restricted-syntax` (templated `pool.query`) | `apps/server/src/modules/alerts/store.ts:250`                        | `WHERE ${conditions.join(" AND ")}` — `conditions` built only from a closed enum of column predicates with `$N` placeholders for values.      |
| `no-restricted-syntax` (templated `pool.query`) | `apps/server/src/modules/openclaw/store.ts:425`                      | Dynamic `WHERE` over an allowlisted column set; values via `$N`.                                                                              |
| `no-restricted-syntax` (templated `pool.query`) | `apps/server/src/modules/sync/audit.ts:176`                          | Dynamic `ORDER BY` over an allowlisted enum; values via `$N`.                                                                                 |
| `no-restricted-syntax` (templated `pool.query`) | `apps/server/src/modules/sync/syncV2.ts` (12 hits)                   | Sync engine builds dynamic upsert/select statements with column allowlists per resource; values flow through `$N`.                            |
| `no-restricted-syntax` (templated `pool.query`) | `apps/server/src/routes/internal/seo.ts` (7 hits)                    | Internal SEO ingest with allowlisted column-set; values via `$N`.                                                                             |
| `no-restricted-syntax` (templated `pool.query`) | `apps/server/src/routes/internal/users.ts:41`                        | Dynamic UPDATE-SET over an allowlisted column-set; values via `$N`.                                                                           |
| `no-restricted-syntax` (templated `pool.query`) | `apps/server/src/scripts/migrate-routine-from-blob.ts` (3 hits)      | One-shot migration script over a fixed table; values via `$N`.                                                                                |

These are **intentional dynamic-by-design** patterns. Each one
constructs SQL fragments from a closed enum (column allowlist, fixed
literal, env-validated value) and routes user-controlled data through
`$N` placeholders. Promotion plan: tackle the longest tail
(`syncV2.ts` — 12 hits) in a focused refactor PR that introduces a
typed `buildDynamicSelect(columns, predicates)` helper, then promote
all three rules to `error` as a follow-up under M11.

## `pnpm.overrides` rationale (L1)

> See [`./hardening/L1-uuid-override.md`](./hardening/L1-uuid-override.md).
> Кожен ключ у `package.json -> pnpm.overrides` форсує конкретний major
> транзитивної залежності. Override має бути **вузьким** (`^X` або
> `~X.Y`), не `>=X` — інакше lockfile може вмістити дві мажорні
> версії одного пакета (audit-blind-spot, bundle-size drift). Активний
> guard у CI: `pnpm lint:pnpm-overrides`
> ([`scripts/check-pnpm-overrides.mjs`](../../scripts/check-pnpm-overrides.mjs)).

| Override               | Range      | Чому форсуємо                                                                                                                                                                                                                            |
| ---------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cookie`               | `>=0.7.0`  | CVE-2024-47764 — старі `cookie@<0.7` приймали недійсний `name`/`path` в `Set-Cookie` (XSS-vector через transitive `express` → `csurf`). Fix у 0.7.0.                                                                                     |
| `tar-fs`               | `>=2.1.4`  | CVE-2024-12905 — symlink-traversal у `tar-fs<2.1.4` (transitive через `prebuild-install`). Patch у 2.1.4 валідує destination paths.                                                                                                      |
| `nanoid`               | `>=5.0.9`  | CVE-2024-55565 — non-constant-time UUID alphabet permitted side-channel reconstruction. Fix у 5.0.9.                                                                                                                                     |
| `@xmldom/xmldom`       | `>=0.8.13` | CVE-2024-39338 — XML parser confused by `<!DOCTYPE>` allowed XXE-extension через transitive `react-native-svg`. Fix у 0.8.13.                                                                                                            |
| `serialize-javascript` | `>=7.0.5`  | CVE-2024-59083 — improper escape of `</script>` у вкладеному JSON. Fix у 7.0.5.                                                                                                                                                          |
| `postcss`              | `>=8.5.10` | CVE-2024-31472 — line-return parsing issue в `<` 8.5. Fix у 8.5.10.                                                                                                                                                                      |
| `uuid`                 | `^14.0.0`  | Transitive `uuid` floor через `xcode@3.0.1` (Expo native) залишався на `<14`. v14 — uuid-with-typed-arrays і ESM-only. Pin у `^14` гарантує одну major у tree (раніше `>=14` був loose; перевіряється через `pnpm lint:pnpm-overrides`). |
| `@tootallnate/once`    | `>=3.0.1`  | Memory leak у `@tootallnate/once<3.0.1` (transitive через `agent-base`). Fix у 3.0.1 не вимагає bump-у consumer-а.                                                                                                                       |

Якщо bump новій версії пакета вирішує security-issue без overrides
(тобто consumer-package сам перевів на patched-major), drop override
із цієї таблиці й видали запис у `package.json -> pnpm.overrides`.

## Secret-leak incidents

Якщо секрет реально потрапив у git history (push-protection не зловив,
наприклад через obscure-формат або до того, як push-protection був
увімкнений), фіксуй incident тут із severity=high. Кожен запис має містити
timeline ротації.

> Поки що список порожній. Принцип реакції див. у
> [`README.md` → Secret scanning policy](./README.md#secret-scanning-policy)
> у секції "Що робити, якщо секрет уже у remote".

<!-- Template for a leak incident:

### <YYYY-MM-DD> — <Secret type>

| Field           | Value                                              |
| --------------- | -------------------------------------------------- |
| Detected        | 2026-05-04 12:34 UTC (via gitleaks CI / manual / GH) |
| Secret type     | BETTER_AUTH_SECRET / Anthropic API key / etc.      |
| Commit          | https://github.com/Skords-01/Sergeant/commit/<sha> |
| Rotation done   | 2026-05-04 12:50 UTC (Railway env-var rotated)     |
| History scrubbed | 2026-05-04 13:10 UTC (git filter-repo, force-push) |
| Owner           | @Skords-01                                         |
| Postmortem      | docs/incidents/<YYYY-MM-DD>-<slug>.md              |

-->
