import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: [
      // Subpath imports first (e.g. `@sergeant/shared/schemas`) so the bare
      // alias below does not greedy-match and produce paths like
      // `index.ts/schemas`. Each subpath maps to the matching folder index.
      {
        find: /^@sergeant\/shared\/(.+)$/,
        replacement: path.resolve(
          import.meta.dirname,
          "../../packages/shared/src/$1/index.ts",
        ),
      },
      {
        find: "@sergeant/shared",
        replacement: path.resolve(
          import.meta.dirname,
          "../../packages/shared/src/index.ts",
        ),
      },
    ],
  },
  esbuild: {
    // Skip tsconfig resolution that fails for @sergeant/shared
    // (its tsconfig extends @sergeant/config/tsconfig.base.json which
    // tsconfck can't resolve in the workspace without the symlink).
    tsconfigRaw: "{}",
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    passWithNoTests: true,
    // Testcontainers needs time for container startup + migrations.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Run integration tests sequentially — they share a single Postgres
    // container and truncate between suites. `poolOptions.forks.singleFork`
    // was removed in Vitest 4 in favour of top-level `maxWorkers`
    // (see https://vitest.dev/guide/migration#pool-rework).
    pool: "forks",
    maxWorkers: 1,
  },
});
