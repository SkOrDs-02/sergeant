# ADR-0082: Репозиторій як приватний склад — зняття release/distribution та solo-overhead автоматизації

- **Status:** Accepted
- **Last validated:** 2026-07-30 by @SkOrDs-02. **Next review:** 2026-10-28.
- **Date:** 2026-07-30
- **Reviewers:** @SkOrDs-02
- **Supersedes:** ADR-0034, ADR-0069
- **Related:**
  - [ADR-0081](./0081-repository-simplification.md) — попередній крок спрощення (committed indexes, entropy-wrapper, visual-taste ESLint).
  - [ADR-0072](./0072-harness-versioning.md) — harness versioning лишається; прибрано лише A/B eval workflow.
  - [ADR-0044](./0044-renovate-vs-dependabot.md) — розподіл ролей Renovate/Dependabot; auto-merge шар прибрано.
  - [`AGENTS.md`](../../../AGENTS.md) — оновлена verification-матриця.

## Контекст

Продукт не розповсюджується як публічний артефакт: у GitHub немає жодного релізу чи тегу, форків і зовнішніх контриб'юторів немає, а сам продукт користувач споживає з задеплоєного середовища (Vercel + Coolify), не з GitHub. Репозиторій виконує рівно дві функції — сховище коду та контроль версій.

Попри це, репо несло повний шар «публічного OSS-проєкту»: SBOM + SLSA provenance, щотижневий release-cut, license-політику для дистрибуції, vulnerability-disclosure policy, CODEOWNERS з bus-factor-контрактом на одну людину, PR-size гейти та AI-checklist guard для рев'юера, якого не існує. Плюс набір крон-workflow-ів, що або перевіряли самі себе, або посилалися на неіснуючі ресурси.

Аудит виявив конкретні мертві ланки: `harness-a-b.yml` щонеділі ганяв матрицю проти гілки `experimental/loop-detect`, якої немає в origin; `rag-quality-gate.yml` тижнево запускав eval у mock-режимі як sanity-check самої gate-машинерії; `visual-regression.yml` лишався `workflow_dispatch`-only з непідтвердженим Argos-базлайном.

## Рішення

1. **Release/distribution шар прибираємо повністю.** SBOM/SLSA provenance, changelog auto-cut, `CHANGELOG.md`, `THIRD_PARTY_LICENSES.md` + license-policy гейт і `SECURITY.md` існували для споживачів артефакту. Споживачів немає — Git history і є changelog.
2. **PostHog release-annotation прибираємо.** Workflow постив анотацію через окремий `POSTHOG_PERSONAL_API_KEY`. Продуктова аналітика (`POSTHOG_API_KEY` / `POSTHOG_PROJECT_API_KEY`, `apps/server/src/lib/posthog.ts`, `apps/web` init) працює незалежно і не зачіпається.
3. **Рев'юер-орієнтовані гейти прибираємо.** `pr-size`, `ai-pr-checklist`, `security-sla-reminder`, CODEOWNERS + coverage-гейт і `dependabot-automerge` мають сенс лише за наявності другої людини в петлі. AI-checklist окремо: він валідував наявність текстових чекбоксів у тілі PR, тобто агент, який писав код, сам собі ставив галочки — це підпис, а не перевірка.
4. **Мертві та самоперевірні крони прибираємо:** `harness-a-b` (неіснуюча гілка), `rag-quality-gate` (mock-режим), `visual-regression` (немає базлайну), `mutation-testing`, `typescript-next`, `shell-tax-report`, `flaky-tests-dashboard`.
5. **Крони прибираємо там, де є PR-тригер.** `docs-freshness`, `skill-freshness`, `ai-legacy-scan` і `detox-android` лишаються як PR-гейти без календарного дублювання.
6. **`LICENSE` (MIT) лишається.** Репо наразі публічне; видалення ліцензії змінює правовий статус коду, а не обсяг автоматизації — це окреме рішення.
7. **Захист продакшену не чіпаємо.** `ci.yml`, `contract-tests`, `deploy-api`, `post-deploy-smoke`, `db-backup-verify`, `container-scan`, `codeql`, `nightly-audit`, `lint:secrets` і Husky-хуки лишаються: вони захищають працююче середовище, а не репутацію репозиторію.
8. **`pr-backlinks` лишається.** Ledger живить `docs/status.md` через `scripts/docs/generate-status.mjs`, тобто має читача. Hard Rule #26 чинне.

## Наслідки

- 15 workflow-файлів і 5 скриптів прибрано; 4 крони знято з розкладу.
- `pnpm licenses:check`, `pnpm licenses:gen`, `pnpm changelog:cut`, `pnpm lint:codeowners` більше не існують — прибрані з `package.json`, `ci.yml`, `CONTRIBUTING.md` і `plopfile.mjs`.
- Гілка `main` втрачає CODEOWNERS-based required review. Якщо branch protection посилався на нього — правило треба зняти в налаштуваннях репо вручну.
- ADR-0034 (visual regression) і ADR-0069 (AI-PR checklist) стають superseded: механізми прибрано.
- Ліцензійна відповідність більше не перевіряється механічно. Це прийнятно, доки код не розповсюджується; при поверненні до дистрибуції гейт треба відновити разом з `THIRD_PARTY_LICENSES.md`.
- Якщо репо перемкнуть у private, окремо доведеться переглянути `codeql.yml` (потребує GitHub Advanced Security) і `storybook-deploy.yml` (Pages з private repo потребує платного плану).

## Amendment (2026-08-02) — `mutation-testing` відновлено

Пункт 4 рішення згрупував `mutation-testing` разом із `harness-a-b`, `rag-quality-gate`,
`visual-regression` під одним ярликом «мертві та самоперевірні крони», але на відміну
від тих трьох (конкретно підтверджена непрацездатність — неіснуюча гілка, mock-режим,
відсутній базлайн) для `mutation-testing` жодної окремої непрацездатності не було
знайдено: `packages/shared/stryker.utils.conf.json` і
`apps/server/stryker.normalizers.conf.json` (+ `mutation:utils` / `mutation:normalizers`
у відповідних `package.json`) лишились робочими — прибрали лише
`.github/workflows/mutation-testing.yml`, тобто планувальник, а не інструмент.

На прямий запит founder-а 2026-08-02 workflow відновлено 1:1 з видаленої версії
(той самий weekly cron `0 6 * * 1` + `workflow_dispatch`, ті самі SHA-pinned actions).
Рішення №4 лишається чинним для решти шести (`harness-a-b`, `rag-quality-gate`,
`visual-regression`, `typescript-next`, `shell-tax-report`, `flaky-tests-dashboard`) —
вони не відновлюються цим amendment-ом.
