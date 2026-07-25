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
          className="grid h-16 w-16 place-items-center rounded-2xl bg-accent-soft font-display text-2xl font-bold text-accent"
        >
          ✓
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-balance text-foreground-strong sm:text-5xl">
          {alreadyOnList ? "Ти вже в списку" : "Готово, ти в списку"}
        </h1>
        <p className="mt-4 max-w-md leading-relaxed text-pretty text-muted">
          {alreadyOnList
            ? "Ця пошта вже у вейтлісті — місце за тобою. Напишемо, щойно відкриємо доступ."
            : "Дякуємо за довіру. Напишемо на пошту, щойно відкриємо наступну хвилю бети — без спаму."}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href="https://t.me/sergeant_app"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-accent px-6 py-3 text-sm font-bold text-accent-ink shadow-sm transition hover:bg-accent-hover"
          >
            Приєднатись до Telegram
          </a>
          <Link
            to="/"
            className="rounded-xl border border-cardline bg-card px-6 py-3 text-sm font-semibold text-foreground shadow-sm transition hover:border-accent"
          >
            На головну
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
