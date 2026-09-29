import { THREADS_URL } from "../lib/links";
import SiteLayout from "../components/SiteLayout";
import TelegramCta from "../components/TelegramCta";
import { telegramStartLink } from "../lib/links";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import { AUTHOR_NAME } from "../content/author";
import { MOBILE_CLAIM } from "../content/mobileClaim";

export default function AboutPage() {
  usePageMeta({
    ...ROUTE_META["/about"],
    // `SoftwareApplication` поїхав на головну, де він жанрово на місці:
    // два описи одного продукту конкурували б за той самий субʼєкт.
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: "Що таке Sergeant",
      inLanguage: "uk",
      description:
        "Навіщо існує Sergeant, хто його робить і чому продукт влаштований саме так.",
    },
  });

  return (
    <SiteLayout>
      <section className="mx-auto w-full max-w-6xl px-5 pb-10 pt-12 sm:px-8 sm:pt-16">
        <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-subtle">
          Про проєкт
        </p>
        <h1 className="mt-4 font-display text-4xl font-extrabold uppercase leading-[1.06] tracking-tight text-foreground-strong sm:text-5xl">
          Що таке Sergeant
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-foreground">
          Sergeant – український застосунок, який тримає гроші, тіло, звички й
          харчування в одному приватному просторі та показує звʼязки між ними.
        </p>
      </section>

      <section className="mx-auto grid w-full max-w-6xl items-start gap-10 px-5 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
        <div className="flex max-w-2xl flex-col gap-5">
          <p className="leading-relaxed text-foreground">
            Я роками трекав життя в чотирьох застосунках: банк, тренування,
            звички, їжа. Кожен показував свої цифри, і жоден не бачив картину
            цілком. Найцікавіше ховалось на стиках: чому в тижні без тренувань
            більшає доставки, чому зірваний сніданок тягне за собою зірваний
            день.
          </p>
          <p className="leading-relaxed text-foreground">
            Тому я роблю Sergeant: місце, де чотири сфери бачать одна одну.
            Користуюсь ним щодня сам і викладаю процес розробки відкрито.
          </p>
          <p className="text-subtle">– {AUTHOR_NAME}, автор Sergeant</p>
        </div>
        <figure className="paper-shadow rotate-[1.2deg] rounded-[var(--radius-card)] bg-note px-7 py-6">
          <blockquote className="text-lg font-medium leading-normal text-foreground sm:text-xl">
            «Трекери зазвичай або тренери-мотиватори, або бухгалтери. Мені був
            потрібен сержант: той, хто щодня поруч, тримає лад і каже як є»
          </blockquote>
        </figure>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8">
        <div className="flex max-w-2xl flex-col gap-10">
          <div>
            <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-2xl">
              Чому саме чотири сфери
            </h2>
            <p className="mt-4 leading-relaxed text-foreground">
              Сфер, які можна трекати, значно більше: сон, настрій, читання,
              вода, робочі години. У Sergeant їх чотири, і критерій один: сфера
              щодня лишає сліди без зусиль з твого боку і помітно тягне інші.
            </p>
            <p className="mt-4 leading-relaxed text-foreground">
              Гроші лишають слід самі, бо їх записує банк. Їжа, тренування і
              звички записуються за секунди й одразу дають матеріал для
              порівняння. Усі чотири перетинаються: тиждень без тренувань видно
              в доставці, зірваний сніданок у вечірній витраті. Пʼята сфера, яка
              ні на що не впливає, зробила б продукт довшим, не кориснішим.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-2xl">
              Як я його роблю
            </h2>
            <p className="mt-4 leading-relaxed text-foreground">
              Сам, щодня і на собі. Кожна можливість спершу мусить закрити мою
              власну незручність, інакше вона не пишеться: у продукті без
              команди це єдиний фільтр, який не дає розповзтись на всі боки.
            </p>
            <p className="mt-4 leading-relaxed text-foreground">
              {MOBILE_CLAIM} Обіцяти два повноцінні контури одночасно не буду.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-2xl">
              Звідки назва
            </h2>
            <p className="mt-4 leading-relaxed text-foreground">
              Сержант не мотивує промовами і не веде облік заради обліку. Він
              щодня поруч, тримає лад і каже як є, навіть коли цифра неприємна.
              Тому продукт не святкує дрібниць і не соромить за пропуск:
              показує, що сталось, і мовчить, коли сказати нема чого.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8">
        <p className="max-w-2xl leading-relaxed text-muted">
          Обіцянки продукту зібрані у{" "}
          <a
            href="/obitsyanky"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            розділі «Що обіцяю»
          </a>
          . Що Sergeant бачить і де лежать твої дані: сторінка{" "}
          <a
            href="/data"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            «Твої дані»
          </a>
          .
        </p>
      </section>

      <section className="bg-ink py-14 text-ink-text sm:py-16">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight sm:text-3xl">
            Стеж за розробкою
          </h2>
          <p className="mt-4 max-w-lg leading-relaxed text-ink-muted">
            Процес відкритий: реальні цифри, помилки і рішення. Обирай формат.
          </p>
          <div className="mt-8 grid max-w-3xl gap-10 sm:grid-cols-2">
            <a
              href={THREADS_URL}
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
                <span className="font-display text-base font-bold uppercase tracking-[0.06em] text-ink-text group-hover:underline">
                  Threads
                </span>
              </span>
              <span className="mt-2 block text-sm leading-relaxed text-ink-muted">
                Короткі думки й спостереження по ходу. @sergeant.app
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
                <span className="font-display text-base font-bold uppercase tracking-[0.06em] text-ink-text group-hover:underline">
                  Telegram
                </span>
              </span>
              <span className="mt-2 block text-sm leading-relaxed text-ink-muted">
                Бот бети: найшвидший шлях у чергу й новини хвиль.
              </span>
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-8 px-5 py-16 sm:px-8 lg:flex-row lg:items-center">
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-balance text-foreground-strong sm:text-3xl">
            Черга в бету
          </h2>
          <p className="max-w-lg leading-relaxed text-pretty text-muted">
            Бета відкривається хвилями. Стань у чергу, і я напишу, коли
            відкриється твоя.
          </p>
          <p className="text-sm text-subtle">
            Ядро безкоштовне назавжди · Твої дані залишаються твоїми
          </p>
        </div>
        <TelegramCta placement="beta" label="Стати в чергу" />
      </section>
    </SiteLayout>
  );
}
