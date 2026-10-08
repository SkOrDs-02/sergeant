import type { ReactNode } from "react";
import { telegramStartLink, THREADS_URL } from "../lib/links";
import { LogoMark } from "./Wordmark";
import { useCurrentRoute } from "../lib/currentRoute";

const LINK =
  "inline-flex min-h-11 items-center underline-offset-4 transition hover:text-foreground-strong aria-[current=page]:text-foreground-strong aria-[current=page]:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** Внутрішнє посилання підвалу; поточна сторінка позначена `aria-current`. */
function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  const current = useCurrentRoute();
  return (
    <a
      href={href}
      className={LINK}
      aria-current={current === href ? "page" : undefined}
    >
      {children}
    </a>
  );
}

export default function SiteFooter() {
  return (
    <footer className="border-t-2 border-foreground-strong">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-7 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted">
          <p className="inline-flex items-center gap-2.5">
            <LogoMark size={18} />
            <span className="font-display text-xs font-extrabold uppercase tracking-[0.06em] text-foreground-strong">
              Sergeant
            </span>
          </p>
          <p>© 2026 · Зроблено в Україні</p>
        </div>
        <nav
          aria-label="Посилання сайту"
          className="mt-2 grid gap-x-8 gap-y-6 text-sm text-muted sm:grid-cols-3 sm:gap-y-1 print:hidden"
        >
          <div className="flex flex-col">
            <p className="pb-1 font-display text-xs font-bold uppercase tracking-[0.08em] text-subtle">
              Продукт
            </p>
            <FooterLink href="/zvyazky">Звʼязки</FooterLink>
            <FooterLink href="/pomichnyk">Сержант</FooterLink>
            <FooterLink href="/guides">Гайди</FooterLink>
            <FooterLink href="/ruchna-robota">
              Скільки вводити руками
            </FooterLink>
          </div>
          <div className="flex flex-col">
            <p className="pb-1 font-display text-xs font-bold uppercase tracking-[0.08em] text-subtle">
              Про продукт
            </p>
            <FooterLink href="/obitsyanky">Що обіцяю</FooterLink>
            <FooterLink href="/stan">Доповідь про стан</FooterLink>
            <FooterLink href="/pytannya">Питання</FooterLink>
            <FooterLink href="/about">Про проєкт</FooterLink>
            <FooterLink href="/contact">Звʼязок</FooterLink>
          </div>
          <div className="flex flex-col">
            <p className="pb-1 font-display text-xs font-bold uppercase tracking-[0.08em] text-subtle">
              Дані і право
            </p>
            <FooterLink href="/data">Твої дані</FooterLink>
            <FooterLink href="/vyhid">Забрати свої дані</FooterLink>
            <FooterLink href="/privacy">Політика приватності</FooterLink>
            <FooterLink href="/terms">Умови використання</FooterLink>
          </div>
        </nav>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 border-t border-cardline pt-2 text-sm text-muted print:hidden">
          <a
            href={telegramStartLink("footer")}
            target="_blank"
            rel="noreferrer"
            className={LINK}
          >
            Telegram
          </a>
          <a
            href={THREADS_URL}
            target="_blank"
            rel="noreferrer"
            className={LINK}
          >
            Threads
          </a>
        </div>
      </div>
    </footer>
  );
}
