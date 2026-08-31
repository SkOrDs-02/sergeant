import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import TelegramCta from "../components/TelegramCta";

const METRICS = [
  "Тоннаж: сума ваги на повторення за тренування й за тиждень. Це внутрішня цифра для розрахунків, а не привід хвалити за обʼєм.",
  "Особисті рекорди по кожній вправі.",
  "Орієнтир одноповторного максимуму за формулою Еплі: вага × (1 + повторення / 30).",
  "Заміри тіла: вага, відсоток жиру, шия, груди, талія, стегна, біцепс, передпліччя, стегно й литка окремо для лівої та правої сторони.",
  "Сон, енергія й настрій – короткий журнал самопочуття. У розрахунок відновлення входять сон і енергія.",
  "Тижнева серія: скільки тижнів поспіль ти дотягував до свого порогу тренувань.",
];

const PRACTICE_NOTES = [
  "Позначити можна у двох місцях: кроком «Щось болить?» після тренування і в блоці на сторінці «Тіло». Обидва входи опційні, зон можна обрати кілька.",
  "Знімається позначка тільки вручну, на сторінці «Тіло». Автозняття немає: позначка діє, доки ти сам її не знімеш.",
  "Зняття не повертає повну пораду миттєво. Якийсь час після цього калькулятор рахує від зниженого орієнтира, бо повернення після болю – окремий стан, а не «продовжуй, де зупинився».",
];

const NOT_YET = [
  "Не веде прогресію. Каталог програм статичний: він знає розклад і вправи дня, але коду, який додає вагу, веде наступний тиждень чи робить розвантаження, немає.",
  "Не має окремих категорій бігу, кардіо і йоги. Сьогодні це силовий трекер.",
  "Не враховує зусилля у формулі втоми. Пʼять підходів на межі й пʼять підходів упівсили дають однакову втому, хоч оцінку зусилля записати можна.",
  "Не діагностує й не лікує. Позначка болю прибирає навантаження з порад – і на цьому все. Медичних порад тут немає.",
  "Не нагадує про забуту позначку. Зону, яку ти позначив і не зняв, ніщо не ревізитує, тож вона мовчки лишається поза порадами.",
  "Працює у браузері – на телефоні й компʼютері. Мобільний застосунок теж працює і синхронізується, але його публічний вихід відкладено.",
];

export default function TrenuvanniaPage() {
  usePageMeta({
    ...ROUTE_META["/trenuvannia"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Щоденник тренувань",
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
      <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-fizruk">
        Модуль · Фізрук
      </p>
      <h1 className="mt-4 font-display text-4xl font-extrabold uppercase leading-[1.06] tracking-tight text-foreground-strong sm:text-5xl">
        Щоденник тренувань
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-muted">
        Фізрук – єдиний модуль, де порада може відгукнутись на тілі, тому
        помилка в «сьогодні краще спину не чіпати» коштує дорожче за помилку в
        будь-якій іншій цифрі. Найглибше сьогодні опрацьовано силові тренування:
        журнал підходів, тоннаж і рекорди. Нижче спершу механіка – що саме
        рахується і звідки береться колір на силуеті, – а потім три речі, яких
        застосунок про твоє відновлення не знає і каже це прямо.
      </p>
      <p className="mt-3 text-sm text-subtle">
        Оновлено{" "}
        <time dateTime="2026-08-31" className="font-semibold">
          31 серпня 2026
        </time>
      </p>

      <section className="mt-14">
        <h2 className={h2}>Що рахується з твого журналу</h2>
        <p className={body}>
          Одиниця запису – підхід: вага і повторення, за бажанням оцінка зусилля
          за Боргом. Із підходів виростає решта.
        </p>
        <ul className="mt-6 flex max-w-2xl flex-col gap-2.5">
          {METRICS.map((metric) => (
            <li
              key={metric}
              className="flex items-baseline gap-2.5 text-sm leading-relaxed text-muted"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 translate-y-px bg-foreground-strong"
              />
              {metric}
            </li>
          ))}
        </ul>
        <p className={body}>
          Серія тут тижнева навмисно. Щоденний лічильник карав би за правильний
          день відпочинку, а відпочинок – частина циклу, не провал. Тиждень
          рахується київський, з понеділка. Поточний тиждень ще триває, тому чіп
          показує прогрес – «1 з 2 цього тижня», – а не нуль і не обрив.
        </p>
        <p className={body}>
          Рекорд не старіє, а от його придатність як орієнтира – так. Якщо
          силового підходу в цій вправі довго не було, число підписується як
          застаріле, і калькулятор робочої ваги рахує від обережнішого
          орієнтира. Застереження вмикається раніше за саме зниження. Після
          перерви борд рекордів показує, що зараз на стільки-то відсотків менше
          за пік, нейтральним тоном, без святкування й без докору.
        </p>
        <p className="mt-3 text-sm text-subtle">
          Тоннаж і одноповторний максимум рахуються лише для силових вправ.
          Бігу, кардіо і йоги як окремих категорій тут поки немає.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Силует замість таблиці</h2>
        <p className={body}>
          Атлас – це силует спереду і ззаду, розбитий на 18 мʼязових груп: шия,
          трапеція, груди, передні й задні дельти, біцепс, трицепс, передпліччя,
          прес, косі, верх і низ спини, сідничні, квадрицепс, біцепс стегна,
          привідні, відвідні, литки.
        </p>
        <p className={body}>
          Кожна група забарвлена станом відновлення: зелена – готова, жовта –
          краще почекати, червона – рано. Колір рахується не з календаря, а з
          навантаження: тоннаж і кількість підходів перетворюються в бали, вага
          групи залежить від того, основна вона у вправі чи допоміжна, і
          накопичене згасає з часом. Сон і енергія цей розрахунок прискорюють
          або сповільнюють у межах невеликого коефіцієнта.
        </p>
        <p className="mt-3 text-sm text-subtle">
          Відновлення – похідна величина. Воно ніде не зберігається: щоразу
          перераховується з історії тренувань і журналу самопочуття.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Позначка болю прибирає вправу, а не мʼяз</h2>
        <p className={body}>
          Позначити можна не лише мʼяз. До 18 груп атласа додано девʼять зон,
          яких мʼязова мапа назвати не вміє: плечовий суглоб, лікоть, запʼясток,
          кульшовий суглоб, коліно, гомілковостоп, ахілл, поперек і шийний
          відділ.
        </p>
        <p className={body}>
          Це не косметика словника. Мʼязова мапа фізично не може назвати суглоб,
          і саме на цьому ламалась суто мʼязова модель. Біль у плечовому суглобі
          довелось би позначити як передню дельту – і жим лежачи, у якого
          основний мʼяз груди, далі спокійно радився б. Тендиніт ліктя ліг би на
          трицепс, а підтягування і тяги лишились би в порадах. У кожному такому
          випадку застосунок звітував би, що травму враховано. Хибне відчуття
          захисту гірше за відсутність фічі.
        </p>
        <p className={body}>
          Тому кожна вправа каталогу має явний перелік навантажених зон,
          записаний руками, а не виведений здогадкою. Вправа зникає з порад,
          якщо активна позначка перетинається з нею або за мʼязом, або за зоною.
          Обіцянка звучить рівно так: не раджу те, що перетинається з позначкою.
        </p>
        <h3 className={h3}>Як це працює на практиці</h3>
        <ul className="mt-4 flex max-w-2xl flex-col gap-3">
          {PRACTICE_NOTES.map((note) => (
            <li
              key={note}
              className="flex items-baseline gap-2.5 text-sm leading-relaxed text-muted"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 translate-y-px bg-foreground-strong"
              />
              {note}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-subtle">
          Для вправи, яку ти створив сам, мапи зон не існує, тож перевірити її
          проти суглобової позначки неможливо – лишається тільки мʼязова. Це
          видно в застосунку.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>
          Три речі, яких застосунок про твоє відновлення не знає
        </h2>
        <p className={body}>
          Ці три рядки стоять у застосунку перед самою порадою, а не після неї.
          Якщо картина неповна, ти маєш дізнатись про це до того, як прочитаєш
          «готово».
        </p>
        <ol className="mt-8 flex flex-col gap-5">
          <li className="border-t border-cardline pt-4">
            <h3 className="mt-1 text-lg font-bold text-foreground-strong">
              Журнал самопочуття протухає
            </h3>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
              Запис про сон чи енергію, що давно не оновлювався, у розрахунку
              більше не враховується, і коефіцієнт відкочується до одиниці.
              Раніше єдине давнє «8,5 год сну» назавжди прискорювало видиме
              відновлення. Тепер «журнал заповнено» і «журнал впливає» – різні
              речі, і застосунок каже про це окремим рядком: «Журнал самопочуття
              застарів». Сон і енергія старіють незалежно один від одного.
            </p>
          </li>
          <li className="border-t border-cardline pt-4">
            <h3 className="mt-1 text-lg font-bold text-foreground-strong">
              Порада рахується з того, що є на цьому пристрої
            </h3>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
              Поруч із нею стоїть стан синхронізації: коли востаннє приїхали
              чужі зміни і чи є свої, які ще не пішли на сервер. Друге без
              першого бреше: щойно синхронізований пристрій із повною чергою теж
              бачить неповну картину, просто з іншого боку. Дефолт при
              невідомому стані – «картина неповна», а не «все гаразд», і тексти
              прямі: «Цей пристрій давно не синхронізувався. Якщо ти тренувався
              з телефону, тут цього ще не видно».
            </p>
          </li>
          <li className="border-t border-cardline pt-4">
            <h3 className="mt-1 text-lg font-bold text-foreground-strong">
              Пороги підібрані на одному тілі
            </h3>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
              Під карткою відновлення стоїть рядок, що це орієнтир, а не
              медичний норматив. Числа, за якими група стає жовтою чи червоною,
              і швидкість, з якою втома згасає, підбирались по одному
              користувачу. Каналу, яким чуже тіло могло б заперечити, поки
              немає: ні калібрування, ні зворотного звʼязку в розрахунку немає.
              Тести перевіряють, що формула рахує однаково, а не що вона рахує
              правильно.
            </p>
          </li>
        </ol>
        <p className="mt-5 max-w-2xl border-l-2 border-foreground-strong pl-5 text-sm leading-relaxed text-subtle">
          Відновлення тут завжди порада, ніколи не гейт. Застосунок не блокує
          старт тренування і не вирішує за тебе.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Чого модуль поки не робить</h2>
        <ul className="mt-6 flex max-w-2xl flex-col gap-3">
          {NOT_YET.map((item) => (
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
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          Тренування – один із чотирьох модулів. Чому продукт мовчить, коли
          звʼязку між сферами не видно –{" "}
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
