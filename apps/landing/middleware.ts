import { next, rewrite } from "@vercel/edge";

/**
 * Markdown-переговори (acceptmarkdown.com) на тих самих адресах.
 *
 * Чому middleware, а не `rewrites` у `vercel.json`. Vercel перевіряє
 * файлову систему ДО правил переписування, тож запит на `/` завжди
 * знаходить готовий `index.html`, і правило з умовою `Accept` до
 * виконання не доходить взагалі. Перевірено на проді 2026-09-21: правила
 * стояли, `Vary: Accept` віддавався, а тіло приходило HTML-ом.
 * Middleware ж працює перед файловою системою.
 *
 * Самі `.md` кладе білд (`scripts/prerender.mjs`) поруч із кожним
 * `index.html`; Vercel віддає їх із `text/markdown; charset=utf-8` без
 * додаткових налаштувань. `Vary: Accept` лишається в `vercel.json`, бо
 * потрібен на ВСІХ відповідях цих адрес, не лише на markdown-гілці.
 */
export const config = {
  // Лише безрозширенні шляхи: `/llms.txt`, `/sitemap.xml`, `/og.png` і
  // `/assets/*` мусять лишатись собою навіть для агента, що просить
  // markdown, інакше карта сайту для нього стає 404.
  matcher: ["/((?!assets/|.*\\.).*)"],
};

export default function middleware(request: Request): Response {
  const accept = request.headers.get("accept") ?? "";
  if (!accept.toLowerCase().includes("text/markdown")) return next();

  const url = new URL(request.url);
  // `/` → `/index.md`, `/guides/monobank` → `/guides/monobank/index.md`.
  url.pathname = `${url.pathname.replace(/\/$/, "")}/index.md`;
  return rewrite(url);
}
