import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import TelegramCta from "../components/TelegramCta";
import { telegramStartLink } from "../lib/links";
import { usePageMeta } from "../lib/pageMeta";

const PRINCIPLES = [
  {
    title: "Твої дані залишаються твоїми.",
    text: "Токен банку – лише читання, експорт – в один клік, і я не продаю і не передаю твої дані нікому.",
  },
  {
    title: "Показую лише те, в чому впевнений.",
    text: "Коли даних замало, Sergeant мовчить, а не вигадує звʼязок заради ефекту.",
  },
  {
    title: "Ядро безкоштовне назавжди.",
    text: "Модулі й банк-синк не стануть платними. Платною буде лише глибша аналітика поверх твоїх даних.",
  },
];

export default function AboutPage() {
  usePageMeta({
    title: "Що таке Sergeant",
    description:
      "Sergeant – український застосунок, який тримає гроші, тіло, звички й харчування в одному приватному просторі та показує звʼязки між ними.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Sergeant",
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web",
      inLanguage: "uk",
      description:
        "Український застосунок, який тримає гроші, тіло, звички й харчування в одному приватному просторі та показує звʼязки між ними.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "UAH" },
    },
  });

  return (
    <>
      <SiteHeader />

      <main>
        <section className="mx-auto w-full max-w-6xl px-5 pb-10 pt-12 sm:px-8 sm:pt-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-foreground-strong">
            Про проєкт
          </p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.06] tracking-tight text-foreground-strong sm:text-5xl">
            Що таке Sergeant
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-foreground">
            Sergeant – український застосунок, який тримає гроші, тіло, звички й
            харчування в одному приватному просторі та показує звʼязки між ними.
          </p>
        </section>

        <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 pb-16 sm:px-8">
          <p className="max-w-2xl leading-relaxed text-foreground">
            Я роками трекав життя в чотирьох різних застосунках: банк окремо,
            тренування окремо, звички окремо, їжа окремо. Кожен показував свої
            цифри, і жоден не бачив картину цілком. А найцікавіше завжди
            ховалось на стиках: чому в тижні без тренувань більшає доставки,
            чому зірваний сніданок тягне за собою зірваний день.
          </p>
          <p className="max-w-2xl leading-relaxed text-foreground">
            Тому я роблю Sergeant: не пʼятий трекер, а місце, де чотири сфери
            нарешті бачать одна одну. Роблю сам, користуюсь щодня, показую
            процес відкрито. Це не стартап під інвесторів, а інструмент, без
            якого мені самому вже незручно жити.
          </p>
          <p className="max-w-2xl leading-relaxed text-foreground">
            Назва – від сержанта, який не читає лекцій і не карає. Він рахує,
            тримає стрій і чесно каже, що бачить.
          </p>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground-strong sm:text-4xl">
            Три принципи, які не зміняться
          </h2>
          <div className="mt-8 max-w-4xl border-b border-cardline">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="border-t border-cardline py-5">
                <p className="font-semibold text-foreground-strong">
                  {p.title}
                </p>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
                  {p.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-ink py-16 sm:py-20">
          <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
            <h2 className="font-display text-3xl font-bold tracking-tight text-ink-text sm:text-4xl">
              Стеж за розробкою
            </h2>
            <p className="mt-4 max-w-lg leading-relaxed text-ink-muted">
              Я показую процес відкрито: реальні цифри, фейли і рішення. Обирай
              формат, який тобі зручніший.
            </p>
            <div className="mt-9 grid max-w-3xl gap-10 sm:grid-cols-2">
              <a
                href="https://www.threads.net/@sergeant.app"
                target="_blank"
                rel="noreferrer"
                className="group border-t border-ink-line pt-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-text"
              >
                <span className="flex items-center gap-2.5">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    className="stroke-ink-text"
                    strokeWidth="1.8"
                  >
                    <path d="M12 21 C7 21 4.5 17.5 4.5 12 C4.5 6.5 7 3 12 3 C16 3 18.5 5 19 8.5 M12 21 C16.5 21 19.5 18.5 19.5 15 C19.5 11.5 16.5 10 13.5 10 C11 10 9.5 11.5 9.5 13.5 C9.5 15.5 11 16.5 12.5 16.5 C15 16.5 16.5 14.5 16.5 11.5 C16.5 8 15 6 12 6" />
                  </svg>
                  <span className="font-display text-lg font-bold text-ink-text group-hover:underline">
                    Threads
                  </span>
                </span>
                <span className="mt-2 block text-sm leading-relaxed text-ink-muted">
                  Щоденні короткі думки й спостереження по ходу. @sergeant.app
                </span>
              </a>
              <a
                href={telegramStartLink("footer")}
                target="_blank"
                rel="noreferrer"
                className="group border-t border-ink-line pt-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-text"
              >
                <span className="flex items-center gap-2.5">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    className="stroke-ink-text"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  >
                    <path d="M21 4 3 11.5 9.5 14 12 20.5 15 15.5 21 4 Z M9.5 14 21 4" />
                  </svg>
                  <span className="font-display text-lg font-bold text-ink-text group-hover:underline">
                    Telegram
                  </span>
                </span>
                <span className="mt-2 block text-sm leading-relaxed text-ink-muted">
                  Бот бети: найшвидший шлях у чергу й апдейти хвиль.
                </span>
              </a>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="font-display text-3xl font-bold tracking-tight text-balance text-foreground-strong sm:text-4xl">
            Хочеш спробувати сам?
          </h2>
          <p className="mt-4 max-w-lg leading-relaxed text-pretty text-muted">
            Бета відкривається хвилями. Стань у чергу, і я напишу одне
            повідомлення, коли відкриється твоя.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <div>
              <TelegramCta placement="beta" label="Стати в чергу" />
            </div>
            <p className="text-sm text-muted">
              Ядро безкоштовне назавжди · Твої дані залишаються твоїми
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
