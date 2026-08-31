import { useEffect, useRef, useState } from "react";
import Wordmark from "./Wordmark";

/**
 * У шапці стоїть тільки те, що відповідає на «що це вміє», плюс єдина дія.
 * Якорів більше немає взагалі: секція без URL не існує ні для пошуку, ні
 * для аналітики. Чотири модулі – чотири сторінки, а не один якір.
 */
const PAGE_ITEMS = [
  { href: "/hroshi", label: "Гроші" },
  { href: "/yizha", label: "Їжа" },
  { href: "/zvychky", label: "Звички" },
  { href: "/trenuvannia", label: "Тренування" },
  { href: "/zvyazky", label: "Звʼязки" },
  { href: "/guides", label: "Гайди" },
] as const;

/**
 * Мобільне меню двосекційне: у ньому більше пунктів, ніж у desktop-шапці,
 * бо вертикальний простір тут дешевий, а підвал далеко. Плоский список із
 * десяти однакових рядків читався як стіна – заголовки груп повертають
 * ієрархію. Заголовки саме мітки, не посилання.
 */
const MOBILE_GROUPS = [
  {
    label: "Модулі",
    items: [
      { href: "/hroshi", label: "Гроші" },
      { href: "/yizha", label: "Їжа" },
      { href: "/zvychky", label: "Звички" },
      { href: "/trenuvannia", label: "Тренування" },
      { href: "/zvyazky", label: "Звʼязки" },
      { href: "/guides", label: "Гайди" },
    ],
  },
  {
    label: "Про продукт",
    items: [
      { href: "/obitsyanky", label: "Що обіцяю" },
      { href: "/stan", label: "Доповідь про стан" },
      { href: "/pytannya", label: "Питання" },
      { href: "/about", label: "Про проєкт" },
    ],
  },
] as const;

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  // Відкрите меню має закриватись і без повторного тапу по бургеру:
  // Escape із клавіатури і тап повз меню – базові очікування від
  // розкривного списку, без них він поводиться як пастка.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const navLink =
    "transition hover:text-foreground-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  const mobileNavLink =
    "flex min-h-11 items-center border-t border-cardline text-base font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  return (
    <header
      ref={headerRef}
      className="relative border-b-2 border-foreground-strong"
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
        <Wordmark />
        <nav
          aria-label="Головна навігація"
          className="hidden items-center gap-7 text-sm font-semibold text-foreground md:flex"
        >
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
            {MOBILE_GROUPS.map((group) => (
              <div key={group.label} className="flex flex-col">
                <p className="pt-4 font-display text-xs font-bold uppercase tracking-[0.12em] text-subtle">
                  {group.label}
                </p>
                {group.items.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className={mobileNavLink}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
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
