# ADR-0101: GitHub знову основний хост коду, CI повертається

- **Status:** Accepted
- **Date:** 2026-09-29
- **Last validated:** 2026-09-29
- **Next review:** 2026-12-29
- **Deciders:** @Skords-01
- **Supersedes:** — (частково скасовує рішення про хостинг на Bitbucket від 2026-09-23, яке не оформлювалось окремим ADR; див. Context)
- **Related:**
  - [Аудит docs/governance, DG-1 і DG-6](../../work/specs/audits/2026-09-23-docs-governance-audit.md)
  - [Аудит мертвих GitHub-remote](../../work/specs/audits/2026-09-23-dead-github-remotes.md)
  - [ADR-0074](./0074-hosting-hetzner-coolify.md) (бекенд на Hetzner/Coolify)
  - [ADR-0082](./0082-private-storage-repo-posture.md) (склад воркфлоу, що лишились)
  - [`AGENTS.md` § Де живе код](../../../AGENTS.md#де-живе-код)

---

## Context and Problem Statement

2026-09-23 код переїхав на Bitbucket (`skords01/sergeant`), бо акаунти GitHub були заблоковані. Рішення жило лише в `AGENTS.md` і аудитах, окремого ADR не мало (DG-6). Наслідки: у репо не лишилось CI, `.github/workflows/*` стали архівом, Hard Rules #5, #6, #10, #15 та інші отримали позначки `SUSPENDED` у `hard-rules.json`, бюджети продуктивності й 44px-аудит стали ручними перевірками (DG-1, DG-12), а `pre-push` хук і рецепт створення PR прив'язались до Bitbucket API.

2026-09-29 блокування GitHub знято: репо `https://github.com/SkOrDs-02/sergeant` знову приймає пуші і PR (PR #1220 змерджено, далі #1221 `claude/github-merge-back` повернув у GitHub-гілку роботу, що накопичилась на Bitbucket). Причина переїзду зникла.

## Considered Options

1. **GitHub основний, Bitbucket дзеркало, CI (GitHub Actions) повертається як гейт PR.**
2. **Лишити Bitbucket основним** і будувати заміну CI (Bitbucket Pipelines) — аудит DG-1 залишав це відкритим.
3. **Два рівноправні хости** — відкинуто: два джерела істини для PR і гейтів.

## Decision

1. **GitHub (`SkOrDs-02/sergeant`) — основний хост коду.** `origin` = GitHub. PR створюються і мерджаться на GitHub (`gh` CLI або MCP GitHub).
2. **Bitbucket (`skords01/sergeant`) стає дзеркалом**: резервна копія і, доки власник не вирішить інакше, джерело збірки бекенду в Coolify. Нових PR там не ведемо.
3. **CI повертається.** Воркфлоу в `.github/workflows/` (передусім `ci.yml`) знову є гейтом PR. Гейти, які ми в 2026-09-23 переносили в `pnpm lint` і Husky (`lint-migrations`, `check-hard-rules-registry`, `check-governance-sync`), лишаються там же: це дешевше і ловить раніше, дублювання з CI прийнятне.
4. **Записи `SUSPENDED` у `hard-rules.json` повертаються на CI-джоби** там, де відповідний крок є у воркфлоу (Hard Rule #5, #10). Записи без кроку у воркфлоу лишаються `SUSPENDED` з уточненою причиною; їх треба закрити окремо.
5. **Не змінюється:** прод не оновлюється сам (`pnpm deploy:status` / `deploy:api` / `deploy:web`), міграції в ENTRYPOINT, Vercel без Git-інтеграції, заборона видаляти remote `oldgh` і `deadgh-zaebal` (там лежать refs, яких немає більше ніде).

## Rationale

Bitbucket без pipelines залишав PR і `main` без жодного автоматичного гейту; заміна CI коштувала б переписування ~35 воркфлоу, більшість з яких залежить від GitHub-екосистеми (`gh`, `GITHUB_TOKEN`, code scanning, pr-backlinks). Повернення на GitHub відновлює все це без роботи.

## Consequences

### Positive

- Гейти PR знову автоматичні; Hard Rules #5 і #10 мають CI-enforcement.
- Реєстр PR (Hard Rule #26) знову живиться воркфлоу `pr-backlinks.yml`, а не пуш-хуком.
- `gh` CLI знову працює; рецепт PowerShell + `BITBUCKET_TOKEN` більше не основний шлях.

### Negative

- Ризик повторного блокування GitHub лишається; дзеркало на Bitbucket і Hetzner мінімізує втрату коду, але не CI.
- Воркфлоу пролежали невиконаними з 2026-09-23: зелений стан кожного джоба не гарантований і не стверджується цим ADR.

### Neutral

- Джерело збірки бекенду (Coolify → Bitbucket) цим ADR не змінюється.

## Compliance

- Гейти PR: `.github/workflows/ci.yml` та суміжні воркфлоу; локально `pnpm check`.
- Hard Rules: `node scripts/check-hard-rules-registry.mjs` (у `pnpm lint`).
- Відкриті наслідки й follow-up-и — у секції «Стан виправлень» аудиту DG.

## Links

- [Аудит DG, §11 і рішення DG-1/DG-6](../../work/specs/audits/2026-09-23-docs-governance-audit.md)
- [Аудит мертвих GitHub-remote, статус](../../work/specs/audits/2026-09-23-dead-github-remotes.md)
