import { useState } from "react";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import WaitlistForm from "../components/WaitlistForm";

const FREE_FEATURES = [
  "Всі 4 модулі: фінанси, фітнес, звички, харчування",
  "Monobank-синк і бюджети в ₴",
  "Локальне зберігання даних",
  "Базовий AI-чат (15 запитів/день)",
];

const PRO_FEATURES = [
  "Усе з Free, без лімітів",
  "Крос-модульний AI: сон × витрати × тренування",
  "CloudSync між пристроями",
  "AI-фото їжі та тижневі звіти",
  "Пріоритетна підтримка",
];

const FAQ = [
  {
    q: "Що буде з моїми даними, якщо я даунгрейджу до Free?",
    a: "Усе залишається. Дані живуть локально на пристрої. Просто вимкнеться CloudSync та крос-модульні звіти. Повернешся на Pro — і вони знову там.",
  },
  {
    q: "Чому ₴99, а не $14.99 як у конкурентів?",
    a: "Ми UAH-first і рахуємо ціну від українських зарплат, а не від каліфорнійських. Один Pro замінює 3-4 підписки на окремі застосунки.",
  },
  {
    q: "Чи потрібна картка для тріалу?",
    a: "Ні. 7 днів Pro — без картки. Після тріалу автоматично переходиш на Free, нічого не списується.",
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const proPrice = annual ? 66 : 99;
  const annualEquiv = 792;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-5 pb-16 sm:px-8">
        <section className="pt-10 text-center sm:pt-16">
          <h1 className="font-display text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Чесні тарифи. В <span className="text-accent">гривні.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-muted">
            Sergeant Free дає цінність із першого дня. Pro знімає ліміти й
            вмикає крос-модульний AI. Без прихованих платежів.
          </p>

          <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-cardline bg-card p-1 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              aria-pressed={!annual}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                !annual ? "bg-accent text-accent-ink" : "text-muted"
              }`}
            >
              Щомісяця
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              aria-pressed={annual}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                annual ? "bg-accent text-accent-ink" : "text-muted"
              }`}
            >
              Щороку <span className="opacity-70">−33%</span>
            </button>
          </div>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <article className="rounded-3xl border border-cardline bg-card p-8 backdrop-blur-md">
            <h2 className="font-display text-xl font-bold">Free</h2>
            <div className="mt-3 font-display text-4xl font-bold">
              ₴0
              <span className="text-base font-normal text-muted"> / міс</span>
            </div>
            <p className="mt-2 text-sm text-muted">Назавжди безкоштовно.</p>
            <ul className="mt-6 flex flex-col gap-3 text-sm leading-relaxed">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <span aria-hidden="true" className="text-accent">
                    ✓
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </article>

          <article className="relative rounded-3xl border border-accent/40 bg-accent/10 p-8 backdrop-blur-md">
            <span className="absolute -top-3 right-6 rounded-full bg-accent px-3 py-1 text-xs font-extrabold text-accent-ink">
              Популярний
            </span>
            <h2 className="font-display text-xl font-bold">Pro</h2>
            <div className="mt-3 font-display text-4xl font-bold">
              ₴{proPrice}
              <span className="text-base font-normal text-muted"> / міс</span>
            </div>
            <p className="mt-2 text-sm text-muted">
              {annual
                ? `₴${annualEquiv}/рік · ~$0.07 на день`
                : `Або ₴${annualEquiv}/рік зі знижкою −33%`}
            </p>
            <ul className="mt-6 flex flex-col gap-3 text-sm leading-relaxed">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <span aria-hidden="true" className="text-accent">
                    ✓
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="mt-16 rounded-3xl border border-cardline bg-card p-8 text-center backdrop-blur-md sm:p-10">
          <h2 className="font-display text-2xl font-bold tracking-tight text-balance sm:text-3xl">
            Застосунок ще в закритій беті
          </h2>
          <p className="mx-auto mt-3 max-w-xl leading-relaxed text-muted">
            Залиш пошту — і отримаєш ранній доступ. Перші 500 бета-юзерів
            отримують Pro назавжди безкоштовно.
          </p>
          <div className="mt-6 flex justify-center">
            <WaitlistForm tierInterest="pro" buttonLabel="У вейтліст" compact />
          </div>
        </section>

        <section aria-label="Часті питання" className="mt-16">
          <h2 className="text-center font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Часті питання
          </h2>
          <div className="mt-8 flex flex-col gap-4">
            {FAQ.map((item) => (
              <article
                key={item.q}
                className="rounded-2xl border border-cardline bg-card p-6 backdrop-blur-md"
              >
                <h3 className="font-display font-bold">{item.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {item.a}
                </p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
