import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = (
    env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3000"
  ).replace(/\/$/, "");

  // Opt-in via `ANALYZE=1 npm run build` so regular builds stay fast and we
  // don't litter dist/ with the report in CI.
  const analyze = env.ANALYZE === "1" || process.env.ANALYZE === "1";

  // `VITE_TARGET=capacitor` вмикає build-варіант для Capacitor-shell-а
  // (`apps/mobile-shell`): native WebView і без того ігнорує
  // `navigator.serviceWorker.register`, тому `vite-plugin-pwa`,
  // згенерований `sw.js` і `manifest.webmanifest` — dead weight у
  // shell-бандлі. Відключаємо плагін повністю, а `main.tsx` під
  // build-time прапором викидає динамічний `import("virtual:pwa-register")`
  // через DCE — щоб Rollup не намагався резолвити virtual-модуль, якого
  // тепер немає у graph-і. Веб-деплой (Vercel) продовжує білдитись як
  // раніше: без прапора плагін активний, PWA для браузерних юзерів
  // лишається.
  const isCapacitorBuild =
    env.VITE_TARGET === "capacitor" || process.env.VITE_TARGET === "capacitor";

  const buildId =
    env.VITE_BUILD_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.BUILD_ID ||
    String(Date.now());

  // L9 — Sentry release tag for the browser bundle. Vite only exposes env
  // vars prefixed `VITE_*`, so without this fallback the client SDK boots
  // with `release: undefined` whenever the deploy host (Vercel CI, mobile-shell
  // GH Actions, container scans) sets `*_GIT_COMMIT_SHA` but no one set the
  // explicit `VITE_SENTRY_RELEASE`. Cascade mirrors `apps/server/src/sentry.ts`
  // `resolveSentryRelease()` so server + client + source-map upload all share
  // the same release tag for incident triage. We override `process.env`
  // BEFORE the Sentry vite plugin reads it below — `define` would also work
  // but couples to vite's HMR substitution; the env-var path is portable.
  const sentryReleaseSha =
    env.VITE_SENTRY_RELEASE ||
    process.env.SENTRY_RELEASE ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    "";
  if (sentryReleaseSha && !process.env.VITE_SENTRY_RELEASE) {
    process.env.VITE_SENTRY_RELEASE = sentryReleaseSha;
  }
  const outDir =
    env.VITE_BUILD_OUT_DIR ||
    (process.env.VERCEL === "1" ? "dist" : "../server/dist");

  return {
    define: {
      // Пробрасуємо значення у клієнтський бандл як статичний літерал,
      // щоб `main.tsx` міг DCE-вирізати SW-гілку у capacitor-білді.
      "import.meta.env.VITE_TARGET": JSON.stringify(
        isCapacitorBuild ? "capacitor" : "web",
      ),
      // BuildId доступний (1) у Service Worker через `apps/web/src/sw/version.ts`,
      // (2) у головному бандлі через persister React Query
      // (`apps/web/src/shared/lib/api/queryClientPersister.ts` як `buster`)
      // — щоб новий деплой автоматично інвалідовував старий IDB-snapshot,
      // інакше при changed response-shape (Hard Rule #3) кеш на диску
      // ламає UI до наступного revalidate. PR-28 (stack-pulse 2026-05 / L1)
      // переніс це з legacy ambient `__SW_BUILD_ID__` / `__APP_BUILD_ID__`
      // глобалів на стандартний Vite `import.meta.env.VITE_*` pattern,
      // типізований через `apps/web/src/vite-env.d.ts`.
      "import.meta.env.VITE_BUILD_ID": JSON.stringify(buildId),
    },
    plugins: [
      tailwindcss(),
      react(),
      !isCapacitorBuild &&
        VitePWA({
          strategies: "injectManifest",
          srcDir: "src",
          filename: "sw.js",
          registerType: "prompt",
          includeAssets: [
            "icon.svg",
            "icon-192.png",
            "icon-512.png",
            "apple-touch-icon.png",
          ],
          manifest: {
            name: "Sergeant — Твій персональний хаб життя",
            short_name: "Sergeant",
            description:
              "Персональний хаб: фінанси, спорт, звички та харчування",
            start_url: "/",
            display: "standalone",
            orientation: "portrait",
            background_color: "#fdf9f3",
            theme_color: "#fdf9f3",
            lang: "uk",
            shortcuts: [
              {
                name: "Додати витрату",
                short_name: "Витрата",
                description: "Швидко додати нову витрату у Фінік",
                url: "/?module=finyk&action=add_expense",
                icons: [
                  { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
                ],
              },
              {
                name: "Розпочати тренування",
                short_name: "Тренування",
                description: "Розпочати нове тренування у Фізрук",
                url: "/?module=fizruk&action=start_workout",
                icons: [
                  { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
                ],
              },
              {
                name: "Додати прийом їжі",
                short_name: "Їжа",
                description: "Записати прийом їжі у Харчування",
                url: "/?module=nutrition&action=add_meal",
                icons: [
                  { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
                ],
              },
            ],
            icons: [
              {
                src: "/icon-192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any",
              },
              {
                src: "/icon-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any maskable",
              },
              {
                src: "/icon.svg",
                sizes: "any",
                type: "image/svg+xml",
                purpose: "any",
              },
            ],
          },
          injectManifest: {
            globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          },
        }),
      analyze &&
        visualizer({
          filename: "dist/bundle-report.html",
          template: "treemap",
          gzipSize: true,
          brotliSize: true,
          open: false,
        }),
      // Sentry sourcemap upload + release management. Має бути
      // ОСТАННІМ плагіном — інакше пропустить трансформи інших
      // плагінів. Без `SENTRY_AUTH_TOKEN` (локальні білди, форки,
      // PR-и без секретів) плагін мовчить (`disable: true`) і не
      // ламає білд. Release береться з `VERCEL_GIT_COMMIT_SHA` /
      // `GITHUB_SHA` — той самий, що `VITE_SENTRY_RELEASE` у
      // `core/observability/sentry.ts`, тож issues корелюються
      // 1:1 з deploy-ем. Map-файли видаляються після успішного
      // upload-у, щоб не серватись публічно (Vercel `assets/` має
      // `Cache-Control: immutable`).
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        release: {
          // Reuse the same release we just bound to `VITE_SENTRY_RELEASE` —
          // mismatched source-map upload tag and runtime tag make Sentry
          // de-symbolicate against the wrong artifact set.
          name: sentryReleaseSha || undefined,
        },
        sourcemaps: {
          filesToDeleteAfterUpload: ["**/*.js.map", "**/*.mjs.map"],
        },
        disable: !process.env.SENTRY_AUTH_TOKEN,
        telemetry: false,
      }),
    ].filter(Boolean),
    build: {
      outDir,
      emptyOutDir: true,
      // "hidden" = `.map` files генеруються (плагін їх вантажить у Sentry),
      // але JS не містить `//# sourceMappingURL=...` — тож реальні
      // сорси не доступні через DevTools у проді. Sentry все одно
      // лінкає maps через debug-id, який плагін інжектить у бандл.
      sourcemap: "hidden",
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id) return;
            if (id.includes("node_modules")) {
              if (
                id.includes("/node_modules/react/") ||
                id.includes("/node_modules/react-dom/")
              )
                return "vendor-react";
              if (id.includes("/node_modules/scheduler/"))
                return "vendor-react";
              if (id.includes("/node_modules/react-is/")) return "vendor-react";
              if (id.includes("/node_modules/use-sync-external-store/"))
                return "vendor-react";
              if (id.includes("react-router")) return "vendor-router";
              if (id.includes("react-virtuoso")) return "vendor-virtuoso";
              if (id.includes("@zxing")) return "vendor-zxing";
              // `react-markdown` тягне за собою стек remark/mdast/hast
              // (~150 KB у source-graph: `mdast-util-to-hast`,
              // `micromark*`, `hast-util-*`, `property-information`,
              // `unified`, `vfile`, `unist-util-*`, `decode-named-character-reference`,
              // `character-entities*`, `space-separated-tokens`,
              // `comma-separated-tokens`, `style-to-js`, `devlop`,
              // `bail`, `is-plain-obj`, `trough`, `zwitch`,
              // `ccount`, `escape-string-regexp`, `markdown-table`,
              // `mdast-util-find-and-replace`, `mdast-util-from-markdown`,
              // `mdast-util-to-string`). Сам `react-markdown` зустрічається
              // лише у HubChat-у (async chunk), тож увесь цей граф має
              // переїхати у `vendor-markdown` разом із ним — інакше Rollup
              // лишить транзитиви у головному `vendor`-у, який жадібно
              // вантажиться на старті (саме це підіймає `vendor` >500 KB
              // у docs/audits/2026-05-07-full-app-regression-ux-audit.md
              // item 9).
              if (
                id.includes("react-markdown") ||
                id.includes("/node_modules/remark-") ||
                id.includes("/node_modules/rehype-") ||
                id.includes("/node_modules/mdast-") ||
                id.includes("/node_modules/hast-") ||
                id.includes("/node_modules/micromark") ||
                id.includes("/node_modules/unist-util-") ||
                id.includes("/node_modules/property-information/") ||
                id.includes("/node_modules/unified/") ||
                id.includes("/node_modules/vfile") ||
                id.includes(
                  "/node_modules/decode-named-character-reference/",
                ) ||
                id.includes("/node_modules/character-entities") ||
                id.includes("/node_modules/space-separated-tokens/") ||
                id.includes("/node_modules/comma-separated-tokens/") ||
                id.includes("/node_modules/style-to-js/") ||
                id.includes("/node_modules/style-to-object/") ||
                id.includes("/node_modules/inline-style-parser/") ||
                id.includes("/node_modules/devlop/") ||
                id.includes("/node_modules/bail/") ||
                id.includes("/node_modules/is-plain-obj/") ||
                id.includes("/node_modules/trough/") ||
                id.includes("/node_modules/zwitch/") ||
                id.includes("/node_modules/ccount/") ||
                id.includes("/node_modules/escape-string-regexp/") ||
                id.includes("/node_modules/markdown-table/") ||
                id.includes("/node_modules/longest-streak/") ||
                id.includes("/node_modules/parse-entities/") ||
                id.includes("/node_modules/html-void-elements/") ||
                id.includes("/node_modules/web-namespaces/") ||
                id.includes("/node_modules/@ungap/structured-clone/")
              )
                return "vendor-markdown";
              // React Query + persist-client (~40 KB gzip). Використовується
              // у багатьох async chunk-ах, але стек великий — окремий
              // chunk дозволяє кешувати його між deploy-ами незалежно
              // від інших vendor-deps.
              if (id.includes("/node_modules/@tanstack/"))
                return "vendor-react-query";
              // Better Auth client (`better-auth`, `@better-auth`,
              // `@better-fetch/fetch`, `better-call`, `nanostores`,
              // `defu`) живе тільки у клієнтській auth-логіці. Сам
              // `AuthPage` async, але `apps/web/src/shared/lib/api`
              // підтягує `better-auth/client` синхронно, тож цей
              // chunk все одно eager — але окремий від загального
              // vendor-у, щоб deploy-и аутентифікаційних змін не
              // інвалідували весь `vendor`.
              if (
                id.includes("/node_modules/better-auth/") ||
                id.includes("/node_modules/@better-auth/") ||
                id.includes("/node_modules/@better-fetch/") ||
                id.includes("/node_modules/better-call/") ||
                id.includes("/node_modules/nanostores/") ||
                id.includes("/node_modules/defu/")
              )
                return "vendor-auth";
              // `zod` + `@hookform/resolvers/zod` (~12 KB gzip). Schema-
              // валідатори тягнуться у багатьох async chunk-ах
              // (auth, profile, finyk, fizruk, settings) — окремий
              // chunk dedupe-ить байт-у-байт між ними і не роздуває
              // загальний vendor.
              if (
                id.includes("/node_modules/zod/") ||
                id.includes("/node_modules/@hookform/")
              )
                return "vendor-zod";
              // Capacitor runtime + native плагіни (ML Kit / community
              // barcode scanner, @capacitor/preferences для bearer-storage,
              // @capacitor/status-bar, /splash-screen, /keyboard, /app)
              // свідомо НЕ мапляться на жоден manual chunk: це дозволяє
              // Rollup злити їх у ті самі async chunk-и, з яких вони
              // єдино імпортуються через dynamic `import()` —
              // `@sergeant/mobile-shell/barcodeNative` (→
              // `useBarcodeScanner`), `@sergeant/mobile-shell/auth-storage`
              // (→ `apps/web/src/shared/lib/api/bearerToken.ts`) і
              // `@sergeant/mobile-shell` (→ `main.tsx` під guard-ом
              // `isCapacitor()`). Без цього catch-all нижче загнав би
              // Capacitor-код у загальний `vendor`, який жадібно
              // підвантажується браузерами.
              if (
                id.includes("/node_modules/@capacitor/") ||
                id.includes("/node_modules/@capacitor-mlkit/") ||
                id.includes("/node_modules/@capacitor-community/")
              ) {
                return undefined;
              }
              // Ізольований chunk для Sentry, щоб SDK (~30–40 KB gzip) не
              // потрапляв у загальний `vendor`, який шериться між eager-
              // імпортами main bundle. Див. правило 2.3 у
              // `.agents/skills/sergeant-web-ui/SKILL.md`.
              if (id.includes("@sentry")) return "vendor-sentry";
              // Те саме міркування для `web-vitals` — пакет малий (~1 KB
              // gzip), але імпортується через dynamic `import()` після
              // `requestIdleCallback`, тож не повинен тягнутись у main.
              if (id.includes("/node_modules/web-vitals/"))
                return "vendor-web-vitals";
              // Ізольований chunk для sqlite-wasm + drizzle-orm —
              // PR #015 storage roadmap. Пакет важкий (~700 KB brotli
              // разом із .wasm) і потрібен лише фічам, які явно
              // звертаються до клієнтської БД через `getSqliteDb()`.
              // Без цього catch-all нижче загнав би його у головний
              // `vendor`, який жадібно тягнеться головним bundle-ом
              // (а sqlite-wasm зростив би його в 2× понад ліміт).
              if (
                id.includes("/node_modules/@sqlite.org/sqlite-wasm/") ||
                id.includes("/node_modules/drizzle-orm/")
              )
                return "vendor-sqlite";
              return "vendor";
            }
          },
        },
      },
    },
    server: {
      host: true,
      allowedHosts: true,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        "@sergeant/shared": resolve(
          __dirname,
          "../../packages/shared/src/index.ts",
        ),
        "@sergeant/api-client/react": resolve(
          __dirname,
          "../../packages/api-client/src/react/index.ts",
        ),
        "@sergeant/api-client": resolve(
          __dirname,
          "../../packages/api-client/src/index.ts",
        ),
        "@shared": resolve(__dirname, "src/shared"),
        "@finyk": resolve(__dirname, "src/modules/finyk"),
        "@fizruk": resolve(__dirname, "src/modules/fizruk"),
        "@routine": resolve(__dirname, "src/modules/routine"),
        "@nutrition": resolve(__dirname, "src/modules/nutrition"),
      },
    },
    test: {
      environmentMatchGlobs: [
        ["server/**", "node"],
        ["src/**", "jsdom"],
      ],
    },
  };
});
