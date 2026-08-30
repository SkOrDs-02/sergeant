import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import { FAQ_ITEMS } from "../content/faqItems";
import { ANALYTICS_EVENTS, LANDING_LOCALE, track } from "../lib/analytics";
import TelegramCta from "../components/TelegramCta";

export default function PytannyaPage() {
  usePageMeta({
    ...ROUTE_META["/pytannya"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: "uk",
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  });

  return (
    <SiteLayout mainClassName="mx-auto w-full max-w-6xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
      <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-5xl">
        Питання
      </h1>
      <p className="mt-5 max-w-xl leading-relaxed text-muted">
        Коротко про те, що питають найчастіше. Якщо твого питання тут немає –
        напиши в Telegram, і воно тут зʼявиться.
      </p>

      <div className="mt-10 grid gap-x-12 sm:grid-cols-2">
        {FAQ_ITEMS.map((item) => (
          <details
            key={item.q}
            name="faq"
            className="group border-t border-cardline"
            onToggle={(e) => {
              if (e.currentTarget.open)
                track(ANALYTICS_EVENTS.LANDING_FAQ_OPENED, {
                  question: item.q,
                  locale: LANDING_LOCALE,
                });
            }}
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-4 font-bold text-foreground-strong transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">
              <h2>{item.q}</h2>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                className="shrink-0 stroke-foreground-strong transition-transform group-open:rotate-45 motion-reduce:transition-none"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M8 2 v12 M2 8 h12" />
              </svg>
            </summary>
            <p className="max-w-2xl pb-5 text-sm leading-relaxed text-muted">
              {item.a}
            </p>
          </details>
        ))}
      </div>

      <div className="mt-12 border-t-2 border-foreground-strong pt-8">
        <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong">
          Немає твого питання
        </h2>
        <p className="mt-3 max-w-xl leading-relaxed text-muted">
          Напиши в Telegram. Питання, які повторюються, переїжджають сюди, а
          великі –{" "}
          <a
            href="/guides"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            у гайди
          </a>
          .
        </p>
        <div className="mt-6">
          <TelegramCta placement="footer" label="Стати в чергу" />
        </div>
      </div>
    </SiteLayout>
  );
}
