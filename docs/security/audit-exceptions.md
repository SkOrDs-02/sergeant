# Audit-винятки

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

> Відстежені вразливості, які тимчасово допускаються через PR-лейбл `audit-exception`.

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
