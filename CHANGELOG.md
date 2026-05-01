# Changelog

> **Last validated:** 2026-05-01 by @Skords-01. **Next review:** 2026-07-30.
> **Status:** Active

Усі помітні зміни проєкту документуються тут.

Формат — [Keep a Changelog](https://keepachangelog.com/uk/1.1.0/),
версіювання — [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Автоматизація:** проєкт використовує Conventional Commits + commitlint.
> Наступний крок — підключити автоматичну генерацію changelog
> (наприклад, `changesets` або `conventional-changelog-cli`).

## [Unreleased]

### Fixed

- **Auth: «Помилка входу» без деталей при rate-limit / 5xx.** На сторінці
  входу після кількох невдалих спроб (або 500-серверної помилки) юзер
  бачив generic рядок `Помилка входу` замість осмисленого повідомлення.
  Корінь — два бекенд-респонси (`apps/server/src/http/errorHandler.ts`
  і `apps/server/src/http/rateLimit.ts`) повертали тільки поле `error`,
  тоді як Better Auth client (`better-fetch`) читає `message` при
  десеріалізації не-2xx body, тож на фронт приходило
  `result.error.message === undefined`. Тепер обидва респонси дублюють
  значення в полях `error` **та** `message` (back-compat). Паралельно
  переписав `translateAuthError` у `apps/web/src/core/auth/AuthContext.tsx`
  — тепер мапимо за стабільним Better Auth `error.code`
  (`INVALID_EMAIL_OR_PASSWORD`, `USER_ALREADY_EXISTS`, `RATE_LIMIT`,
  `INTERNAL`, …), а не парсимо англійський `message` regex-ами. Це
  заодно виправило фальш-збіг `/invalid email/i` усередині
  `"Invalid email or password"`, через який юзер з неправильним
  паролем бачив «Невірний формат email.».

### Added

- **CI: container image scan (Trivy).** Новий workflow
  `.github/workflows/container-scan.yml` збирає `Dockerfile.api` і
  сканує отриманий образ на CVE рівнів CRITICAL/HIGH; SARIF
  завантажується в GitHub Code Scanning (`category: trivy-image`) і
  доступний як артефакт. Тригери: PR (на зміни Dockerfile / serverside
  пакетів), push to main, schedule (04:00 UTC) і workflow_dispatch.
  Триаж — див. [`docs/security/container-scan.md`](./docs/security/container-scan.md).

### Changed

- **Web: strict TS rollout — Phase 2.** `apps/web/tsconfig.strict.json`
  розширено з `src/shared/**` до 10 директорій
  (`src/shared`, `src/test`, `src/core/{auth, cloudSync, components,
hints, hooks, observability, pricing, profile}`). Cross-file
  SpeechRecognition type-collision між `useSpeech.ts` та
  `VoiceMicButton.tsx` виправлено зняттям глобальної
  `declare global Window` augmentation на користь приватного
  `WindowWithSpeech` cast у `useSpeech.ts`. Жодних змін у runtime-коді,
  лише типи + один тестовий null-guard у
  `useCloudSync.behavior.test.ts`. Деталі — у
  [`docs/tech-debt/frontend.md`](./docs/tech-debt/frontend.md) §11.
