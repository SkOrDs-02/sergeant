import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import TelegramCta from "../components/TelegramCta";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";

const GIVE = [
  "Повний доступ до всіх чотирьох модулів. Ядро і банк-синк безкоштовні назавжди, а на час бети відкрита й платна аналітика поверх них.",
  "Прямий канал до автора: питання не проходять через підтримку",
  "Вплив на те, які звʼязки продукт навчиться бачити першими",
];

const ASK =
  "Користуйся хоча б одним модулем щодня, раз на тиждень кидай три речення чесного фідбеку і тримай терпіння до гострих кутів: це бета, і вони будуть.";

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
  // Гейт бети не має конкурувати в індексі з головною до відкриття CTA-фази
  // (noindex живе в routeMeta.json).
  usePageMeta(ROUTE_META["/beta"]);

  return (
    <>
      <SiteHeader />

      <main>
        <section className="mx-auto w-full max-w-6xl px-5 pb-14 pt-12 sm:px-8 sm:pt-16">
          <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-subtle">
            Закрита бета
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-extrabold uppercase leading-[1.08] tracking-tight text-balance text-foreground-strong sm:text-5xl">
            Бета відкривається хвилями
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted">
            Sergeant вчиться на реальних даних, тому я відкриваю доступ
            поступово, щоб встигати говорити з кожним, хто зайшов.
          </p>
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-16 sm:grid-cols-2 sm:gap-14 sm:px-8">
          <div>
            <h2 className="border-b-2 border-foreground-strong pb-2.5 font-display text-xs font-bold uppercase tracking-[0.08em] text-foreground-strong">
              Що отримуєш
            </h2>
            <ul className="mt-4 flex flex-col gap-4">
              {GIVE.map((item) => (
                <li
                  key={item}
                  className="flex items-baseline gap-2.5 text-sm font-semibold leading-relaxed text-foreground-strong"
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 translate-y-px bg-foreground-strong"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="border-b-2 border-cardline-strong pb-2.5 font-display text-xs font-bold uppercase tracking-[0.08em] text-subtle">
              Що прошу натомість
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
              {ASK}
            </p>
          </div>
        </section>

        <section className="bg-ink py-16 sm:py-20">
          <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
            <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-ink-text sm:text-3xl">
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
          <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-3xl">
            Коротко про бету
          </h2>
          <div className="border-b border-cardline">
            {MINI_FAQ.map((item) => (
              <div key={item.q} className="border-t border-cardline py-5">
                <h3 className="font-bold text-foreground-strong">{item.q}</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                  {item.a ?? (
                    <>
                      Чесний список – у розділі{" "}
                      <a
                        href="/#status"
                        className="text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                      >
                        «Доповідь про стан»
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
