import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { ROUTES } from "./App";
import NotFoundPage from "./pages/NotFoundPage";
import { takeSsgJsonLd } from "./lib/ssgJsonLd";

/**
 * SSG-вхід для scripts/prerender.mjs: рендерить сторінку маршруту в рядок,
 * щоб краулери без виконання JS (GPTBot, ClaudeBot, PerplexityBot) бачили
 * повний текст, а не порожній #root. Ефекти тут не виконуються, тож jsonLd
 * сторінки приходить через збирач у lib/ssgJsonLd.ts, а не DOM.
 */
export function render(path: string): { html: string; jsonLd: object | null } {
  const Page = ROUTES[path] ?? NotFoundPage;
  const html = renderToString(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
  return { html, jsonLd: takeSsgJsonLd() };
}
