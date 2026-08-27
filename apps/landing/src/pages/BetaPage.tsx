import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import TelegramCta from "../components/TelegramCta";
import { usePageMeta } from "../lib/pageMeta";

const GIVE = [
  "Повний доступ до всіх чотирьох модулів. Ядро і банк-синк безкоштовні назавжди, а на час бети відкрита й платна аналітика поверх них.",
  "Прямий канал до фаундера, без підтримки-посередника",
  "Вплив на те, які звʼязки продукт навчиться бачити першими",
];

const ASK = [
  "Користуватись хоча б одним модулем щодня",
  "Раз на тиждень – три речення чесного фідбеку",
  "Терпіння до гострих кутів: це бета, і вони будуть",
];

const MINI_FAQ = [
  {
    q: "Коли відкриється?",
    a: "Хвилями, без публічної дати: не хочу називати число, яке можу зірвати. Першими заходять ті, хто став у чергу раніше; коли твоя хвиля відкриється, бот напише одне повідомлення.",
  },
  {
    q: "Що зараз зламано?",
    a: null, // відповідь із лінком рендериться окремо
  },
  {
    q: "Що з моїми даними, якщо бета закриється?",
    a: "Експорт в один клік у стандартні формати. Дані твої за будь-якого сценарію.",
  },
];

export default function BetaPage() {
  usePageMeta({
    title: "Черга в бету Sergeant",
    description:
      "Бета Sergeant відкривається хвилями. Стань у чергу через Telegram і отримай одне повідомлення, коли відкриється твоя.",
    // Гейт бети не має конкурувати в індексі з головною до відкриття CTA-фази.
    noindex: true,
  });

  return (
    <>
      <SiteHeader />

      <main>
        <section className="mx-auto w-full max-w-6xl px-5 pb-14 pt-12 sm:px-8 sm:pt-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-foreground-strong">
            Закрита бета
          </p>
          <h1 className="mt-4 max-w-2xl font-display text-4xl font-bold leading-[1.06] tracking-tight text-balance text-foreground-strong sm:text-5xl">
            Бета відкривається хвилями. Місць небагато
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted">
            Sergeant вчиться на реальних даних, тому я відкриваю доступ
            поступово, щоб встигати говорити з кожним, хто зайшов.
          </p>
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-16 sm:grid-cols-2 sm:gap-14 sm:px-8">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-strong">
              Що отримуєш
            </h2>
            <ul className="mt-5 flex flex-col gap-4 border-t border-cardline pt-5">
              {GIVE.map((item) => (
                <li
                  key={item}
                  className="flex items-baseline gap-2.5 text-sm font-semibold leading-relaxed text-foreground-strong"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden="true"
                    className="shrink-0 translate-y-0.5 stroke-ink"
                    strokeWidth="2.6"
                  >
                    <path d="M4 10.5 8.2 15 16 5.5" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
              Що прошу натомість
            </h2>
            <ul className="mt-5 flex flex-col gap-4 border-t border-cardline pt-5">
              {ASK.map((item) => (
                <li key={item} className="text-sm leading-relaxed text-muted">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="bg-ink py-16 sm:py-20">
          <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
            <h2 className="font-display text-3xl font-bold tracking-tight text-ink-text sm:text-4xl">
              Черга в бету
            </h2>
            <p className="mt-4 max-w-lg leading-relaxed text-ink-muted">
              Черга живе в Telegram: натисни кнопку, бот запамʼятає тебе і
              напише одне повідомлення, коли відкриється твоя хвиля. Без пошти і
              спаму.
            </p>
            <div className="mt-7">
              <TelegramCta
                placement="beta"
                label="Стати в чергу в Telegram"
                variant="inverse"
              />
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-16">
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground-strong">
            Коротко про бету
          </h2>
          <div className="border-b border-cardline">
            {MINI_FAQ.map((item) => (
              <div key={item.q} className="border-t border-cardline py-5">
                <h3 className="font-display text-lg font-bold text-foreground-strong">
                  {item.q}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                  {item.a ?? (
                    <>
                      Чесний список – у розділі{" "}
                      <a
                        href="/#status"
                        className="text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                      >
                        «Що вже працює, а що ще ні»
                      </a>{" "}
                      на головній. Він оновлюється.
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
