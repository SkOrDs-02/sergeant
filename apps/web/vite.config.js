import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";
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
      __SW_BUILD_ID__: JSON.stringify(buildId),
      // Той самий buildId, доступний у головному бандлі (а не лише у
      // SW). Persister React Query (`queryClientPersister.ts`)
      // використовує його як `buster`, щоб новий деплой автоматично
      // інвалідовував старий IDB-snapshot — інакше при changed
      // response-shape (Hard Rule #3) кеш на диску ламає UI до
      // наступного revalidate.
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [
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
    ].filter(Boolean),
    build: {
      outDir,
      emptyOutDir: true,
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
              if (id.includes("react-markdown")) return "vendor-markdown";
              // Capacitor runtime + native плагіни (ML Kit / community
              // barcode scanner, @capacitor/preferences для bearer-storage,
              // @capacitor/status-bar, /splash-screen, /keyboard, /app)
              // свідомо НЕ мапляться на жоден manual chunk: це дозволяє
              // Rollup злити їх у ті самі async chunk-и, з яких вони
              // єдино імпортуються через dynamic `import()` —
              // `@sergeant/mobile-shell/barcodeNative` (→
              // `useBarcodeScanner`), `@sergeant/mobile-shell/auth-storage`
              // (→ `apps/web/src/shared/lib/bearerToken.ts`) і
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
