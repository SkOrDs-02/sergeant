import { useState } from "react";
import Wordmark from "./Wordmark";

const NAV_ITEMS = [
  { hash: "modules", label: "Модулі" },
  { hash: "faq", label: "Питання" },
] as const;

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const onHome = window.location.pathname === "/";

  const anchor = (hash: string) => (onHome ? `#${hash}` : `/#${hash}`);

  const navLink =
    "transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  const mobileNavLink =
    "flex min-h-11 items-center border-t border-cardline text-base font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  return (
    <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
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
      <div className="flex items-center gap-2">
        <a
          href="/beta"
          className="hidden min-h-11 items-center rounded-[10px] bg-ink px-5 py-2 text-sm font-semibold text-ink-text transition hover:bg-ink-hi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:inline-flex"
        >
          Стати в чергу
        </a>
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? "Закрити меню" : "Відкрити меню"}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-ink transition hover:bg-cardline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:hidden"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            {open ? (
              <path d="M6 6 18 18 M18 6 6 18" />
            ) : (
              <path d="M4 7 h16 M4 12 h16 M4 17 h16" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Мобільна навігація"
          className="absolute left-0 right-0 top-full z-10 flex flex-col gap-0 border-b border-cardline bg-surface px-5 pb-4 shadow-lg sm:px-8 md:hidden"
        >
          {NAV_ITEMS.map((item) => (
            <a
              key={item.hash}
              href={anchor(item.hash)}
              className={mobileNavLink}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
          <a
            href="/guides"
            className={mobileNavLink}
            onClick={() => setOpen(false)}
          >
            Гайди
          </a>
          <a
            href="/about"
            className={mobileNavLink}
            onClick={() => setOpen(false)}
          >
            Про
          </a>
          <a
            href="/beta"
            onClick={() => setOpen(false)}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-[10px] bg-ink px-5 py-2 text-sm font-semibold text-ink-text transition hover:bg-ink-hi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Стати в чергу
          </a>
        </nav>
      )}
    </header>
  );
}
