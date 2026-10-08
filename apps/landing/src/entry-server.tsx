import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { ROUTES } from "./App";
import NotFoundPage from "./pages/NotFoundPage";
import { takeSsgJsonLd } from "./lib/ssgJsonLd";
import { absolutizeJsonLd, enrichJsonLd, withBreadcrumb } from "./lib/jsonLd";

/**
 * SSG-вхід для scripts/prerender.mjs: рендерить сторінку маршруту в рядок,
 * щоб краулери без виконання JS (GPTBot, ClaudeBot, PerplexityBot) бачили
 * повний текст, а не порожній #root. Ефекти тут не виконуються, тож jsonLd
 * сторінки приходить через збирач у lib/ssgJsonLd.ts, а не DOM.
 *
 * `origin` – публічний адрес білда (`scripts/site-url.mjs`): відносні url і
 * logo в розмітці стають абсолютними ще до запису в HTML.
 */
export function render(
  path: string,
  origin: string,
): { html: string; jsonLd: object | null } {
  const Page = ROUTES[path] ?? NotFoundPage;
  const html = renderToString(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
  const jsonLd = withBreadcrumb(
    enrichJsonLd(takeSsgJsonLd() ?? undefined, path),
    path,
  );
  return {
    html,
    jsonLd: jsonLd ? (absolutizeJsonLd(jsonLd, origin) as object) : null,
  };
}
