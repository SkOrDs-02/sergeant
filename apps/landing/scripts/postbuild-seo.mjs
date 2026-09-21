// Постбілд-SEO для CSR-лендінгу: краулери й месенджери без виконання JS
// бачать один index.html з метою головної, тож превʼю кожного лінка було
// однаковим. Скрипт генерує per-route dist/<path>/index.html з правильними
// title/description/og/canonical (на Vercel статичні файли мають пріоритет
// над catch-all rewrite) і dist/sitemap.xml. Джерело мети одне з рантаймом:
// src/lib/routeMeta.json. Запуск: частина `pnpm build`.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSiteUrl } from "./site-url.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, "dist");

const routes = JSON.parse(
  readFileSync(path.join(ROOT, "src/lib/routeMeta.json"), "utf8"),
);

const site = resolveSiteUrl();

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

/**
 * Preload двох шрифтів першого екрана.
 *
 * Навіщо: шрифти імпортуються всередині бандла, тож браузер дізнається про
 * них лише розібравши JS – замір на проді 2026-09-21 дав старт завантаження
 * на 1.7 с при повному завантаженні сторінки за 2.5 с. Preload піднімає їх
 * у початок черги, і текст перестає перемальовуватись системним шрифтом.
 *
 * Рівно два файли, не всі девʼять: `manrope-cyrillic` несе основний текст,
 * `unbounded-cyrillic-800` – заголовок першого екрана. Решта підмножин
 * (латиниця, латиниця-розширена під ₴) доїжджають своєю чергою і чекати на
 * них перший кадр не мусить.
 */
function preloadLinks() {
  const dir = path.join(DIST, "assets");
  const files = readdirSync(dir);
  const pick = (needle) =>
    files.find((f) => f.startsWith(needle) && f.endsWith(".woff2"));
  const critical = [
    pick("manrope-cyrillic-wght-normal"),
    pick("unbounded-cyrillic-800-normal"),
  ].filter(Boolean);
  if (critical.length !== 2) {
    throw new Error(
      `postbuild-seo: не знайдено критичних шрифтів у dist/assets (знайдено ${critical.length} із 2)`,
    );
  }
  return critical
    .map(
      (file) =>
        `<link rel="preload" href="/assets/${file}" as="font" type="font/woff2" crossorigin />`,
    )
    .join("\n    ");
}

const PRELOAD = preloadLinks();

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

  // Per-route превʼю: маршрути з `ogImage` (контентні сторінки) отримують
  // власну картинку замість спільної og.png. Маркер із ` content=` –
  // навмисно: `property="og:image"` без нього збігся б із og:image:width.
  if (meta.ogImage) {
    const ogImage = `<meta property="og:image" content="${site}${meta.ogImage}" />`;
    const twImage = `<meta name="twitter:image" content="${site}${meta.ogImage}" />`;
    if (html.includes('property="og:image" content=')) {
      html = replaceTag(html, tag('property="og:image" content='), ogImage);
      html = replaceTag(html, tag('name="twitter:image"'), twImage);
    } else {
      // Локальний білд без SITE_URL: absoluteUrlMeta тегів не додав.
      html = html.replace("</head>", `  ${ogImage}\n    ${twImage}\n  </head>`);
    }
  }

  // На початок `<head>`, а не перед `</head>`: у кінці preload опиняється
  // після тегів JS і CSS, і шрифт стає в чергу за ними. Замір на проді
  // 2026-09-21 показав старт на 1170 мс саме через це.
  html = html.replace(
    "<head>",
    `<head>
    ${PRELOAD}`,
  );

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
  .map(([route, meta]) => {
    const loc = `<loc>${site}${route === "/" ? "/" : route}</loc>`;
    const lastmod = meta.lastmod ? `<lastmod>${meta.lastmod}</lastmod>` : "";
    return `  <url>${loc}${lastmod}</url>`;
  })
  .join("\n")}
</urlset>
`;
writeFileSync(path.join(DIST, "sitemap.xml"), sitemap, "utf8");

console.log(`postbuild-seo: ${written} сторінок, sitemap.xml (${site})`);
