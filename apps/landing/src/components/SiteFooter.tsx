import { telegramStartLink } from "../lib/links";

export default function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-6xl border-t border-cardline px-5 py-10 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted">
        <p>© 2026 Sergeant. Made in Ukraine.</p>
        <nav aria-label="Футер" className="flex flex-wrap gap-5">
          <a
            href={telegramStartLink("footer")}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Telegram
          </a>
        </nav>
      </div>
    </footer>
  );
}
