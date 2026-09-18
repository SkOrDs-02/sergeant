/**
 * Centralized environment configuration with validation and defaults.
 *
 * Single source of truth: `apps/server/src/env/env.ts` (Zod schema +
 * `assertStartupEnv()`). Цей файл — тонкий backward-compat re-export, щоб
 * усі існуючі `import { env } from "../env.js"` callsite-и продовжували
 * працювати без масової міграції імпортів.
 *
 * Не додавай тут нових env-варів — вноси у `env/env.ts`. CI-гард
 * `scripts/check-env-single-source.mjs` блокує `process.env`-доступи поза
 * `env/env.ts` (з вузькими винятками для `env/betterAuthEnv.ts`,
 * lifecycle-bootstrap-файлів і `scripts/`).
 *
 * Див. `docs/initiatives/stack-pulse-2026-05/pr-01-unify-env-modules.md` —
 * PR-01 (Critical / C1) завершено цим re-export-ом + Zod-уніфікацією.
 */

export { env, assertStartupEnv } from "./env/env.js";
export type { Env } from "./env/env.js";
