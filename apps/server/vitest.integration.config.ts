import { defineConfig } from "vitest/config";
import { existsSync } from "node:fs";
import path from "path";

const SHARED_SRC = path.resolve(
  import.meta.dirname,
  "../../packages/shared/src",
);

/**
 * Резолвер `@sergeant/shared` і його підпатів для інтеграційного прогону.
 *
 * Навіщо взагалі: інтеграційний прогін externalize-ить workspace-лінк і
 * віддає його Node-у, а той не вміє `.ts`. Юніт-конфіг цієї проблеми не має —
 * він `@sergeant/shared` не чіпає й резолвить через `exports`-мапу пакета.
 */
function sharedPackageResolver() {
  return {
    name: "sergeant-shared-resolver",
    // AI-DANGER: це саме ПЛАГІН, а не `resolve.alias`, і обидва випадки —
    // bare і підпат — обслуговує він один. Так вийшло не з естетики:
    // вбудований alias-плагін Vite відпрацьовує РАНІШЕ за будь-який
    // користувацький, навіть із `enforce: "pre"`. Тобто bare-аліас
    // `@sergeant/shared` перехопив би й підпати теж, зробивши
    // `…/src/index.ts/data/genericFoods` і `ENOTDIR` — перевірено на живому
    // прогоні. Повернеш сюди `resolve.alias` — повернеш і це.
    // `alias.customResolver` проблему вирішив би, але він deprecated і
    // зникне у Vite 9.
    enforce: "pre" as const,
    resolveId(source: string) {
      if (source === "@sergeant/shared") {
        return path.join(SHARED_SRC, "index.ts");
      }
      const subpath = /^@sergeant\/shared\/(.+)$/.exec(source)?.[1];
      if (!subpath) return null;
      // AI-DANGER: підпат буває ДВОХ форм, і припущення «завжди тека з
      // index.ts» тут уже коштувало червоного CI. `@sergeant/shared/schemas`
      // — тека, а `data/genericFoods`, `lib/pii`, `hubchat/toolNames` і
      // `schemas/nutrition` — файли. Симптом оманливий: підставляється шлях,
      // якого нема, ланцюжок докочується аж до Node, і той друкує «Cannot
      // find package '@sergeant/shared/data/genericFoods'» із ПОЧАТКОВИМ
      // специфікатором — рівно так, наче пакета не існує взагалі. Тому
      // пробуємо обидві форми, файл перший.
      const base = path.join(SHARED_SRC, subpath);
      for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
        if (existsSync(candidate)) return candidate;
      }
      // Нічого не підійшло — віддаємо резолв далі по ланцюжку, замість
      // того щоб мовчки вказати на неіснуючий файл.
      return null;
    },
  };
}

export default defineConfig({
  plugins: [sharedPackageResolver()],
  esbuild: {
    // Skip tsconfig resolution that fails for @sergeant/shared
    // (its tsconfig extends @sergeant/config/tsconfig.base.json which
    // tsconfck can't resolve in the workspace without the symlink).
    tsconfigRaw: "{}",
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts", "src/**/*.e2e.test.ts"],
    // The glob always matches committed suites; an empty run means the config
    // or checkout is broken — fail instead of green-lighting zero tests.
    passWithNoTests: false,
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
