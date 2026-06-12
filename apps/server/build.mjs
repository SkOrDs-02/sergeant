import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("esbuild").BuildOptions} */
const base = {
  platform: "node",
  format: "esm",
  target: "node20",
  bundle: true,
  sourcemap: true,
  logLevel: "info",
  // Express server is deployed as a single container entrypoint; keeping
  // the bundle self-contained avoids Node ESM ".js extension" pitfalls in
  // internal workspace packages (e.g. @sergeant/shared).
  packages: "bundle",
  // `pg` (and other native deps) use CJS `require()` for Node built-ins
  // like `events`, `net`, `tls`, etc. When esbuild emits ESM, the
  // generated `__require` shim throws "Dynamic require of … is not
  // supported" for built-ins. Injecting `createRequire` restores a real
  // `require` function that Node can resolve.
  banner: {
    js: 'import{createRequire}from"module";const require=createRequire(import.meta.url);',
  },
  // NOTE: workspace-пакети (@sergeant/*) МАЮТЬ бандлитись — НЕ додавай їх в
  // `external`. Runtime-образ (Dockerfile.api deps-stage) копіює лише їхні
  // package.json без сорсів, тож зовнішній import "@sergeant/…" у
  // dist-server/*.js валить контейнер ERR_MODULE_NOT_FOUND ще на pre-deploy
  // migrate. Саме це поклало всі деплої 2026-06-05…06-12 (прод застряг на
  // образі від 05-23), коли сюди додали `external: ["@sergeant/*"]`.
};

await build({
  ...base,
  entryPoints: ["src/index.ts"],
  outfile: "dist-server/index.js",
  // Railway logs don't need minified stacks; keep readable output.
  minify: false,
  legalComments: "none",
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "production",
    ),
  },
});

await build({
  ...base,
  entryPoints: ["migrate.mjs"],
  outfile: "dist-server/migrate.js",
  minify: false,
  legalComments: "none",
});

// `runPendingSqlMigrations` resolves `migrationsDir` as
// `path.join(__dirname, "migrations")`, де `__dirname` після bundling — це
// `dist-server/`. esbuild не копіює нон-JS ассети сам, тому без цього кроку
// `fs.readdir` на проді падав у ENOENT і runner мовчки no-op-ив (повертав
// `migrate_ok` для порожнього списку файлів). Копіюємо `src/migrations` у
// `dist-server/migrations`, щоб і runtime-старт, і Pre-Deploy job бачили
// усі pending SQL-файли.
const srcMigrations = path.join(__dirname, "src", "migrations");
const distMigrations = path.join(__dirname, "dist-server", "migrations");
await fs.rm(distMigrations, { recursive: true, force: true });
await fs.cp(srcMigrations, distMigrations, { recursive: true });
