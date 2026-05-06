# Stack pulse — 2026-05

> **Last validated:** 2026-05-06 by Codex. **Next review:** 2026-08-04.
> **Status:** Active

Серія планів-PR-ів для виправлення слабких місць стеку Sergeant, виявлених
під час глибокого зрізу 2026-05-03. Кожен файл — самостійний executable
план для одного PR-а: scope, acceptance criteria, тести, rollout, risks.

> **Це не аудит.** Аудити лежать у [`docs/audits/`](../../audits/README.md).
> Тут — дорожня карта **наступних кроків**: «що, де, чому, як перевірити».
> Документи у цьому каталозі — `Active` поки відповідний PR не змерджений,
> після — статус → `Closed` з посиланням на PR, файл лишається як historical record.

---

## Як читати

- **Severity** — критичність, яка випливає з зрізу: `Critical` / `High` / `Medium` / `Low`.
- **Туркі-точки** — конкретні `file:line` для швидкого старту.
- **DoD** (Definition of Done) — чек-ліст, без якого PR не закривається.
- **Тести** — конкретні test-files, які треба додати/оновити (інакше PR не вважається завершеним).
- **Rollout** — як саме викочуємо: feature-flag / staged / immediate.

---

## Виконавче резюме

Sergeant — дисциплінований monorepo з над-середньою інженерною культурою.
Найбільші ризики цього зрізу — **соціальні**, не технічні (bus factor = 1).
Серед технічних — **подвійна env-система**, **bcrypt password silent truncation**,
**rate-limit fail-open**, **TS 6 + @types/node 25 на Node 20** і **plain-PAT
для OpenClaw з `contents:write`**.

Окремі PR-плани нижче — по 1 PR на одну окрему причину. Не поєднуйте їх у
mega-PR — кожен має власний рівень ризику і rollback-план.

---

## Критичні (Critical) — Sprint 1, наступні 2 тижні

| PR  | План                                                                                    | Severity | Effort  | Status                                                                                          |
| --- | --------------------------------------------------------------------------------------- | -------- | ------- | ----------------------------------------------------------------------------------------------- |
| 01  | [Уніфікувати env-модулі сервера](./pr-01-unify-env-modules.md)                          | Critical | 1–2 дні | Planned                                                                                         |
| 02  | [Rate-limit fail-closed на `/api/auth/*`](./pr-02-rate-limit-fail-closed.md)            | Critical | 1 день  | Closed — merged [#1552](https://github.com/Skords-01/Sergeant/pull/1552)                        |
| 03  | [`MAX_PASSWORD_LENGTH` policy correction](./pr-03-bcrypt-password-limit.md)             | Critical | 1–2 дні | Closed — merged [#1550](https://github.com/Skords-01/Sergeant/pull/1550)                        |
| 04  | [Secondary owners + knowledge-transfer plan](./pr-04-bus-factor-secondary-owners.md)    | Critical | 1 тижд. | Planned                                                                                         |
| 05  | [`@types/node` ↓ 20.x + ADR на TS 6 vs 5.x](./pr-05-typescript-types-node-downgrade.md) | Critical | 1 день  | Planned                                                                                         |
| 06  | [OpenClaw → GitHub App, прибрати `Git_PAT` fallback](./pr-06-openclaw-github-app.md)    | Critical | 2–3 дні | In progress / partial — Phase 1 merged [#1816](https://github.com/Skords-01/Sergeant/pull/1816) |

## Високі (High) — Sprint 2–3, поточний квартал

| PR  | План                                                                                               | Severity | Effort  | Status                                                               |
| --- | -------------------------------------------------------------------------------------------------- | -------- | ------- | -------------------------------------------------------------------- |
| 07  | [Declarative body-size policy](./pr-07-body-size-declarative-policy.md)                            | High     | 0.5 дня | Planned                                                              |
| 08  | [API versioning consolidation (видалити v1-rewrite-shim)](./pr-08-api-versioning-consolidation.md) | High     | 0.5 дня | Planned                                                              |
| 09  | [`@parse/node-apn` review (ADR-only)](./pr-09-apns-library-adr.md)                                 | High     | 0.5 дня | ADR-0048 in review                                                   |
| 10  | [Better Auth security review + Safari/Webkit E2E](./pr-10-better-auth-security-review.md)          | High     | 2–3 дні | Planned                                                              |
| 11  | [Drizzle schema ↔ SQL drift CI gate](./pr-11-drizzle-schema-drift-ci.md)                           | High     | 1–2 дні | Planned                                                              |
| 12  | [Sentry tracesSampler dynamic per-route](./pr-12-sentry-traces-sampler.md)                         | High     | 0.5 дня | Planned                                                              |
| 13  | [PG pool sizing + monitoring + alerts](./pr-13-postgres-pool-sizing.md)                            | High     | 1 день  | Planned                                                              |
| 14  | [Vercel COEP review (require-corp)](./pr-14-vercel-coep-review.md)                                 | High     | 0.5 дня | Closed by M21                                                        |
| 15  | [`AI_QUOTA_DISABLED=1` hard-block у production](./pr-15-ai-quota-disabled-hardblock.md)            | High     | 0.5 дня | In review — [#1567](https://github.com/Skords-01/Sergeant/pull/1567) |
| 16  | [Pino redaction policy + ESLint guard](./pr-16-pino-redaction-policy.md)                           | High     | 1 день  | Planned                                                              |

---

## Medium / Low — наступні квартали

Medium / Low пункти не виносяться у окремі PR-плани, доки не призначений
owner і дата. Вони лежать у [`00-overview.md`](./00-overview.md) як trackable
checklist. При появі ownership — створюється файл `pr-NN-<slug>.md` за
шаблоном.

Дивись також:

- [`docs/audits/2026-04-28-implementation-roadmap.md`](../../audits/2026-04-28-implementation-roadmap.md) — попередній roadmap
- [`docs/tech-debt/`](../../tech-debt/README.md) — living tech-debt registries
- [`docs/planning/dev-stack-roadmap.md`](../../planning/archive/dev-stack-roadmap.md) — топ-15 ROI-roadmap

---

## Convention для нових PR-планів у цьому каталозі

```markdown
# PR-NN: <короткий заголовок>

> **Last validated:** YYYY-MM-DD by @<owner>. **Next review:** YYYY-MM-DD.
> **Status:** Planned | In progress | Closed (PR #XXXX)

|                    |                                    |
| ------------------ | ---------------------------------- |
| **Severity**       | Critical / High / Medium / Low     |
| **Linked finding** | C1 / H3 / ... (з `00-overview.md`) |
| **Owner**          | @username (TBD)                    |
| **Effort**         | X днів                             |
| **Risk**           | Low / Medium / High                |
| **Touches**        | apps/server/src/..., packages/...  |

## Контекст

## Scope

## Out of scope

## Acceptance criteria (DoD)

## Тести

## Rollout

## Risks & mitigations

## Touchpoints (file:line)
```

При закритті PR — оновити `Status:` на `Closed (PR #NNNN)`, додати посилання на merged-PR і **не видаляти** файл.
