import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import UpdatedOn from "../components/UpdatedOn";
import TelegramCta from "../components/TelegramCta";
import ModuleFooterLinks from "../components/ModuleFooterLinks";
import { AUTHOR_JSON_LD } from "../content/author";
import { MOBILE_CLAIM } from "../content/mobileClaim";
import { FREE_LIMITS } from "../content/freeLimitsClaim";

const FORMATS = [
  {
    title: "З упаковки",
    subtitle: "Упаковка з таблицею на 100 г",
    text: "КБЖВ на 100 г і скільки зʼїв.",
  },
  {
    title: "Готова страва",
    subtitle: "Готова тарілка без жодних цифр",
    text: "КБЖВ за всю порцію.",
  },
];

const BOUNDARIES = [
  "Не дієтологія й не медицина: без діагнозів, лікувальних дієт і гарантій щодо алергенів.",
  "Не купує сам: оформлення й оплата лишаються тобі в застосунку магазину.",
  "Промах штрихкоду не запамʼятовується сам: привʼязати код до продукту можна руками, але картка промаху цього не пропонує, і без привʼязки наступний скан того ж коду знову нічого не знайде.",
  "Комора не шле сповіщень: позиція, що вичерпується, дістає бейдж «Закінчується» і сама підмішується в список покупок, але push-нагадування немає.",
  "Ціль КБЖВ лишається орієнтиром: залишок показується без оцінок.",
  MOBILE_CLAIM,
];

const GUIDES = [
  {
    href: "/guides/kbzhv",
    title: "Як рахувати КБЖВ, коли в базі немає українських продуктів",
    teaser:
      "Штрихкод, українська база і рецепти замість щоденного перебирання інгредієнтів. Плюс скільки похибки можна собі дозволити.",
  },
  {
    href: "/guides/foto-kalorii",
    title: "Чи можна порахувати калорії страви з фото – і наскільки це точно",
    teaser:
      "Що фото справді впізнає, а де починає вгадувати, і як Сержант закриває сліпі місця уточнювальними питаннями. Плюс ієрархія точності від штрихкоду до ока.",
  },
];

export default function YizhaPage() {
  usePageMeta({
    ...ROUTE_META["/yizha"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Харчування: що рахує код, а що вгадує модель",
      inLanguage: "uk",
      dateModified: ROUTE_META["/yizha"].lastmod,
      author: AUTHOR_JSON_LD,
      publisher: { "@type": "Organization", name: "Sergeant" },
    },
  });

  const h2 =
    "font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-3xl";
  const body = "mt-3 max-w-2xl leading-relaxed text-muted";
  const h3 = "mt-8 text-lg font-bold text-foreground-strong";

  return (
    <SiteLayout mainClassName="mx-auto w-full max-w-6xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
      <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-nutrition">
        Модуль · Харчування
      </p>
      <h1 className="mt-4 font-display text-4xl font-extrabold uppercase leading-[1.06] tracking-tight text-foreground-strong sm:text-5xl">
        Харчування: що рахує код, а що вгадує модель
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-muted">
        Підрахунок їжі ламається на пошуку: третини полиці немає в жодній
        міжнародній базі, а те, що є, часто лежить без білків і жирів.
        Харчування має власну українську базу, штрихкод, збережені страви і фото
        з уточненнями. Далі – звідки береться кожне число і де модуль каже
        «приблизно».
      </p>
      <p className="mt-3 text-sm text-subtle">
        Оновлено{" "}
        <UpdatedOn
          iso={ROUTE_META["/yizha"].lastmod}
          className="font-semibold"
        />
      </p>

      <section className="mt-14">
        <h2 className={h2}>Усе головне працює без AI</h2>
        <p className={body}>
          Ядро модуля ручне: пошук, штрихкод, збережені прийоми, копіювання
          вчорашнього дня. AI лише додає швидкості. Джерел чотири: Пошук, Скан,
          Фото, Своє.
        </p>
        <p className={body}>
          Одне уточнення про фото: у безкоштовному плані розпізнавання страви зі
          знімка обмежене {FREE_LIMITS.aiPhoto} фото на тиждень, Premium цей
          ліміт знімає. Пошук, штрихкод, збережені страви й ручний ввід – без
          лімітів, і на них тримається весь облік. Фото прискорює, але не є
          умовою.
        </p>
        <h3 className={h3}>Два ручні режими</h3>
        <p className={body}>
          З упаковки, де числа на 100 г, і готова страва, де числа на порцію.
          Перемикач нічого не перераховує сам, щоб значення з етикетки не
          потрапили туди, де очікують цілу порцію.
        </p>
        <div className="mt-6 grid gap-px bg-cardline-strong sm:grid-cols-2">
          {FORMATS.map((mode) => (
            <div key={mode.title} className="bg-background p-6">
              <h3 className="text-xl font-bold leading-tight text-foreground-strong">
                {mode.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-subtle">
                {mode.subtitle}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {mode.text}
              </p>
            </div>
          ))}
        </div>
        <p className={body}>
          Сканер відкривається одразу у вкладці «Скан». Якщо код не читається,
          за кілька секунд зʼявиться кнопка «Ввести вручну».
        </p>
        <p className={body}>
          Страва з комори списується з неї сама: грами, мілілітри чи штуки
          перераховуються в одиницю позиції. Молоко 2,6% і молоко 1% – різні
          картки: жиру в них різниться більш ніж удвічі, і калорійність теж
          інша.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Дві бази продуктів</h2>
        <p className={body}>
          Каталог товарів: 7 576 позицій української полиці, з них 6 395 зі
          штрихкодом і 2 054 з повним КБЖВ. Він росте з реальних сканів: товар,
          знайдений у зовнішньому джерелі, дописується назад. Рядки, де калорії
          не сходяться з білками, жирами і вуглеводами, каталог не показує: кола
          з 606 ккал на 100 мл у чийсь день не потрапить.
        </p>
        <p className={body}>
          Базові продукти: 430 позицій у 21 категорії для всього, що продається
          на вагу. Найбільші категорії – молочні (47), фрукти й ягоди (42),
          мʼясо і птиця (41), овочі й гриби (41). Сорок сім позицій мають
          синоніми, тож «помідор» знаходить те саме, що «томат».
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Третина полиці без штрихкоду</h2>
        <p className={body}>
          На реальній полиці 35 зі 104 позицій мають лише ваговий код магазину,
          якого в базах немає. Тому базовий продукт шукається назвою: огірок з
          ринку записується як «огірок».
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Знак ≈ там, де більшість калорій дня з фото</h2>
        <p className={body}>
          Кожна цифра КБЖВ у журналі несе походження: база, етикетка, ручний
          ввід або фото. Денне кільце рахує частку калорій дня, що прийшла з
          фото-оцінки, і рахує саме за калоріями: три ручні прийоми по 100 ккал
          плюс одна фотка на 900 ккал дають 75% вгаданого дня.
        </p>
        <p className={body}>
          Коли більшість калорій дня прийшла з фото, кільце показує ≈ перед
          сумою і підпис про це. Смуга дня рахує ту саму частку.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Пропущений обід означає відсутні дані</h2>
        <p className={body}>
          Людина, яка забула записати обід, не недоїла. Тому день, у якому менше
          трьох записаних прийомів, малюється пунктирним треком.
        </p>
        <p className={body}>
          У тижневому графіку день без записів – плаский трек, і тап по ньому
          каже «немає записів». Середнє під графіком ділиться на дні із
          записами. Шкала має названу опору: пунктир цілі з підписом «ціль N»
          або, без цілі, «макс N».
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>«Не бачу тут страви»</h2>
        <p className={body}>
          Фото кота колись поверталось як страва «Кіт» з нулями в КБЖВ і кнопкою
          «Зберегти». Не-їжу модуль відсіює: каже «Не бачу тут страви», без
          порції і без збереження.
        </p>
        <p className={body}>
          Нуль калорій лишається нулем лише там, де він справжній: склянка води,
          чай без цукру. Поки в оцінці є питання без відповіді, плитки показують
          прочерк замість «0».
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Чого модуль не робить</h2>
        <ul className="mt-6 flex max-w-2xl flex-col gap-3">
          {BOUNDARIES.map((item) => (
            <li
              key={item}
              className="flex items-baseline gap-2.5 text-sm leading-relaxed text-muted"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 translate-y-px bg-foreground-strong"
              />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-subtle">
          Куди їдуть фото страв і що взагалі бачить Sergeant –{" "}
          <a
            href="/data"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            на сторінці «Твої дані»
          </a>
          . Перше фото завжди чекає явного «Зрозуміло»: перевірка кадру
          відбувається до відправлення.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Як це виглядає</h2>
        <figure className="mt-6 max-w-[320px]">
          <img
            src="/screens/nutrition.webp"
            alt="Екран Харчування: кільце 1 250 із 2 200 ккал, білки, жири й вуглеводи, тижневий графік і вода за день"
            width={414}
            height={896}
            loading="lazy"
            className="paper-shadow w-full rounded-[var(--radius-card)] border border-cardline-strong bg-card"
          />
          <figcaption className="mt-2.5 text-xs text-subtle">
            Харчування: екран бети з демо-даними.
          </figcaption>
        </figure>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Далі про їжу</h2>
        <div className="mt-6 border-b border-cardline">
          {GUIDES.map((guide) => (
            <a
              key={guide.href}
              href={guide.href}
              className="group block border-t border-cardline py-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <h3 className="max-w-2xl text-lg font-bold leading-snug text-foreground-strong group-hover:underline">
                {guide.title}
              </h3>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
                {guide.teaser}
              </p>
            </a>
          ))}
        </div>
        <ModuleFooterLinks />
        <div className="mt-6">
          <TelegramCta placement="footer" label="Стати в чергу" />
        </div>
      </section>
    </SiteLayout>
  );
}
