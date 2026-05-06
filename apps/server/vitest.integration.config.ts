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
    include: ["src/**/*.integration.test.ts", "src/**/*.e2e.test.ts"],
    passWithNoTests: true,
    // Testcontainers needs time for container startup + migrations.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Each integration test file boots its own Testcontainers Postgres
    // and patches `process.env.DATABASE_URL` for the run. Different files
    // therefore need different process contexts, otherwise the
    // module-level pool in `apps/server/src/db.ts` (which captures
    // `DATABASE_URL` at load time) sticks to whichever container booted
    // first and the second test file sees `ECONNREFUSED` after the first
    // file's `afterAll` stops its container. Forks pool gives one worker
    // per file out of the box; we explicitly disable single-fork so each
    // file gets its own.
    pool: "forks",
    isolate: true,
  },
});
