import Wordmark from "./Wordmark";

export default function SiteHeader() {
  const onHome = window.location.pathname === "/";

  const anchor = (hash: string) => (onHome ? `#${hash}` : `/#${hash}`);

  const navLink =
    "transition hover:text-foreground-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  return (
    <header className="border-b-2 border-foreground-strong">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
        <Wordmark />
        <nav
          aria-label="Головна навігація"
          className="hidden items-center gap-7 text-sm font-semibold text-foreground md:flex"
        >
          <a href={anchor("modules")} className={navLink}>
            Модулі
          </a>
          <a href={anchor("connections")} className={navLink}>
            Звʼязки
          </a>
          <a href={anchor("statute")} className={navLink}>
            Статут
          </a>
          <a href={anchor("faq")} className={navLink}>
            Питання
          </a>
          <a href="/guides" className={navLink}>
            Гайди
          </a>
          <a href="/about" className={navLink}>
            Про проєкт
          </a>
        </nav>
        <a
          href="/beta"
          className="inline-flex min-h-11 items-center bg-foreground-strong px-5 py-2.5 font-display text-xs font-bold uppercase tracking-[0.08em] text-background transition hover:bg-ink-hi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Стати в чергу
        </a>
      </div>
    </header>
  );
}
