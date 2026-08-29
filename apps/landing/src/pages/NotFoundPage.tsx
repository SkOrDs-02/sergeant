import { useEffect } from "react";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

/**
 * Раніше невідомий шлях віддавав головну – для пошуковика це soft-404
 * (статус 200 на сторінці, якої не існує), і такі URL потрапляють в індекс.
 * Статичний SPA-хостинг не дасть віддати справжній 404-статус, тож робимо
 * наступне найкраще: окрема сторінка + `noindex`.
 *
 * Тег ставиться імперативно, а не JSX-ом: document-metadata у дереві –
 * це React 19, а тут React 18 (спільна версія з `apps/web`).
 */
function useNoindex() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);
}

export default function NotFoundPage() {
  useNoindex();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-col items-center px-5 py-20 text-center sm:px-8 sm:py-28">
        <span className="font-display text-sm font-bold tracking-[0.12em] text-accent">
          404
        </span>
        <h1 className="mt-4 font-display text-2xl font-extrabold uppercase tracking-tight text-balance text-foreground-strong sm:text-4xl">
          Такої сторінки немає
        </h1>
        <p className="mt-4 max-w-md leading-relaxed text-pretty text-muted">
          Можливо, посилання застаріло. Головна на місці, там же й черга в бету.
        </p>
        <a
          href="/"
          className="mt-8 inline-flex min-h-12 items-center bg-foreground-strong px-8 py-4 font-display text-sm font-bold uppercase tracking-[0.08em] text-background transition hover:bg-ink-hi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          На головну
        </a>
      </main>
      <SiteFooter />
    </>
  );
}
