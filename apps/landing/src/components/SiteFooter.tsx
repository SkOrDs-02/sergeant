import { telegramStartLink } from "../lib/links";
import { LogoMark } from "./Wordmark";

const THREADS_URL = "https://www.threads.net/@sergeant.app";

export default function SiteFooter() {
  const link =
    "inline-flex min-h-11 items-center transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  return (
    <footer className="mx-auto flex w-full max-w-6xl flex-col gap-2 border-t border-cardline px-5 py-8 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted">
        <p className="inline-flex items-center gap-2.5">
          <LogoMark size={18} />
          <span className="font-semibold text-foreground-strong">Sergeant</span>
          <span>· роблю сам, показую чесно</span>
        </p>
        <p>© 2026 · Made in Ukraine</p>
      </div>
      <nav
        aria-label="Футер"
        className="flex flex-wrap items-center gap-x-5 gap-y-0 text-sm text-muted"
      >
        <a href="/privacy" className={link}>
          Політика приватності
        </a>
        <a href="/terms" className={link}>
          Умови використання
        </a>
        <a href="/guides" className={link}>
          Гайди
        </a>
        <a href="/about" className={link}>
          Про проєкт
        </a>
        <a
          href={telegramStartLink("footer")}
          target="_blank"
          rel="noreferrer"
          className={link}
        >
          Telegram
        </a>
        <a href={THREADS_URL} target="_blank" rel="noreferrer" className={link}>
          Threads
        </a>
      </nav>
    </footer>
  );
}
