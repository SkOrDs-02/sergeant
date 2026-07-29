import { Link, useLocation } from "react-router-dom";

export default function SiteHeader() {
  const { pathname } = useLocation();
  const onHome = pathname === "/";

  const anchor = (hash: string) => (onHome ? `#${hash}` : `/#${hash}`);

  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
      <Link
        to="/"
        className="inline-flex min-h-11 items-center font-display text-xl font-bold tracking-tight text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Sergeant<span className="text-accent">.</span>
      </Link>
      <nav
        aria-label="Головна навігація"
        className="hidden items-center gap-6 text-sm text-muted md:flex"
      >
        <a
          href={anchor("how")}
          className="transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Як працює
        </a>
        <a
          href={anchor("modules")}
          className="transition hover:text-foreground"
        >
          Модулі
        </a>
      </nav>
      <a
        href={anchor("beta")}
        className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-ink shadow-sm transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Приєднатися до бети
      </a>
    </header>
  );
}
