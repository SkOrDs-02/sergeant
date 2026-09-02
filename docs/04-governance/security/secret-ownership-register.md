# Secret Ownership Register

> **Last touched:** 2026-09-02 by @claude. **Next review:** 2027-11-08.
> **Status:** Active

Operational metadata registry for secrets and privileged system credentials in Sergeant. This register documents ownership and blast radius, never secret values.

## Register

> **Schema note (2026-05-06).** Колонки `Status` і `Lifetime` додані як частина action-item §A4 з [`docs/90-work/audits/archive/2026-05-04-csp-disable-retrospective.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive/2026-05-04-csp-disable-retrospective.md). `Status` = `active` для секретів у production-обігу або `removed YYYY-MM-DD` (з опційним коментарем) для retired-row-ів, що залишаються тут як audit-trail для governance/SOC2. `Lifetime` = `ongoing` для активних або `YYYY-MM-DD → YYYY-MM-DD` для closed-вікон. Retired-row-и не видаляємо — фіксуємо у §Retired secrets нижче.

| System / secret group                                | Owner   | Storage location                                      | Consumer systems                                              | Rotation cadence                          | Rollback / compatibility note                                               | Compromise impact                                           | Status | Lifetime | Last reviewed |
| ---------------------------------------------------- | ------- | ----------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- | ------ | -------- | ------------- |
| Better Auth secret and session-critical auth secrets | Founder | Coolify app env, local `.env`, CI if needed           | `apps/server`, auth/session flows                             | On compromise or auth-architecture change | Rotation invalidates sessions; do during low-traffic window                 | Global login/session disruption                             | active | ongoing  | 2026-07-29    |
| Postgres production credentials                      | Founder | Coolify Postgres resource + restricted operator store | `apps/server`, migration tooling, health checks               | On compromise or provider rotation event  | Coordinate with runtime and migration access                                | Full data-plane compromise risk                             | active | ongoing  | 2026-07-29    |
| Anthropic / OpenAI provider keys                     | Founder | Coolify app env                                       | AI endpoints and HubChat orchestration                        | Monthly review, immediate on suspicion    | No backward compatibility; update all runtimes together                     | Cost abuse, feature outage, prompt-serving disruption       | active | ongoing  | 2026-07-29    |
| Sentry auth / DSN / admin secrets                    | Founder | Coolify/Vercel env, vendor console                    | `apps/server`, `apps/web`, alerting workflows                 | Quarterly or on compromise                | DSN swaps are usually low-risk; admin-token rotation may break integrations | Lost error visibility or unauthorized issue access          | active | ongoing  | 2026-07-29    |
| PostHog project / admin secrets                      | Founder | Coolify/Vercel env, vendor console                    | product analytics, release annotations, behavioral dashboards | Quarterly or on compromise                | Reconfigure integrations after rotation                                     | Behavioral data exposure, analytics tampering               | active | ongoing  | 2026-07-29    |
| Telegram waitlist / alert bot tokens                 | Founder | Coolify app env                                       | `apps/server` Telegram webhook/broadcast/alerts               | On compromise or role change              | Rotation can interrupt waitlist replies or alert delivery until redeploy    | Bot impersonation or notification outage                    | active | ongoing  | 2026-07-29    |
| Push / mobile distribution credentials               | Founder | App store consoles, local release tooling             | `apps/mobile`, `apps/mobile-shell`, release workflows         | On compromise or certificate expiry cycle | Store propagation may delay full recovery                                   | Broken mobile release pipeline or malicious app update risk | active | ongoing  | 2026-05-01    |

## Pending secrets — third-party erasure/purge tokens (GDPR Art. 17)

> **Не в production-обігу.** Ці credential-и ще не заведені, тому їх НЕ додано в §Register вище — там `Status` за схемою лише `active` або `removed YYYY-MM-DD`. Рядки переїжджають у §Register у тому самому PR, що вмикає purge-шлях.

**Навіщо.** `DELETE /api/me` видаляє дані з нашої БД, але дані користувача лишаються у третіх сторонах — це незакритий GDPR Art. 17. Аудит 2026-07-25 (`apps/server/src/modules/me/dataRights.ts` → `deleteUserData`) підтвердив: чистяться лише billing-провайдери (`stripe`, `liqpay`, `plata`), а Sentry / PostHog / Resend — ні.

**Ключове розрізнення.** Наявні в §Register рядки «Sentry auth / DSN» і «PostHog project» — це **ingest**-креденшели: вони вміють писати, але не видаляти. Purge вимагає окремого **admin / management** токена з delete-скоупом. Це інший секрет з суттєво вищим blast radius: скомпрометований ingest-ключ псує телеметрію, скомпрометований purge-токен дає стирання чужих даних у vendor-акаунті.

| Vendor      | Потрібний токен                          | Blast radius при компромісі                                        | Стан                                                                  |
| ----------- | ---------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| **Sentry**  | org/project auth token з delete-скоупом  | Видалення issue-історії й проєктних даних поза межами одного юзера | ⏸ не заведено. **Vendor-API не підтверджено** — див. відкриті питання |
| **PostHog** | personal API key з person-delete скоупом | Стирання person-записів і поведінкової історії в проєкті           | ⏸ не заведено                                                         |
| **Resend**  | API key з contacts-delete скоупом        | Видалення/зміна audience-контактів                                 | ⏸ не заведено. Vendor узагалі відсутній у §Register                   |

**Відкриті питання до реалізації (не вигадувати — підтвердити по vendor-докам):**

- Sentry: чи існує per-user erasure API взагалі, чи покриття досягається лише data-scrubbing + retention-політикою. Якщо per-user delete недоступний — це треба явно задокументувати в Privacy Policy як обмеження, а не вдавати, що покрито.
- PostHog / Resend: точні ендпойнти й формат ідентифікатора (у нас `user_id` — opaque Better Auth рядок, не email).
- Де зберігати: backend живе на Hetzner + Coolify ([ADR-0074](../adr/0074-hosting-hetzner-coolify.md)), тож env-vars Coolify, не Railway.
- Fail-режим: provider-cancel уже best-effort. Purge мусить писати `purge_failed` у audit-журнал і алертити, а не тихо ковтати помилку.

**Owner:** Founder (заведення ключів) + Dev (реалізація purge-шляху).
**Трекер:** § 1.4 у [`04-launch-readiness.md`](../../01-product/launch/business/04-launch-readiness.md); блок «Privacy and data-rights operations» у [`ai-coding-improvements.md`](../../90-work/planning/ai-coding-improvements.md).

## Retired secrets

Audit-trail row-и для retired runtime-flag-ів і secret group-ів. Зберігаємо тут (а не видаляємо) для SOC2-evidence і кореляції з incident-record-ами.

| System / secret group             | Owner   | Storage location | Consumer systems             | Rotation cadence              | Rollback / compatibility note                                                                                                                                                                                                                                       | Compromise impact                                                                                                                                                                                                                                                                                                                                                       | Status             | Lifetime                | Last reviewed |
| --------------------------------- | ------- | ---------------- | ---------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------- | ------------- |
| `CSP_DISABLE` runtime kill-switch | Founder | Railway prod env | `apps/server` CSP middleware | n/a (kill-switch — не secret) | Видалено з коду + EnvSchema у [PR #1631](https://github.com/Skords-01/Sergeant/pull/1631) (2026-05-04). Введено у [PR #128](https://github.com/Skords-01/Sergeant/pull/128) (2026-04-18); warn-on-boot — [PR #345](https://github.com/Skords-01/Sergeant/pull/345). | Якщо enabled у проді — повний CSP-bypass на API origin. Audit ([`2026-05-04-csp-disable-retrospective.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive/2026-05-04-csp-disable-retrospective.md)) підтвердив: ніколи не enabled у production за 16-day window (Railway env + Sentry + boot-log = 0). | removed 2026-05-04 | 2026-04-18 → 2026-05-04 | 2026-05-06    |

## Rules

- Every secret group must have one owner.
- If a secret is consumed by multiple runtimes, rotation notes must describe coordination order.
- Machine credentials must map to one documented system purpose; avoid `misc` or shared buckets.
- If a secret group is retired, переноситься у §Retired secrets у тому самому PR, що видаляє consuming surface; `Status` стає `removed YYYY-MM-DD`, `Lifetime` фіксує закрите вікно.

## Related docs

- [access-policy.md](./access-policy.md)
- [access-matrix.md](./access-matrix.md)
- [rotate-secrets.md](../../00-start/playbooks/rotate-secrets.md)
