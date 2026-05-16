import { build } from "esbuild";

/**
 * esbuild bundle для openclaw runtime.
 *
 * Чому bundle, а не plain `tsc`:
 *   - `tools/openclaw/src/obs/sentry.ts` імпортує `@sergeant/shared/lib/pii`,
 *     який експортується з shared як `./src/lib/pii.ts` (без `dist/`-build-у).
 *   - `tsc` транспілить лише локальні файли openclaw → у `dist/` лежить
 *     `import { ... } from "@sergeant/shared/lib/pii"`, а Node у distroless
 *     runtime не вміє завантажувати `.ts` напряму (`tsx` як loader тут
 *     відсутній). До bundle-у деплой падав на cold-start-і з
 *     `ERR_MODULE_NOT_FOUND`.
 *   - Те саме рішення вже застосоване для `apps/server` (див.
 *     `apps/server/build.mjs`) — `packages: "bundle"` втягує workspace-
 *     пакети у самодостатній `dist/index.js`.
 *
 * Output: `dist/index.js` (ESM, Node 20+). Runtime у Dockerfile.console
 * залишається distroless — він виконує `node dist/index.js` без
 * додаткового resolver-а.
 */

/** @type {import("esbuild").BuildOptions} */
const base = {
  platform: "node",
  format: "esm",
  target: "node20",
  bundle: true,
  sourcemap: true,
  logLevel: "info",
  // OpenClaw deploy-ається як єдиний container entrypoint; bundle-имо все
  // (workspace + third-party deps) щоб уникнути runtime-resolution issues
  // з NodeNext + `.ts`-exports у workspace-пакетах (передусім
  // `@sergeant/shared/lib/pii`).
  packages: "bundle",
  // Eкосистема grammy / @anthropic-ai/sdk / dotenv ESM-нативна, але деякі
  // транзитивні залежності використовують CJS `require()` для Node
  // builtins. Інжектимо `createRequire`, щоб emit-ed ESM міг резолвити
  // `require("net")` / `require("crypto")` etc.
  banner: {
    js: 'import{createRequire}from"module";const require=createRequire(import.meta.url);',
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "production",
    ),
  },
};

await build({
  ...base,
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  minify: false,
  legalComments: "none",
});
