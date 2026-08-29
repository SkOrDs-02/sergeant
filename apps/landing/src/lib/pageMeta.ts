import { useEffect } from "react";
import ROUTE_META_JSON from "./routeMeta.json";
import { reportSsgJsonLd } from "./ssgJsonLd";

/**
 * Єдине джерело title/description для маршрутів: сторінки читають звідси
 * в рантаймі, а `scripts/postbuild-seo.mjs` – у білді, коли генерує
 * per-route HTML, sitemap і canonical. Додаєш маршрут – додай запис сюди.
 */
export const ROUTE_META = ROUTE_META_JSON;

interface PageMeta {
  title: string;
  description: string;
  /** Для сторінок, які не мають потрапляти в індекс (наприклад, /beta). */
  noindex?: boolean;
  /** Дата останньої змістовної зміни (YYYY-MM-DD) – іде в sitemap lastmod. */
  lastmod?: string;
  /**
   * Шлях per-route og-картинки в `public/` (напр. `/og/guides.png`).
   * Використовується лише білдом (`postbuild-seo.mjs`); генерація –
   * `scripts/generate-og.mjs`. Без поля сторінка ділить спільну og.png.
   */
  ogImage?: string;
  /** Структуровані дані сторінки (FAQPage, Article тощо). */
  jsonLd?: object;
}

function upsertMeta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}

/**
 * Per-page SEO для SPA: лендінг рендериться клієнтом, тож title/description
 * і JSON-LD виставляються після маунта. Google виконує JS і бачить їх;
 * повний SSG – свідомо відкладений апгрейд (див. README лендінга).
 */
export function usePageMeta({ title, description, noindex, jsonLd }: PageMeta) {
  // SSG-прохід (entry-server): ефекти не виконуються, тож jsonLd сторінки
  // передається збирачу під час рендера – prerender.mjs кладе його в <head>
  // статичного HTML. У браузері document є, і гілка мертва.
  if (typeof document === "undefined") {
    reportSsgJsonLd(jsonLd);
  }
  useEffect(() => {
    document.title = title;
    upsertMeta("description", description);
    if (noindex) upsertMeta("robots", "noindex");

    if (jsonLd) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
      return () => {
        script.remove();
      };
    }
    return undefined;
    // Метадані статичні для сторінки – ефект має відпрацювати один раз.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
