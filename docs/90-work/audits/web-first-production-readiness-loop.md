<!-- AUTO-GENERATED: false - authored production-readiness loop -->

# Web-first production readiness loop

> **Last validated:** 2026-06-29 by Codex. **Next review:** 2026-07-13.
> **Status:** Active

## Мета

Провести production-readiness тестування Sergeant перед роботою з реальними
користувачами, не розмиваючи фокус на нативний mobile/Capacitor. Цей loop
можна давати наступній AI-сесії як стартову інструкцію: вона має виконувати
групи по черзі, фіксувати evidence, створювати regression-тести для знайдених
дефектів і не оголошувати readiness без свіжої верифікації.

## Продуктове рішення

**Web first.** Нативний mobile, Expo-shell і Capacitor-shell залишаються
відкладеними планами. Їх не треба тягнути у launch-readiness gate, доки web не
працює стабільно і немає реальних користувачів/traction.

Повертаємося до нативки або Capacitor тільки після виконання усіх умов:

- web має стабільні core-флоу без P0/P1 дефектів;
- є реальні користувачі або чіткий acquisition канал;
- зрозуміло, які mobile-only сценарії web/PWA не закриває;
- є окремий capacity на native QA, store/build pipeline і device matrix.

## Орієнтир ціни інфраструктури

Це planning estimate, не billing commitment. Перед реальною міграцією треба
перерахувати по фактичному регіону, трафіку, retention logs і розміру БД.

| Рівень                  |            Орієнтир | Що входить                                                                                                                |
| ----------------------- | ------------------: | ------------------------------------------------------------------------------------------------------------------------- |
| Lean production         |   $120-250 / місяць | CDN/static web, 1-2 маленькі API tasks, managed Postgres single-AZ, мінімальний Redis/Valkey, базові logs/alerts          |
| Normal production floor |   $300-700 / місяць | 2+ API tasks, окремий worker, managed Postgres Multi-AZ, managed Redis/Valkey, ALB/reverse proxy, backups, Sentry/metrics |
| Growth buffer           | $800-2000+ / місяць | autoscaling API/workers, більша БД, довший log retention, load-test headroom, WAF/security add-ons                        |

Рекомендована ціль до перших платних або публічних користувачів: **normal
production floor**, але без Kubernetes. Web/static окремо від API; API і worker
як Docker services; Postgres і Redis/Valkey як managed services.

## Групи тестування

### Група A — Chat resilience and load

Мета: довести, що `/api/chat` і browser chat деградують контрольовано під
нормальним навантаженням, помилками провайдера і обривами stream-у.

Сценарії:

- звичайний non-stream chat response;
- SSE streaming до `[DONE]`;
- tool calls і tool results;
- Anthropic 401/429/5xx/timeout;
- client disconnect посеред SSE;
- quota/rate-limit success і fail paths;
- retry/refund behavior після upstream failure;
- browser flow: користувач пише в чат, бачить відповідь, помилка показується
  без зависання UI.

Мінімальний evidence:

- focused server tests для quota/upstream/refund;
- Playwright smoke для browser chat;
- load profile `10 -> 25 -> 50` concurrent users;
- таблиця p50/p95/p99, 4xx/5xx, first-token latency, memory RSS, DB
  connection count.

Pass criteria:

- p95 first token у launch-profile не перевищує погоджений бюджет;
- 5xx не росте під стабільним навантаженням;
- upstream failure повертає контрольований 503/429 без secret leak;
- після 30 хвилин load немає монотонного memory growth;
- browser UI не зависає і дозволяє повторити дію.

### Група B — Data, migrations, backup restore

Мета: довести, що БД можна безпечно підняти з нуля, оновити з prod-like стану,
відновити з backup і перевірити critical read/write флоу після міграцій.

Сценарії:

- empty Postgres -> всі migrations -> smoke API;
- prod-like seed/snapshot -> migrations -> smoke API;
- migration 078 окремо: Anthropic usage bucket insert/update;
- backup create -> restore у нову БД -> smoke API;
- down migration drill тільки на dev/staging snapshot, не як production
  rollback-процес;
- bigint serialization check для API responses, де є DB aggregate/id поля.

Мінімальний evidence:

- migration command output;
- SQL або route smoke, що підтверджує `ai_usage_daily.bucket` для
  `anthropic:*`;
- restore target connection string redacted;
- список таблиць/row counts до і після restore;
- regression test або documented manual proof для кожного знайденого drift.

Pass criteria:

- migrations проходять без ручного втручання;
- restore не ламає auth/session-critical paths;
- no schema drift у generated schema/openapi checks;
- rollback/drill має documented decision: що робимо при failed prod migration.

### Група C — Security launch audit

Мета: знайти launch-blocking security issues до появи реальних user data.

Сценарії:

- secrets scan: repo, staged diff, CI secret-scan;
- auth/session: signup/login/logout/reset/expired session/protected routes;
- CSRF/CORS/cookie flags;
- rate limits: auth, password reset, chat, internal endpoints;
- prompt injection/tool abuse: malformed JSON, oversized messages, forbidden
  tool payloads, unexpected tool names;
- PII/log redaction: tokens, cookies, emails, financial fields, auth provider
  payloads;
- dependency audit and container scan;
- internal endpoints: bearer token absent/invalid/valid.

Мінімальний evidence:

- `pnpm audit --audit-level=moderate` або documented exception;
- `pnpm lint` або narrower redaction/security checks, якщо full lint окремо
  заблокований unrelated debt;
- focused auth/internal route tests;
- log sample з redacted keys, без реальних secret/user values;
- список P0/P1 findings або явне `none found`.

Pass criteria:

- немає hardcoded secrets;
- немає auth bypass;
- internal endpoints fail closed;
- sensitive keys covered by shared redaction policy;
- rate limits documented або implemented для public abuse surfaces;
- high/critical CVEs або patched, або мають approved exception.

### Група D — Observability and incident drill

Мета: довести, що production failure видно, triage зрозумілий, recovery
перевірений.

Сценарії:

- зламати `DATABASE_URL` або підняти API без доступу до Postgres;
- зламати `ANTHROPIC_API_KEY`;
- симулювати slow DB або upstream latency;
- викликати 500 у test-only/staging-safe endpoint або через mocked upstream;
- перевірити Sentry/log event для error path;
- перевірити health/readiness response;
- пройти rollback/redeploy checklist.

Мінімальний evidence:

- URL/command healthcheck без secret values;
- screenshot або log excerpt з dashboard/alert;
- Sentry issue id або local/staging event id;
- time-to-detect і time-to-recover;
- runbook gap list.

Pass criteria:

- alert приходить у погоджений канал;
- `/health`/readiness відрізняє live process від broken dependency;
- logs містять request id/trace id і не містять PII/secrets;
- є зрозумілий rollback path;
- після recovery smoke tests знову green.

## Основний loop виконання

Виконавець має йти групами A -> B -> C -> D, але не чекати ідеального full
suite, якщо знайдено launch-blocker. На blocker перейти у fix loop, потім
повернутися до тієї ж групи.

1. **Prepare**
   - Перевірити поточну гілку, PR/CI status і dirty worktree.
   - Відкрити цей документ і `docs/90-work/audits/user-story-loop.md`.
   - Визначити environment: local, staging, preview або production-like.
   - Зафіксувати, які secrets потрібні; не виводити їх у лог.

2. **Baseline**
   - Запустити найменший sanity gate: format/lint/typecheck або documented
     narrower checks, якщо full gate flaky/too slow.
   - Запустити existing critical smoke lane.
   - Зафіксувати known blockers і не змішувати їх із новими findings.

3. **Run group**
   - Взяти одну групу з розділу вище.
   - Для кожного сценарію обрати automation-first proof: Vitest/Jest,
     Supertest, Playwright, k6/Artillery або documented manual proof.
   - Записати command, exit code, короткий output summary і artifact path.

4. **Classify findings**
   - P0: data loss, auth bypass, secret leak, migration breaks boot.
   - P1: chat/core flow unusable, repeatable 5xx, missing alert, broken
     restore.
   - P2: degraded UX, slow path, noisy logs, missing nice-to-have metric.
   - Для P0/P1 створити regression test або explicit reproduction recipe.

5. **Fix**
   - Фіксити тільки P0/P1 і low-risk P2, які блокують групу.
   - Перед code edits завантажити owner skill для touched surface.
   - Не змішувати unrelated refactors.

6. **Retest**
   - Повторити сценарій, який впав.
   - Повторити affected neighboring scenario.
   - Оновити evidence: failing before -> passing after або documented
     exception.

7. **Close group**
   - Група закрита тільки коли всі P0/P1 resolved або явно accepted by owner.
   - Додати підсумок: commands, pass/fail, open risks, next group.

8. **Launch decision**
   - Web launch можна рекомендувати тільки якщо A-D без open P0/P1.
   - Native/Capacitor не входять у decision; вони залишаються parked until web
     traction.

## Evidence формат

Для кожного запуску додавати у PR comment, issue, або новий dated section у
цьому документі:

| Field       | Value                                                   |
| ----------- | ------------------------------------------------------- |
| Date/time   | Europe/Kyiv timestamp                                   |
| Group       | A / B / C / D                                           |
| Environment | local / staging / preview / production-like             |
| Command     | exact command, без secrets                              |
| Result      | passed / failed / blocked                               |
| Key metrics | p95, error rate, memory, DB connections, restore counts |
| Artifacts   | trace, screenshot, logs, dashboard link                 |
| Findings    | P0/P1/P2 ids                                            |
| Next action | fix / retest / proceed                                  |

## Handoff prompt для наступної сесії

```text
Продовж web-first production readiness loop у Sergeant.

Контекст:
- Репо: E:\.claude\Sergeant\.claude\worktrees\qa-feature-audit
- Док: docs/90-work/audits/web-first-production-readiness-loop.md
- Web-first рішення: native mobile / Expo / Capacitor parked until web traction.
- Працюй групами A -> B -> C -> D: Chat resilience/load, DB/migrations/restore,
  Security launch audit, Observability/incident drill.

Правила:
- Почни з sergeant-start-here і owner skills для touched surface.
- Не логуй secrets.
- Для кожного сценарію записуй command, result, metrics/artifacts, findings.
- P0/P1 фікси одразу покривай regression test або reproduction recipe.
- Не claim readiness без свіжої верифікації.

Перший крок:
1. Перевір git status і PR/CI status.
2. Обери наступну незакриту групу.
3. Запусти smallest useful baseline.
4. Почни сценарії групи й веди evidence у форматі з цього документа.
```
