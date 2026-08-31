import { telegramStartLink } from "../lib/links";
import { LogoMark } from "./Wordmark";

const THREADS_URL = "https://www.threads.net/@sergeant.app";

export default function SiteFooter() {
  const link =
    "inline-flex min-h-11 items-center transition hover:text-foreground-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

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
          <p>© 2026 · Made in Ukraine</p>
        </div>
        <nav
          aria-label="Футер"
          className="mt-2 grid gap-x-8 gap-y-1 text-sm text-muted sm:grid-cols-3"
        >
          <div className="flex flex-col">
            <p className="pb-1 font-display text-xs font-bold uppercase tracking-[0.08em] text-subtle">
              Продукт
            </p>
            <a href="/zvyazky" className={link}>
              Звʼязки
            </a>
            <a href="/guides" className={link}>
              Гайди
            </a>
            <a href="/ruchna-robota" className={link}>
              Скільки вводити руками
            </a>
          </div>
          <div className="flex flex-col">
            <p className="pb-1 font-display text-xs font-bold uppercase tracking-[0.08em] text-subtle">
              Чесність
            </p>
            <a href="/obitsyanky" className={link}>
              Що обіцяю
            </a>
            <a href="/stan" className={link}>
              Доповідь про стан
            </a>
            <a href="/pytannya" className={link}>
              Питання
            </a>
            <a href="/about" className={link}>
              Про Sergeant
            </a>
          </div>
          <div className="flex flex-col">
            <p className="pb-1 font-display text-xs font-bold uppercase tracking-[0.08em] text-subtle">
              Дані і право
            </p>
            <a href="/data" className={link}>
              Твої дані
            </a>
            <a href="/vyhid" className={link}>
              Забрати свої дані
            </a>
            <a href="/privacy" className={link}>
              Політика приватності
            </a>
            <a href="/terms" className={link}>
              Умови використання
            </a>
          </div>
        </nav>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 border-t border-cardline pt-2 text-sm text-muted">
          <a
            href={telegramStartLink("footer")}
            target="_blank"
            rel="noreferrer"
            className={link}
          >
            Telegram
          </a>
          <a
            href={THREADS_URL}
            target="_blank"
            rel="noreferrer"
            className={link}
          >
            Threads
          </a>
        </div>
      </div>
    </footer>
  );
}
