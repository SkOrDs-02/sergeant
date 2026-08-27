import Wordmark from "./Wordmark";

export default function SiteHeader() {
  const onHome = window.location.pathname === "/";

  const anchor = (hash: string) => (onHome ? `#${hash}` : `/#${hash}`);

  const navLink =
    "transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
      <Wordmark />
      <nav
        aria-label="Головна навігація"
        className="hidden items-center gap-6 text-sm font-semibold text-muted md:flex"
      >
        <a href={anchor("modules")} className={navLink}>
          Модулі
        </a>
        <a href={anchor("faq")} className={navLink}>
          Питання
        </a>
        <a href="/guides" className={navLink}>
          Гайди
        </a>
        <a href="/about" className={navLink}>
          Про
        </a>
      </nav>
      <a
        href="/beta"
        className="inline-flex min-h-11 items-center rounded-[10px] bg-ink px-5 py-2 text-sm font-semibold text-ink-text transition hover:bg-ink-hi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Стати в чергу
      </a>
    </header>
  );
}
