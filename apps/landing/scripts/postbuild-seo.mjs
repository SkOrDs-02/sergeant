// Постбілд-SEO для CSR-лендінгу: краулери й месенджери без виконання JS
// бачать один index.html з метою головної, тож превʼю кожного лінка було
// однаковим. Скрипт генерує per-route dist/<path>/index.html з правильними
// title/description/og/canonical (на Vercel статичні файли мають пріоритет
// над catch-all rewrite) і dist/sitemap.xml. Джерело мети одне з рантаймом:
// src/lib/routeMeta.json. Запуск: частина `pnpm build`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, "dist");

const routes = JSON.parse(
  readFileSync(path.join(ROOT, "src/lib/routeMeta.json"), "utf8"),
);

const site = (
  process.env.SITE_URL?.trim() ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
    : "https://sergeant.com.ua")
).replace(/\/$/, "");

const base = readFileSync(path.join(DIST, "index.html"), "utf8");

const esc = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

/** Замінити цілий тег (теги в index.html багаторядкові). */
function replaceTag(html, pattern, replacement) {
  if (!pattern.test(html)) {
    throw new Error(`postbuild-seo: у dist/index.html не знайдено ${pattern}`);
  }
  return html.replace(pattern, replacement);
}

const tag = (marker) =>
  new RegExp(
    `<(?:meta|link)(?:(?!/?>)[\\s\\S])*?${marker}(?:(?!/?>)[\\s\\S])*?/?>`,
  );

function pageHtml(route, meta) {
  const url = `${site}${route === "/" ? "/" : route}`;
  let html = base;
  html = replaceTag(
    html,
    /<title>[\s\S]*?<\/title>/,
    `<title>${esc(meta.title)}</title>`,
  );
  html = replaceTag(
    html,
    tag('name="description"'),
    `<meta name="description" content="${esc(meta.description)}" />`,
  );
  html = replaceTag(
    html,
    tag('property="og:title"'),
    `<meta property="og:title" content="${esc(meta.title)}" />`,
  );
  html = replaceTag(
    html,
    tag('property="og:description"'),
    `<meta property="og:description" content="${esc(meta.description)}" />`,
  );

  const canonical = `<link rel="canonical" href="${url}" />`;
  const ogUrl = `<meta property="og:url" content="${url}" />`;
  if (html.includes('rel="canonical"')) {
    html = replaceTag(html, tag('rel="canonical"'), canonical);
    html = replaceTag(html, tag('property="og:url"'), ogUrl);
  } else {
    // Локальний білд без SITE_URL: absoluteUrlMeta тегів не додав.
    html = html.replace("</head>", `  ${canonical}\n    ${ogUrl}\n  </head>`);
  }

  if (meta.noindex) {
    html = html.replace(
      "</head>",
      `  <meta name="robots" content="noindex" />\n  </head>`,
    );
  }
  return html;
}

let written = 0;
for (const [route, meta] of Object.entries(routes)) {
  const html = pageHtml(route, meta);
  const target =
    route === "/"
      ? path.join(DIST, "index.html")
      : path.join(DIST, ...route.split("/").filter(Boolean), "index.html");
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, html, "utf8");
  written += 1;
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Object.entries(routes)
  .filter(([, meta]) => !meta.noindex)
  .map(
    ([route]) =>
      `  <url><loc>${site}${route === "/" ? "/" : route}</loc></url>`,
  )
  .join("\n")}
</urlset>
`;
writeFileSync(path.join(DIST, "sitemap.xml"), sitemap, "utf8");

console.log(`postbuild-seo: ${written} сторінок, sitemap.xml (${site})`);
