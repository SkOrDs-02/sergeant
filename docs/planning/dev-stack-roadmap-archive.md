# Dev stack roadmap — архів історичних журналів сесій

> **Last validated:** 2026-05-05 by Devin. **Next review:** ніколи (read-only архів).
> **Status:** Archived (read-only).
> **Created:** 2026-05-05.
> **Source:** [`dev-stack-roadmap.md`](./dev-stack-roadmap.md) §«Журнал сесій».
> **Purpose:** зберегти хронологію early-spring 2026 «інфра-спринтів» (PR-и #714 — #743), не захаращуючи живий роадмап.

Цей файл — read-only. Нові журнали сесій додавайте у [`dev-stack-roadmap.md`](./dev-stack-roadmap.md). Коли «живий» розділ підіймається понад ~80 рядків — переносьте найстаріші записи сюди.

---

## 2026-04-25 — інфра-спринт

8 PR замерджено, 5 пунктів топ-15 закрито. Хронологія:

| PR                                                     | Що                                                               | Roadmap         | Тривалість |
| ------------------------------------------------------ | ---------------------------------------------------------------- | --------------- | ---------- |
| [#714](https://github.com/Skords-01/Sergeant/pull/714) | `AGENTS.md` + PR template "How AI-tested"                        | #8              | паралельно |
| [#715](https://github.com/Skords-01/Sergeant/pull/715) | AI markers + ESLint rule `sergeant-design/ai-marker-syntax`      | (ai-coding §3)  | паралельно |
| [#716](https://github.com/Skords-01/Sergeant/pull/716) | Knip + depcheck + first-pass dead-code cleanup                   | #2              | паралельно |
| [#717](https://github.com/Skords-01/Sergeant/pull/717) | Activate Playwright E2E на PR (Postgres service + browser cache) | #12             | паралельно |
| [#718](https://github.com/Skords-01/Sergeant/pull/718) | Snapshot tests для `accountsHandler` + `transactionsHandler`     | #10             | паралельно |
| [#719](https://github.com/Skords-01/Sergeant/pull/719) | Оновлення roadmap-ів зі статусом + Status-колонкою               | (meta)          | sequential |
| [#720](https://github.com/Skords-01/Sergeant/pull/720) | Fix `vitest.base.ts` ESM (всі 13 пакетів падали на startup)      | (infra unblock) | sequential |
| [#721](https://github.com/Skords-01/Sergeant/pull/721) | Renovate config (заміна Dependabot)                              | #7              | sequential |

**Bonus discoveries (поза планом):**

- `pnpm test` на main був повністю зламаний з commit `dab67bdc` через `ERR_UNKNOWN_FILE_EXTENSION` для `packages/config/vitest.base.js`. Native Node ESM loader не вміє резолвити `.ts` через package exports. Fixed у [#720](https://github.com/Skords-01/Sergeant/pull/720): конвертація у `.js` з JSDoc-типами. Без цього #721 (і всі наступні PR) теж не пройшли б CI.
- AGENTS.md з [#714](https://github.com/Skords-01/Sergeant/pull/714) був закомічений без `prettier --write`; виправлено у [#719](https://github.com/Skords-01/Sergeant/pull/719) разом з doc-апдейтами.

**Що НЕ робили і чому:**

- #1 Sentry, #5 Vercel Pro, #13 PostHog — потребують credentials/credit card мейнтейнера.
- #3 Strict TypeScript, #4 Testcontainers, #11 Pino — кожне 4-8 годин роботи; залишено на наступні спринти.
- #15 CONTRIBUTING.md — найдешевший залишковий win, але вирішено зробити Renovate першим (безпека).

**Метрики до/після:**

| Метрика                     | До 2026-04-25               | Після                                  |
| --------------------------- | --------------------------- | -------------------------------------- |
| Топ-15 закрито              | 0/15                        | 5/15                                   |
| `pnpm test` працює          | ❌ (всі 13 пакетів падають) | ✅ (12/13; mobile flaky per AGENTS.md) |
| Smoke E2E у PR              | ⏭️ skipped                  | ✅ runs                                |
| `AGENTS.md` контекст для AI | ❌                          | ✅                                     |
| AI markers convention       | ❌                          | ✅ + lint warn                         |
| Snapshot захист API форм    | 0 endpoint-ів               | 2 endpoint-и Mono                      |
| Auto-PR для оновлень        | ❌                          | ✅ Renovate (Mon 6am EU/Kyiv)          |
| Dead-code detection         | manual                      | Knip + depcheck                        |

**Поточні pre-merge checks на PR (станом на 2026-04-25):**

1. `Smoke E2E (Playwright)` ([#717](https://github.com/Skords-01/Sergeant/pull/717))
2. `Test coverage (vitest)` ([dab67bdc](https://github.com/Skords-01/Sergeant/commit/dab67bdc), unblocked by [#720](https://github.com/Skords-01/Sergeant/pull/720))
3. `check` (`format:check && lint && typecheck && test && build`)
4. `Vercel — sergeant` (rate-limited на free, потребує #5 Vercel Pro)
5. CodeRabbit + Devin Review (AI коментарі, не блокують)

**Наступні логічні кроки** (у порядку вартості/користі — станом на 2026-04-25):

1. **#15 CONTRIBUTING.md + 5-min quickstart** — найдешевший win, ~1 год.
2. **#11 Pino structured logging** — 4 год, але **розблокує** Sentry і PostHog (треба структуровані логи з request-id перш ніж їх десь агрегувати).
3. **#4 Testcontainers** — 4 год, посилює #10 (snapshot тести з реальним Postgres у CI ловлять ще більше регресій).
4. **#6 Turbo remote cache** — 1 год, прискорить CI з ~5 хв до ~1 хв на повторних білдах.
5. **#9 MSW + #14 size-limit** — frontend тести і bundle budget, по 2-4 год кожне.

**Dependent на платних сервісах** (черга на коли мейнтейнер додасть credit card — станом на 2026-04-25):

- [ ] #5 Vercel Pro ($20/міс) — розблокує preview deploy на PR
- [ ] #1 Sentry ($26/міс) — потребує #11 Pino перш ніж приносити користь
- [ ] #13 PostHog ($0 free tier) — теж краще з #11

### Документи що оновились разом

- `docs/planning/ai-coding-improvements.md` — TL;DR таблиця з Status-колонкою, прогрес-блок, маркери ✅ на блоках 1, 3, 4.2, 4.5, implementation checklist з лінками на PR.
- `docs/planning/dev-stack-roadmap.md` — TL;DR з Status-колонкою (5/15 done), §3.1 Static analysis і §4.1 Test infrastructure з ✅, §8.1 Security оновлений з Renovate vulnerabilityAlerts.
- `docs/integrations/renovate-usage.md` — новий файл, як працювати з Renovate-PR-ами щодня.

---

## 2026-04-25 (вечір) — друга хвиля + продуктова фіча

Запущено три паралельні child-сесії після оновлення статусів у [#733](https://github.com/Skords-01/Sergeant/pull/733), плюс одна продуктова фіча в чаті:

| PR                                                     | Що                                                                                    | Roadmap                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- | ---------------------- |
| [#737](https://github.com/Skords-01/Sergeant/pull/737) | `hotfix-prod-regression.md` + `add-monobank-event-handler.md` playbooks               | ai-coding §2 (✅ full) |
| [#738](https://github.com/Skords-01/Sergeant/pull/738) | Pino + `pino-http` middleware у `apps/server/src/obs/logger.ts`, regenerated licenses | #11                    |
| [#740](https://github.com/Skords-01/Sergeant/pull/740) | `size-limit` budget на `apps/web` + `Bundle size guard` CI step                       | #14                    |
| [#743](https://github.com/Skords-01/Sergeant/pull/743) | HubChat **Quick Actions v1** (chip-секція + action cards у чаті)                      | (продуктова фіча)      |

**Прогрес топ-15:** 9/15 → **11/15** (станом на вечір 2026-04-25; пізніше дотягнуто до 15/15 — див. живий журнал у `dev-stack-roadmap.md`).

**Bonus:**

- Vercel preview rate-limit лишається активний (free tier) — це неблокуюче, бо Smoke E2E запускається проти локально стартованого preview. _Резолвед пізніше через апгрейд на Vercel Pro._
- License policy CI крок один раз падав на #743 через регенерацію `THIRD_PARTY_LICENSES.md` у #738; merge-up закрив проблему.

**Що залишилось без credentials (станом на вечір 2026-04-25):**

- #3 Strict TypeScript (incremental, починаючи зі `strictNullChecks`). _Резолвед: див. Phase 4–5 у `dev-stack-roadmap.md` §3.1._
- #13 PostHog (free tier) — тепер легко завдяки структурованим логам з #11. _Резолвед: PostHog SDK залендено на всіх 3 клієнтах (env-gated)._
