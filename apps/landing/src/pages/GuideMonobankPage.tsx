import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import MonoAccessTable from "../components/MonoAccessTable";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";

const STEPS = [
  "Відкрий api.monobank.ua і авторизуйся через застосунок банку: QR-кодом, як звичайний вхід.",
  "Скопіюй персональний токен. Він виглядає як довгий рядок літер: це і є твій ключ «лише читання».",
  "Встав токен у трекер. Виписка підтягнеться за кілька секунд, далі синк працює сам.",
];

const SHORT_ANSWER =
  "Monobank віддає трекеру виписку через персональний токен, який ти створюєш сам за хвилину. Токен лише читає дані: транзакції, категорії MCC і баланс. Рухати гроші чи бачити повний номер картки він фізично не може.";

export default function GuideMonobankPage() {
  usePageMeta({
    ...ROUTE_META["/guides/monobank"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline:
        "Як підʼєднати Monobank до трекера витрат – і що він реально бачить",
      inLanguage: "uk",
      dateModified: "2026-08-28",
      author: { "@type": "Person", name: "Автор Sergeant" },
      publisher: { "@type": "Organization", name: "Sergeant" },
    },
  });

  const h2 =
    "font-display text-xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-2xl";

  return (
    <>
      <SiteHeader />

      <main>
        <article className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 pb-20 pt-12 sm:px-8 sm:pt-16">
          <div>
            <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-subtle">
              Гайди · Фінанси
            </p>
            <h1 className="mt-4 text-3xl font-extrabold leading-[1.12] tracking-tight text-balance text-foreground-strong sm:text-4xl">
              Як підʼєднати Monobank до трекера витрат – і що він реально бачить
            </h1>
            <p className="mt-4 text-sm text-subtle">
              Оновлено 28.08.2026 · автор Sergeant
            </p>
          </div>

          <div className="rounded-[var(--radius-card)] bg-ink px-7 py-6">
            <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-ink-muted">
              Коротка відповідь
            </p>
            <p className="mt-2.5 font-semibold leading-relaxed text-ink-text">
              {SHORT_ANSWER}
            </p>
          </div>

          <section>
            <h2 className={h2}>Що саме бачить трекер</h2>
            <div className="mt-5">
              <MonoAccessTable />
            </div>
          </section>

          <section>
            <h2 className={h2}>Як підʼєднати за три кроки</h2>
            <ol className="mt-5 flex flex-col gap-3.5">
              {STEPS.map((step, i) => (
                <li
                  key={i}
                  className="flex gap-4 leading-relaxed text-foreground"
                >
                  <span className="shrink-0 font-bold text-foreground-strong">
                    {i + 1}.
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className={h2}>Якщо передумаєш</h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
              Токен відкликається в один клік на тій самій сторінці
              api.monobank.ua. Після цього жоден сервіс, якому ти його давав,
              більше не бачить нічого. Це головна перевага офіційного API перед
              «поділись логіном»: контроль завжди у тебе.
            </p>
          </section>

          <div className="flex flex-col gap-2.5 border-t border-cardline pt-6">
            <p className="text-sm leading-relaxed text-muted">
              У Sergeant синк Monobank вбудований: один токен – і Фінік веде
              бюджети в гривні без ручного вводу.
            </p>
            <a
              href="/beta"
              className="text-sm font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Стати в чергу →
            </a>
          </div>
        </article>
      </main>

      <SiteFooter />
    </>
  );
}
