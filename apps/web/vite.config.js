import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// `apps/web/package.json` has `"type": "module"`, so the CJS `__dirname`
// global isn't available. Vite itself shims it at runtime, but static
// loaders (knip, ts-morph, etc.) evaluate this file as plain ESM and
// blow up. Derive the directory from `import.meta.url` so the config is
// portable across both worlds.
const __dirname = dirname(fileURLToPath(import.meta.url));

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
    // Прод (Vercel) шле COOP/COEP (apps/web/vercel.json), що вмикає
    // SharedArrayBuffer → sqlite-wasm працює на OPFS VFS. `vite preview`
    // (smoke E2E lane + локальний Lighthouse) без цих заголовків падав на
    // memory-only VFS: SQLite-читання відставали від оптимістичного
    // state, і routine/nutrition CRUD-стан осцилював (CI critical-lane
    // аудит 2026-08-04 — постійні detach-и в deep-module-crud). Паритет
    // заголовків прибирає розбіжність smoke ↔ prod. API-фетчі на :3000
    // під COEP легальні — вони йдуть через CORS (ALLOWED_ORIGINS).
    preview: {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
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
      // Beta kill switches for the commerce and legal surfaces
      // (`src/core/lib/betaSurfaces.ts`). Injected as literals for the same
      // reason as `VITE_TARGET` above: an unset `VITE_*` is only substituted
      // at RUNTIME from the injected env object, so the comparison never
      // folds and Rollup keeps the gated `import()` — measured 2026-08-08,
      // `PricingPage`/`LegalPage` were still emitted and, worse, still listed
      // in the service-worker precache manifest, i.e. every beta user
      // downloaded a tariffs page they cannot open and can read in devtools.
      // As explicit literals the branch is statically dead and the chunks go.
      "import.meta.env.VITE_ENABLE_COMMERCE": JSON.stringify(
        env.VITE_ENABLE_COMMERCE ?? process.env.VITE_ENABLE_COMMERCE ?? "",
      ),
      "import.meta.env.VITE_ENABLE_LEGAL": JSON.stringify(
        env.VITE_ENABLE_LEGAL ?? process.env.VITE_ENABLE_LEGAL ?? "",
      ),
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
            "icon-monochrome.svg",
            "icon-192.png",
            "icon-512.png",
            "apple-touch-icon.png",
          ],
          manifest: {
            // Stable identity so the OS treats every launch surface (icon,
            // shortcut, share target) as the same installed app rather than
            // minting separate instances.
            id: "/",
            name: "Sergeant · Твій персональний хаб життя",
            short_name: "Sergeant",
            description:
              "Персональний хаб: фінанси, спорт, звички та харчування",
            start_url: "/",
            display: "standalone",
            orientation: "portrait",
            // Static manifest colors can't follow the in-app theme choice
            // (that's `useTheme.ts` applyResolvedTheme's job at runtime) —
            // these are the splash/OS-chrome default and must track the
            // light `--c-bg` in `src/styles/theme.css` (`:root`), #ecebe7.
            background_color: "#ecebe7",
            theme_color: "#ecebe7",
            lang: "uk",
            // UX-7: tapping an icon/shortcut while the PWA is already open
            // focuses the running window instead of spawning a duplicate
            // instance. Deep-link params (`?module=…&action=…`) are read by
            // the in-app router, so navigate-existing keeps a single window.
            launch_handler: {
              client_mode: ["focus-existing", "navigate-existing", "auto"],
            },
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
              // V-5: Android 13+ themed icon. Single-tone, transparent
              // background — the launcher tints it with the system palette so
              // the home-screen icon matches the user's wallpaper/theme.
              {
                src: "/icon-monochrome.svg",
                sizes: "any",
                type: "image/svg+xml",
                purpose: "monochrome",
              },
            ],
          },
          injectManifest: {
            // Explicit allowlist by extension — keeps the precache from
            // pulling stray binary blobs (sourcemaps, .map.gz, .br) and
            // sidecar files into the SW. Paired with the build-time
            // gate `scripts/check-pwa-precache-1st-party.mjs` (PR-38 /
            // L11) which fails CI if any non-1st-party URL still ends
            // up in the manifest (e.g. a Vite plugin inlines a CDN
            // asset into `dist/`).
            //
            // AI-DANGER: `wasm` мусить лишатися в цьому списку разом із
            // `js`. Прибереш його — повернеш SERGEANT-API-M /
            // SERGEANT-WEB-R (~25 користувачів за бету).
            //
            // Чому пара нероздільна. `js` затягує в прекеш glue-чанк
            // sqlite-wasm, а той обчислює адресу свого бінарника як
            // `new URL("sqlite3.wasm", import.meta.url)` — тобто
            // `/assets/sqlite3-<hash>.wasm` того ж білда. Поки `wasm` був
            // поза прекешем, виходила асиметрія: glue віддавався з кешу
            // старого деплою, а його бінарник щоразу йшов у мережу. На
            // проді там уже новий деплой, старого хеша немає — і замість
            // файлу приїжджав HTML (див. `assets/` у виключеннях rewrite
            // у `vercel.json`). Emscripten валив обидва шляхи —
            // streaming і ArrayBuffer — і кидав
            // «both async and sync fetching of the wasm failed».
            //
            // Реліз-цикл тут `registerType: "prompt"` без
            // `skipWaiting` (свідомо — див. AI-DANGER у `src/sw.ts`), тож
            // клієнт може сидіти на старому воркері днями, і кожен його
            // старт мовчки з'їжджав на LocalStorage без синку. Прекеш
            // атомарний на білд: glue і бінарник тепер завжди з однієї
            // збірки. Ціна — ~350 kB brotli на install SW поверх ~265 kB
            // glue, який туди й так входив.
            globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,wasm}"],
            globIgnores: [
              "**/node_modules/**",
              "**/*.map",
              "**/*.map.*",
              "bundle-report.html",
            ],
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
              if (id.includes("@zxing")) return "vendor-zxing";
              // `react-markdown` (та весь стек remark/mdast/hast/micromark)
              // прибрано у T4-B: `AssistantMessageBody.tsx` тепер містить
              // власний tiny inline-парсер для bold/italic/list/code/link/
              // headings/blockquotes (~6 KB raw), що покриває весь набір
              // фічей, які асистент насправді надсилає у чат. Економія —
              // ~25 KB brotli з eager-preload-у (`vendor-markdown` chunk
              // зник, разом із транзитивами в `vendor`-у).
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
              // Те саме для PostHog. `core/observability/posthog.ts` тягне
              // SDK через `await import("posthog-js")` і лише за наявності
              // `VITE_POSTHOG_KEY` — тобто код УЖЕ лінивий. Але catch-all
              // нижче зводив це нанівець: пакет падав у загальний
              // `vendor`, який жадібно преложиться, і 224 kB сирої
              // аналітики чекала людина до першого екрана.
              //
              // AI-CONTEXT: динамічний `import()` сам собою НЕ гарантує
              // лінивості, коли є catch-all manual chunk — Rollup спершу
              // слухає manualChunks, і аж потім розкладає по графу
              // імпортів. Той самий трюк уже застосовано вище до
              // Capacitor і sqlite; PostHog просто ніхто не перевірив.
              if (id.includes("/node_modules/posthog-js/"))
                return "vendor-posthog";
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
      port: 3000,
      strictPort: true,
      allowedHosts: true,
      // Паритет із `preview.headers` (браузерна верифікація 2026-08-06):
      // без COOP/COEP dev-сервер щодня працює на kvvfs-fallback замість
      // OPFS — інша персистентність, ніж прод/preview, і клас «фантомних»
      // dev-багів навколо SQLite-стану.
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      // `apps/mobile` тягне react-native 0.76 → react@19, і pnpm вкладає
      // цю 19-ту копію під `react-router`/`react-router-dom` (їх peer —
      // `react >=18`), тоді як `apps/web` пінить react@18.3.1. Без dedupe
      // `RouterProvider` створює елементи React-ом 19, а решта дерева —
      // React-ом 18 → рантайм-краш «Objects are not valid as a React
      // child» на корені. Форсуємо єдину копію react/react-dom з цього
      // workspace, щоб і роутер, і застосунок ділили один runtime.
      dedupe: ["react", "react-dom", "react/jsx-runtime"],
      alias: {
        // ПЕРЕД загальним аліасом `@sergeant/shared`: Vite резолвить
        // аліаси за порядком і префіксним збігом, а не через exports-мапу
        // пакета. Без цього рядка підпаточний імпорт перетворюється на
        // `…/src/index.ts/data/genericFoods` і білд падає з
        // «Not a directory».
        //
        // Підпаточний імпорт тут не примха: корпус базової їжі (~390
        // позицій) свідомо не реекспортується з барелю `@sergeant/shared`,
        // бо той тягнеться на критичному шляху і затягнув би дані в
        // eager-чанк повз гейт ≤ 280 kB.
        "@sergeant/shared/data/genericFoods": resolve(
          __dirname,
          "../../packages/shared/src/data/genericFoods.ts",
        ),
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
        "@assets": resolve(__dirname, "src/assets"),
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
