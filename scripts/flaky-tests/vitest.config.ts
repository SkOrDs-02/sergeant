/**
 * @scaffolded
 * @owner @Skords-01
 * @nextStep Wire `pnpm vitest --config scripts/flaky-tests/vitest.config.ts`
 *           into a dedicated job in `.github/workflows/ci.yml` so
 *           `aggregate.test.ts` (covers `aggregate.mjs`) actually runs on PRs.
 *           See AGENTS.md → Hard Rule #10.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ["aggregate.test.ts"],
  },
});
