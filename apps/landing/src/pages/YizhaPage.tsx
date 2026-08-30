import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import TelegramCta from "../components/TelegramCta";

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
  "Не дієтологія й не медицина. Жодних діагнозів, лікувальних дієт і гарантій щодо алергенів: заборона вшита в промпти порад, а не тримається на тоні.",
  "Не замовлення й не оплата. Автономних покупок не буде: оформлення, оплата й доставка лишаються за тобою в каналах магазину.",
  "Промах штрихкоду поки нікуди не записується. Якщо товару немає в базах, ручна форма не збереже його код, тож завтра той самий скан дасть той самий промах.",
  "Комора не нагадує, що продукт закінчується. Списання працює, сигналу про вичерпання поки немає.",
  "Ціль КБЖВ – орієнтир, а не вирок. Модуль показує залишок нейтрально і не має права викликати провину за їжу.",
  "Працює у браузері – на телефоні й компʼютері. Мобільний застосунок теж працює і синхронізується, але його публічний вихід відкладено.",
];

const GUIDES = [
  {
    href: "/guides/kbzhv",
    title: "Як рахувати КБЖВ, коли в базі немає українських продуктів",
    teaser:
      "Штрихкод, українська база і рецепти замість щоденного перебирання інгредієнтів. Плюс чесна відповідь, скільки похибки можна собі дозволити.",
  },
  {
    href: "/guides/foto-kalorii",
    title: "Чи можна порахувати калорії страви з фото – і наскільки це точно",
    teaser:
      "Що фото справді впізнає, а де починає вгадувати, і як Sergeant закриває сліпі місця уточнюючими питаннями. Плюс ієрархія точності від штрихкоду до ока.",
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
      dateModified: "2026-08-31",
      author: { "@type": "Person", name: "Автор Sergeant" },
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
        Підрахунок їжі ламається не на дисципліні, а на пошуку. Третина полиці
        має лише внутрішньомагазинний ваговий код, якого в жодній глобальній
        базі немає, а те, що має справжній штрихкод, часто лежить у базі без
        білків і жирів. Харчування показує, звідки модуль бере числа, у яких
        випадках він каже «приблизно», і де просто зупиняється.
      </p>
      <p className="mt-3 text-sm text-subtle">
        Оновлено{" "}
        <time dateTime="2026-08-31" className="font-semibold">
          31 серпня 2026
        </time>
      </p>

      <section className="mt-14">
        <h2 className={h2}>Усе головне працює без AI</h2>
        <p className={body}>
          Ядро модуля ручне: пошук, штрихкод, збережені прийоми, копіювання
          вчорашнього дня. AI сюди лише додає швидкості, і без нього нічого не
          ламається. Перед зовнішніми джерелами стоять дві власні бази: 7 576
          товарів української полиці, у 2 054 з них повне КБЖВ, і 390 базових
          продуктів у 19 категоріях для того, що продається на вагу. Те, що
          оцінило фото, підписано окремо: коли більшість калорій дня прийшла з
          фото, поруч із сумою стоїть знак ≈.
        </p>
        <p className={body}>
          Прибери AI – і лишиться повний робочий трекер, а не аварія. Штрихкод
          шукає продукт у продуктових базах, а не в мовній моделі. Збережений
          прийом повторюється тапом. Учорашній день копіюється цілком.
        </p>
        <p className={body}>
          Додавання прийому починається з вибору джерела, і джерел чотири
          вкладки: Пошук, Скан, Фото, Своє. Порядок за частотою, а не за
          складністю: більшість прийомів додають пошуком або повтором, а «Своє»
          стоїть останнім, бо це шлях, коли решта не спрацювала.
        </p>
        <h3 className={h3}>Два ручні режими</h3>
        <p className={body}>
          Це рознесено навмисно. Раніше ручний ввід був однією формою з полями
          «Ккал / Білки / Жири / Вуглеводи», а людина з упаковкою в руках читала
          етикетку, тобто значення на 100 г, і вводила їх туди, де очікувалась
          ціла порція. Перемикач одиниці нічого не конвертує сам: він лише
          вирішує, який ввід показати. Тиха конвертація була б рівно тією
          помилкою, проти якої цей екран і переробляли.
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
          Сканер відкривається сам, щойно ти обрав вкладку «Скан»: якщо вхід у
          розділ уже означає намір, зайвий тап на підтвердження цього наміру не
          потрібен. Якщо код помʼятий і не зчитується, за кілька секунд сканер
          каже, чому так буває, і дає кнопку «Ввести вручну».
        </p>
        <p className={body}>
          Якщо прийом додано з позиції комори, комора списує її сама: спожиті
          грами перераховуються в одиницю позиції – грами й кілограми один до
          одного, мілілітри через щільність, штуки через вагу штуки. Позиція
          комори – це картка продукту, а не рядок чека: зверху одне «Молоко · 2
          л», усередині – з чого воно складається. Жирність не втрачається, бо
          молоко 2,6% і молоко 1% відрізняються калорійністю вдвічі, і звести їх
          в один рядок означало б збрехати про калорії.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Дві бази, бо одної не вистачає</h2>
        <p className={body}>
          Перша база – каталог товарів: 7 576 позицій українського зрізу Open
          Food Facts, з них 6 395 зі штрихкодом на префіксі 482 і 2 054 з повним
          КБЖВ. Каталог стоїть перед зовнішніми джерелами не заради швидкості, а
          заради квот: без нього ліміт витрачався б на кожен скан, з ним – лише
          на кожен новий товар. Хіт від зовнішнього джерела дописується назад,
          тож база росте з реальних сканів.
        </p>
        <p className={body}>
          Каталог не віддає рядки, у яких калорійність не сходиться з макросами
          за Атвотером. Такі рядки лишаються в таблиці для розбору, але видати
          їх означало б покласти завідомо хибне число в чийсь день. Реальні
          приклади з посіву: кола з 606 ккал на 100 мл і пластівці з нулем
          калорій при 447 за макросами.
        </p>
        <p className={body}>
          Друга база – 390 базових продуктів у 19 категоріях: огірок, кабачок,
          сир на вагу. Найбільші категорії – овочі й гриби (46), молочні (44),
          фрукти й ягоди (39), мʼясо і птиця (38). Сорок позицій мають куровані
          синоніми, тож «помідор» знаходить те саме, що «томат». Числа тут
          звіряються з макросами за Атвотером ще до коміту, тож друкарська
          помилка в цифрі не доїжджає до чийогось дня.
        </p>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-subtle">
          7 576 – це розмір каталогу, а не кількість товарів із повним КБЖВ.
          Повне КБЖВ мають 2 054 з них.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Третину полиці штрихкод не закриває в принципі</h2>
        <p className={body}>
          Вимір на реальній полиці: 35 зі 104 позицій мають внутрішньомагазинний
          ваговий код. Такий код генерує касовий термінал конкретної мережі, тож
          у глобальних базах його немає й ніколи не буде. Скільки б не ріс
          каталог товарів, ця третина лишиться поза ним назавжди.
        </p>
        <p className={body}>
          Тому базовий продукт шукається назвою, а не кодом. Огірок з ринку – це
          «огірок», а не спроба вгадати ферму. Одне джерело правди живить обидві
          поверхні: сервер засіває ним свою таблицю, застосунок – локальну базу
          для офлайну. Дві окремі копії розійшлись би першою ж правкою, і той
          самий продукт мав би різні числа онлайн і офлайн.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Знак ≈ там, де більшість калорій дня з фото</h2>
        <p className={body}>
          Кожна цифра КБЖВ у журналі несе походження: база, етикетка, ручний
          ввід або фото. Денне кільце рахує, яка частка калорій дня прийшла з
          фото-оцінки – саме за калоріями, а не за кількістю прийомів. Три ручні
          прийоми по 100 ккал плюс одна фотка на 900 ккал – це 75% вгаданого
          дня, а не 25%.
        </p>
        <p className={body}>
          Коли більшість калорій дня прийшла з фото-оцінки, кільце показує ≈
          перед сумою і підпис про це. Той самий підпис іде текстом в
          aria-label, бо знак не може бути єдиним сигналом. Смуга дня рахує ту
          саму частку за тією самою логікою: мінімальна частка на ній не
          округляється до нуля, бо нуль стверджував би «усе з бази», хоч
          здогадка в дні є.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Пропущений обід – це відсутні дані, а не дефіцит</h2>
        <p className={body}>
          Людина, яка забула залогувати обід, не недоїла. Тому день, у якому
          менше трьох записаних прийомів, малюється пунктирним треком, а не
          приглушеним кольором, і текстовий еквівалент іде в aria-label.
        </p>
        <p className={body}>
          У тижневому графіку день без записів несе плаский трек, а не стовпчик:
          раніше він малювався огризком у три пікселі, тобто виглядав так само,
          як день на 50 ккал. Тап по такому дню каже «немає записів», а не «0
          ккал». Середнє під графіком ділиться на дні із записами, а не на сім.
        </p>
        <p className={body}>
          Шкала графіка завжди має названу опору. З ціллю це пунктирна лінія
          цілі й підпис «ціль N», без цілі – підпис «макс N». Доти стелею був
          максимум самого тижня, тож найвищий стовпчик виходив на сто відсотків
          завжди – і при 800 ккал, і при 3 000.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>«Не бачу тут страви»</h2>
        <p className={body}>
          На початку серпня 2026 фото кота ще поверталось у застосунок як
          страва: назва «Кіт», впевненість 100%, нулі в усіх чотирьох числах – і
          кнопка «Зберегти в журнал» під цим усім. Не-їжа потрапляла в денний
          підсумок нарівні з обідом.
        </p>
        <p className={body}>
          Тепер відповідь несе окреме поле «це їжа», і межу тримає код, а не
          слухняність моделі: відмову виводить і явне поле, і відсутність
          будь-якого додатного КБЖВ у моделі, яка це поле проігнорувала. На
          відмові екран каже «Не бачу тут страви» і не пропонує ні збереження,
          ні уточнення порції.
        </p>
        <p className={body}>
          Відмова ще й знає, кого відшила. Категорій рівно три – тварина,
          людина, решта – бо рівно три різні репліки: тваринку пропоную
          погладити, людині – навести камеру на тарілку, для решти лишається
          нейтральний текст. На фото кота модель спрацювала бездоганно: вона
          впізнала кота, і відповідати на це «спробуй інше фото» тим самим
          текстом, що й на розмитому кадрі, було б неправдою.
        </p>
        <p className="mt-5 max-w-2xl border-l-2 border-foreground-strong pl-5 text-sm leading-relaxed text-subtle">
          Нуль у калоріях більше не означає «не знаю»: поки в оцінці лишаються
          невідповіджені питання, плитки показують прочерк замість «0». Склянка
          води і чай без цукру – легальний нуль, і затирати його було б брехнею
          в інший бік.
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
            alt="Екран Харчування: кільце 1250 із 2200 ккал, білки, жири й вуглеводи, тижневий графік і вода за день"
            width={414}
            height={896}
            loading="lazy"
            className="paper-shadow w-full rounded-[var(--radius-card)] border border-cardline-strong bg-card"
          />
          <figcaption className="mt-2.5 text-xs text-subtle">
            Харчування: екран бети, дані з демо-режиму продукту.
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
        <p className="mt-8 text-sm text-subtle">
          Як Харчування звʼязане з рештою сфер –{" "}
          <a
            href="/zvyazky"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            на сторінці про звʼязки
          </a>
          , що вже працює –{" "}
          <a
            href="/stan"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            у доповіді про стан
          </a>
          .
        </p>
        <div className="mt-6">
          <TelegramCta placement="footer" label="Стати в чергу" />
        </div>
      </section>
    </SiteLayout>
  );
}
