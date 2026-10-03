import { next, rewrite } from "@vercel/edge";
import ROUTE_META from "./src/lib/routeMeta.json";

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

/**
 * Тіло 404 для агента. Статус лишається справжнім 404 – саме він каже
 * агенту, що шлях не існує; markdown-тіло лише пояснює це словами і дає
 * куди піти далі. Короткий текст навмисно тут, а не читанням `404.md`:
 * middleware не має доступу до файлів білда.
 */
const NOT_FOUND_MD = [
  "# Такої сторінки немає",
  "",
  "Посилання застаріло або сторінки ніколи не було на sergeant.com.ua.",
  "",
  "- Карта сайту: https://sergeant.com.ua/sitemap.xml",
  "- Орієнтир для агентів: https://sergeant.com.ua/llms.txt",
  "- Повний текст сайту: https://sergeant.com.ua/llms-full.txt",
  "",
].join("\n");

export default function middleware(request: Request): Response {
  const accept = request.headers.get("accept") ?? "";
  if (!accept.toLowerCase().includes("text/markdown")) return next();

  const url = new URL(request.url);
  const route = url.pathname.replace(/\/$/, "") || "/";

  // Реєстр маршрутів тут же, бо middleware не бачить файлової системи:
  // без цієї перевірки невідомий шлях переписався б у неіснуючий .md і
  // впав у HTML-тіло 404, тобто агент отримав би розмітку замість тексту.
  if (!(route in ROUTE_META)) {
    return new Response(NOT_FOUND_MD, {
      status: 404,
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        vary: "Accept",
      },
    });
  }

  // `/` → `/index.md`, `/guides/monobank` → `/guides/monobank/index.md`.
  url.pathname = `${route === "/" ? "" : route}/index.md`;
  return rewrite(url);
}
