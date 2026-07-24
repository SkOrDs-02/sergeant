import { Link, useSearchParams } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

export default function ThanksPage() {
  const [params] = useSearchParams();
  // created=0 → email уже був у списку (сервер повертає created: false).
  const alreadyOnList = params.get("created") === "0";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-col items-center px-5 py-20 text-center sm:px-8 sm:py-28">
        <div
          aria-hidden="true"
          className="grid h-16 w-16 place-items-center rounded-2xl border border-accent/40 bg-accent/15 font-display text-2xl font-bold text-accent"
        >
          ✓
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-balance sm:text-5xl">
          {alreadyOnList
            ? "Ми памʼятаємо твій інтерес"
            : "Ти в списку, боєць"}
        </h1>
        <p className="mt-4 max-w-md leading-relaxed text-pretty text-muted">
          {alreadyOnList
            ? "Цей email уже в вейтлісті — місце за тобою. Напишемо, щойно відкриємо доступ."
            : "Місце заброньовано. Щойно відкриємо наступну хвилю бети — напишемо тобі першому."}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href="https://t.me/sergeant_app"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-accent px-6 py-3 text-sm font-extrabold text-accent-ink transition hover:bg-accent-strong"
          >
            Приєднатись до Telegram
          </a>
          <Link
            to="/"
            className="rounded-xl border border-cardline bg-card px-6 py-3 text-sm font-semibold text-foreground backdrop-blur-md transition hover:border-accent/50"
          >
            На головну
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
