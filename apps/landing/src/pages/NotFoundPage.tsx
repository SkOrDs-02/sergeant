import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";

/**
 * Раніше невідомий шлях віддавав головну – для пошуковика це soft-404
 * (статус 200 на сторінці, якої не існує), і такі URL потрапляють в індекс.
 * Статичний SPA-хостинг не дасть віддати справжній 404-статус, тож робимо
 * наступне найкраще: окрема сторінка + `noindex` + власний title, щоб у
 * вкладці не лишався заголовок головної.
 *
 * Сторінка обслуговує два шляхи: `/404` (свій запис у routeMeta, звідки
 * білд бере статичний `robots: noindex`) і будь-який невідомий URL, який
 * catch-all rewrite віддає з тілом головної – тут мету ставить рантайм.
 */
export default function NotFoundPage() {
  usePageMeta(ROUTE_META["/404"]);

  return (
    <SiteLayout mainClassName="mx-auto flex w-full max-w-2xl flex-col items-center px-5 py-20 text-center sm:px-8 sm:py-28">
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
    </SiteLayout>
  );
}
