import { useEffect } from "react";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

/**
 * Раніше невідомий шлях віддавав головну — для пошуковика це soft-404
 * (статус 200 на неіснуючій сторінці), і такі URL потрапляють в індекс.
 * Статичний SPA-хостинг не дасть віддати справжній 404-статус, тож робимо
 * наступне найкраще: окрема сторінка + `noindex`.
 *
 * Тег ставиться імперативно, а не JSX-ом: document-metadata у дереві —
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
        <span className="font-display text-sm font-bold tracking-widest text-accent">
          404
        </span>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-balance text-foreground-strong sm:text-4xl">
          Такої сторінки немає
        </h1>
        <p className="mt-4 max-w-md leading-relaxed text-pretty text-muted">
          Можливо, посилання застаріло. Головна на місці — там же й форма
          вейтліста.
        </p>
        <a
          href="/"
          className="mt-8 rounded-xl bg-accent px-6 py-3 text-sm font-bold text-accent-ink shadow-sm transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          На головну
        </a>
      </main>
      <SiteFooter />
    </>
  );
}
