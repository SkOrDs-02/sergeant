import { Link } from "react-router-dom";

export default function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-6xl border-t border-cardline px-5 py-10 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted">
        <p>© 2026 Sergeant. Made in Ukraine.</p>
        <nav aria-label="Футер" className="flex flex-wrap gap-5">
          <Link to="/pricing" className="transition hover:text-foreground">
            Тарифи
          </Link>
          <Link to="/privacy" className="transition hover:text-foreground">
            Приватність
          </Link>
          <Link to="/terms" className="transition hover:text-foreground">
            Умови
          </Link>
          <a
            href="https://t.me/sergeant_app"
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-foreground"
          >
            Telegram
          </a>
        </nav>
      </div>
    </footer>
  );
}
