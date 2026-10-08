import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { resolveSiteUrl } from "./scripts/site-url.mjs";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Абсолютні URL у head. `og:image`, `og:url` і `canonical` мають бути
 * абсолютними — Telegram, X і Facebook не резолвлять відносний `og:image`, і
 * превʼю виходить порожнім. Адрес дає `scripts/site-url.mjs` — те саме
 * джерело, що й у postbuild-seo і prerender, щоб три місця не розходились.
 */
function absoluteUrlMeta(siteUrl: string): Plugin {
  return {
    name: "sergeant-absolute-url-meta",
    transformIndexHtml(html) {
      const tags = [
        `<link rel="canonical" href="${siteUrl}/" />`,
        `<meta property="og:url" content="${siteUrl}/" />`,
        `<meta property="og:image" content="${siteUrl}/og.png" />`,
        `<meta name="twitter:image" content="${siteUrl}/og.png" />`,
      ].join("\n    ");
      return html.replace("</head>", `  ${tags}\n  </head>`);
    },
  };
}

/**
 * `vite preview` поводиться як Vercel: `/hroshi` віддає `dist/hroshi/index.html`,
 * невідомий шлях – `dist/404.html` зі статусом 404.
 *
 * Без цього preview відповідав на будь-який шлях без слеша HTML-ом головної
 * (SPA-фолбек), а клієнт малював іншу сторінку. Lighthouse-гейт так міряв
 * чужий пререндер на трьох із чотирьох адрес, а після переходу на
 * `hydrateRoot` кожна сторінка, крім головної, давала розбіжність гідрації,
 * якої на проді немає (аудит сайту 2026-10-08, F1, F7).
 */
function vercelLikePreview(): Plugin {
  return {
    name: "sergeant-vercel-like-preview",
    configurePreviewServer(server) {
      const outDir = path.resolve(
        server.config.root,
        server.config.build.outDir,
      );
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://preview.local");
        const route = url.pathname.replace(/\/+$/, "");
        if (route === "" || path.extname(route)) return next();
        if (existsSync(path.join(outDir, route, "index.html"))) {
          req.url = `${route}/index.html${url.search}`;
          return next();
        }
        res.statusCode = 404;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(readFileSync(path.join(outDir, "404.html")));
      });
    },
  };
}

// Маркетинговий лендінг Sergeant: суто статичний білд на Vercel. Бекенду не
// потребує — єдина конверсія веде в Telegram, тож жодного `fetch` на сторінці
// немає. Якщо тут колись зʼявиться запит до API, треба буде повернути
// edge-проксі (`middleware.ts` в історії git), а не додавати абсолютний URL:
// `getAllowedOrigins()` в `apps/server/src/http/cors.ts` — fail-closed
// allowlist, і same-origin-проксі дешевший, ніж вписувати туди домен лендінга.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      tailwindcss(),
      absoluteUrlMeta(resolveSiteUrl(env)),
      vercelLikePreview(),
    ],
    resolve: {
      // Монорепо лінкується hoisted (`node-linker=hoisted`), тож react живе
      // в кореневому node_modules і збігається з версією apps/web. `dedupe`
      // тримає один інстанс, якщо транзитивна залежність притягне копію.
      dedupe: ["react", "react-dom"],
    },
    build: {
      // Шрифти завжди окремими файлами. Дефолтний ліміт 4 КБ вбудовував
      // base64 чотири підмножини cyrillic-ext у render-blocking CSS, хоча їхні
      // гліфи на сторінках не трапляються: CSS важив 14,6 КБ br замість 9
      // (аудит сайту 2026-10-08, F8). Окремий файл браузер тягне лише тоді,
      // коли гліф справді потрібен (`unicode-range`).
      assetsInlineLimit: (file: string) =>
        /\.woff2?$/.test(file) ? false : undefined,
    },
    ssr: {
      // SSG-збірка (entry-server) бандлить УСЕ, включно з workspace-пакетами:
      // prerender.mjs тоді імпортує один самодостатній файл, і жодна
      // залежність не резолвиться в рантаймі Node на CI.
      noExternal: true,
    },
    server: {
      host: true,
      port: 3100,
      allowedHosts: true,
    },
  };
});
