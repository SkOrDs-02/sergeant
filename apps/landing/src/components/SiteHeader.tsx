import { Link, useLocation } from "react-router-dom";

export default function SiteHeader() {
  const { pathname } = useLocation();
  const onHome = pathname === "/";

  const anchor = (hash: string) => (onHome ? `#${hash}` : `/#${hash}`);

  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
      <Link
        to="/"
        className="font-display text-lg font-bold tracking-tight text-foreground"
      >
        Sergeant<span className="text-accent">.</span>
      </Link>
      <nav
        aria-label="Головна навігація"
        className="hidden items-center gap-6 text-sm text-muted md:flex"
      >
        <a href={anchor("how")} className="transition hover:text-foreground">
          Як це працює
        </a>
        <a
          href={anchor("modules")}
          className="transition hover:text-foreground"
        >
          Модулі
        </a>
        <a
          href={anchor("connections")}
          className="transition hover:text-foreground"
        >
          Звʼязки
        </a>
      </nav>
      <a
        href={anchor("beta")}
        className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-sm transition hover:bg-accent-hover"
      >
        До бети
      </a>
    </header>
  );
}
