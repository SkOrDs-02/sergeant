# Audit-винятки

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
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
