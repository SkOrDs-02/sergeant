// SSG-крок після postbuild-seo: рендерить кожен маршрут через
// dist-ssr/entry-server.js (react-dom/server, без браузера – працює на
// будь-якому CI) і вкладає готовий HTML у #root per-route файлів, які вже
// написав postbuild-seo.mjs. Разом із тілом у <head> їде jsonLd сторінки.
// Без цього кроку AI-краулери (GPTBot, ClaudeBot, PerplexityBot), які не
// виконують JS, бачили лише title/description. Запуск: частина `pnpm build`.
import { copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, "dist");
const SSR_DIR = path.join(ROOT, "dist-ssr");

const { render } = await import(
  pathToFileURL(path.join(SSR_DIR, "entry-server.js")).href
);

const routes = JSON.parse(
  readFileSync(path.join(ROOT, "src/lib/routeMeta.json"), "utf8"),
);

const EMPTY_ROOT = '<div id="root"></div>';

let written = 0;
for (const route of Object.keys(routes)) {
  const file =
    route === "/"
      ? path.join(DIST, "index.html")
      : path.join(DIST, ...route.split("/").filter(Boolean), "index.html");
  let html = readFileSync(file, "utf8");
  if (!html.includes(EMPTY_ROOT)) {
    throw new Error(`prerender: у ${file} немає порожнього ${EMPTY_ROOT}`);
  }

  const page = render(route);
  html = html.replace(EMPTY_ROOT, `<div id="root">${page.html}</div>`);

  if (page.jsonLd) {
    // < замість «<» усередині JSON: рядок даних не може закрити <script>.
    const json = JSON.stringify(page.jsonLd).replace(/</g, "\\u003c");
    html = html.replace(
      "</head>",
      `  <script type="application/ld+json">${json}</script>\n  </head>`,
    );
  }

  writeFileSync(file, html, "utf8");
  written += 1;
}

// Vercel віддає dist/404.html зі статусом 404 на будь-який шлях, якого немає
// у файловій системі білда. Catch-all rewrite прибрано 2026-09-02: він
// віддавав 200 і пререндер ГОЛОВНОЇ на кожен битий URL (soft-404, знахідка
// GEO-аудиту 2026-08-27). Тіло те саме, що й у маршруту /404.
copyFileSync(path.join(DIST, "404", "index.html"), path.join(DIST, "404.html"));

rmSync(SSR_DIR, { recursive: true, force: true });
console.log(`prerender: ${written} сторінок із повним HTML, 404.html`);
