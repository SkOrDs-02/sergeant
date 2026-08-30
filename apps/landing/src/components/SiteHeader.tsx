import { useState } from "react";
import Wordmark from "./Wordmark";

/**
 * У шапці стоїть тільки те, що відповідає на «що це вміє», плюс єдина дія.
 * Якорів немає: секція без URL не існує ні для пошуку, ні для аналітики.
 * «Модулі» лишається останнім якорем до Етапу 3, коли пункт розсиплеться
 * на чотири модульні сторінки.
 */
const MODULES_ANCHOR = { hash: "modules", label: "Модулі" } as const;

const PAGE_ITEMS = [
  { href: "/zvyazky", label: "Звʼязки" },
  { href: "/obitsyanky", label: "Обіцянки" },
  { href: "/pytannya", label: "Питання" },
  { href: "/guides", label: "Гайди" },
] as const;

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  // SSG-прохід (entry-server) не має window; «/#hash» замість «#hash» у
  // статичному HTML веде на той самий URL, а після маунта клієнт перерендерить.
  const onHome =
    typeof window !== "undefined" && window.location.pathname === "/";

  const anchor = (hash: string) => (onHome ? `#${hash}` : `/#${hash}`);

  const navLink =
    "transition hover:text-foreground-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  const mobileNavLink =
    "flex min-h-11 items-center border-t border-cardline text-base font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  return (
    <header className="relative border-b-2 border-foreground-strong">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
        <Wordmark />
        <nav
          aria-label="Головна навігація"
          className="hidden items-center gap-7 text-sm font-semibold text-foreground md:flex"
        >
          <a href={anchor(MODULES_ANCHOR.hash)} className={navLink}>
            {MODULES_ANCHOR.label}
          </a>
          {PAGE_ITEMS.map((item) => (
            <a key={item.href} href={item.href} className={navLink}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="/beta"
            className="hidden min-h-11 items-center bg-foreground-strong px-5 py-2.5 font-display text-xs font-bold uppercase tracking-[0.08em] text-background transition hover:bg-ink-hi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:inline-flex"
          >
            Стати в чергу
          </a>
          <a
            href="/beta"
            className="inline-flex min-h-11 items-center bg-foreground-strong px-4 py-2.5 font-display text-xs font-bold uppercase tracking-[0.08em] text-background transition hover:bg-ink-hi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:hidden"
          >
            У чергу
          </a>
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? "Закрити меню" : "Відкрити меню"}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-foreground-strong transition hover:bg-cardline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:hidden"
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
            className="absolute left-0 right-0 top-full z-10 flex flex-col gap-0 border-b-2 border-foreground-strong bg-background px-5 pb-4 shadow-lg sm:px-8 md:hidden"
          >
            <a
              href={anchor(MODULES_ANCHOR.hash)}
              className={mobileNavLink}
              onClick={() => setOpen(false)}
            >
              {MODULES_ANCHOR.label}
            </a>
            {[
              ...PAGE_ITEMS,
              { href: "/stan", label: "Доповідь про стан" },
              { href: "/about", label: "Про проєкт" },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={mobileNavLink}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <a
              href="/beta"
              onClick={() => setOpen(false)}
              className="mt-4 inline-flex min-h-12 items-center justify-center bg-foreground-strong px-5 py-2.5 font-display text-xs font-bold uppercase tracking-[0.08em] text-background transition hover:bg-ink-hi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Стати в чергу
            </a>
          </nav>
        )}
      </div>
    </header>
  );
}
