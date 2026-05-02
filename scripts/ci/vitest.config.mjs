/**
 * @scaffolded
 * @owner @Skords-01
 * @nextStep Wire `pnpm vitest --config scripts/ci/vitest.config.mjs` into a
 *           dedicated job in `.github/workflows/ci.yml` so
 *           `pipeline-duration-p95.test.mjs` and
 *           `posthog-release-annotation.test.mjs` actually run on PRs.
 *           See AGENTS.md → Hard Rule #10.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.{js,mjs,ts}"],
    passWithNoTests: false,
  },
});
