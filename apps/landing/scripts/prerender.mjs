// SSG-крок після postbuild-seo: рендерить кожен маршрут через
// dist-ssr/entry-server.js (react-dom/server, без браузера – працює на
// будь-якому CI) і вкладає готовий HTML у #root per-route файлів, які вже
// написав postbuild-seo.mjs. Разом із тілом у <head> їде jsonLd сторінки.
// Без цього кроку AI-краулери (GPTBot, ClaudeBot, PerplexityBot), які не
// виконують JS, бачили лише title/description. Запуск: частина `pnpm build`.
import { copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveSiteUrl } from "./site-url.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, "dist");
const SSR_DIR = path.join(ROOT, "dist-ssr");

const { render } = await import(
  pathToFileURL(path.join(SSR_DIR, "entry-server.js")).href
);

const routes = JSON.parse(
  readFileSync(path.join(ROOT, "src/lib/routeMeta.json"), "utf8"),
);

// Відносні url/logo/image у JSON-LD стають абсолютними: краулер без JS читає
// розмітку у відриві від базового документа.
const site = resolveSiteUrl();

const EMPTY_ROOT = '<div id="root"></div>';

/**
 * Текст сторінки для llms-full.txt: лише `<main>`, бо шапка й підвал
 * повторюються на кожному з 27 маршрутів і в суцільному файлі перетворюються
 * на шум. Сутності лишаються сирими (`&nbsp;` тощо) рівно ті, що вкладає
 * React, тож розгортаємо найчастіші.
 */
function pageText(pageHtml) {
  const main = pageHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? pageHtml;
  return main
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, "")
    .replace(/<\/(p|h[1-6]|li|section|div|tr)>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const fullText = [];
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

  const page = render(route, site);
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

  // /beta має noindex, /404 — технічна сторінка: обидві поза картою для
  // агентів, як і в sitemap.xml та llms.txt.
  if (!routes[route].noindex && route !== "/404") {
    fullText.push(
      `# ${routes[route].title}\nURL: ${site}${route}\n\n${pageText(page.html)}`,
    );
  }
}

// llms.txt дає агентові карту, llms-full.txt — самий текст, щоб відповідь
// спиралась на написане, а не на здогад за заголовком посилання.
writeFileSync(
  path.join(DIST, "llms-full.txt"),
  `# Sergeant — повний текст сайту\n\n> Згенеровано білдом із ${fullText.length} сторінок. Карта сайту — /llms.txt\n\n${fullText.join("\n\n---\n\n")}\n`,
  "utf8",
);

// Vercel віддає dist/404.html зі статусом 404 на будь-який шлях, якого немає
// у файловій системі білда. Catch-all rewrite прибрано 2026-09-02: він
// віддавав 200 і пререндер ГОЛОВНОЇ на кожен битий URL (soft-404, знахідка
// GEO-аудиту 2026-08-27). Тіло те саме, що й у маршруту /404.
copyFileSync(path.join(DIST, "404", "index.html"), path.join(DIST, "404.html"));

rmSync(SSR_DIR, { recursive: true, force: true });
console.log(`prerender: ${written} сторінок із повним HTML, 404.html`);
