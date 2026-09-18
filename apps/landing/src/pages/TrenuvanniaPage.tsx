import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import UpdatedOn from "../components/UpdatedOn";
import TelegramCta from "../components/TelegramCta";
import ModuleFooterLinks from "../components/ModuleFooterLinks";
import { AUTHOR_JSON_LD } from "../content/author";
import { MOBILE_CLAIM } from "../content/mobileClaim";

const METRICS = [
  "Тоннаж: вага × повторення за тренування і за тиждень.",
  "Особисті рекорди по кожній вправі.",
  "Оцінка зусилля за Боргом, 1–10, необовʼязкова, окремо на кожен підхід.",
  "Орієнтир одноповторного максимуму за формулою Еплі: вага × (1 + повторення / 30).",
  "Заміри тіла: вага, відсоток жиру, обхвати шиї, грудей, талії, стегон, біцепса, передпліччя, стегна й литки, парні окремо для лівої та правої сторони.",
  "Сон, енергія й настрій: короткий журнал самопочуття. У розрахунок відновлення входять сон і енергія.",
  "Тижнева серія: скільки тижнів поспіль ти дотягував до свого порогу тренувань.",
];

const PRACTICE_NOTES = [
  "Позначити можна у двох місцях: кроком «Щось болить?» після тренування і в блоці на сторінці «Тіло». Обидва входи опційні, зон можна обрати кілька.",
  "Знімається позначка тільки вручну, на сторінці «Тіло». Автозняття немає.",
  "Зняття не повертає повну пораду миттєво: якийсь час калькулятор рахує від зниженого орієнтира.",
];

const NOT_YET = [
  "Не веде програму за тебе. Каталог програм статичний: знає розклад і вправи дня, але не планує наступний тиждень і не робить розвантажень. Вагу наступного підходу застосунок підкаже, коли ти закрив діапазон повторень.",
  "Не має окремих категорій бігу, кардіо і йоги. Сьогодні це силовий трекер.",
  "Не враховує зусилля у втомі. Оцінку за Боргом можна поставити на підхід, але формула втоми її ще не читає: пʼять підходів на межі й пʼять упівсили дають однакову втому.",
  "Не діагностує й не лікує. Позначка болю прибирає навантаження з порад, і на цьому все.",
  "Не нагадує про забуту позначку. Зона, яку ти позначив і не зняв, мовчки лишається поза порадами.",
  MOBILE_CLAIM,
];

export default function TrenuvanniaPage() {
  usePageMeta({
    ...ROUTE_META["/trenuvannia"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Щоденник тренувань",
      inLanguage: "uk",
      dateModified: ROUTE_META["/trenuvannia"].lastmod,
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
      <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-fizruk">
        Модуль · Фізрук
      </p>
      <h1 className="mt-4 font-display text-4xl font-extrabold uppercase leading-[1.06] tracking-tight text-foreground-strong sm:text-5xl">
        Щоденник тренувань
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-muted">
        Фізрук веде журнал підходів, рахує тоннаж і рекорди і підказує, яким
        мʼязам ще рано. Найглибше опрацьовано силові тренування. Порада про тіло
        коштує дорожче за будь-яку іншу цифру, тому сторінка називає і те, чого
        застосунок про тебе не знає.
      </p>
      <p className="mt-3 text-sm text-subtle">
        Оновлено{" "}
        <UpdatedOn
          iso={ROUTE_META["/trenuvannia"].lastmod}
          className="font-semibold"
        />
      </p>

      <section className="mt-14">
        <h2 className={h2}>Що рахується з твого журналу</h2>
        <p className={body}>
          Одиниця запису – підхід: вага і повторення. Із підходів виростає
          решта.
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
          Серія тижнева: щоденний лічильник карав би за день відпочинку. Тиждень
          починається з понеділка, і поки він триває, чіп показує «1 з 2 цього
          тижня».
        </p>
        <p className={body}>
          Рекорд не старіє, але його придатність як орієнтира має строк: якщо
          силового підходу в цій вправі довго не було, число підписується як
          застаріле, і калькулятор робочої ваги рахує обережніше. Після перерви
          борд рекордів показує, на скільки відсотків ти нижче за пік.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Силует замість таблиці</h2>
        <p className={body}>
          Атлас показує силует спереду і ззаду, розбитий на 18 мʼязових груп:
          шия, трапеція, груди, передні й задні дельти, біцепс, трицепс,
          передпліччя, прес, косі, верх і низ спини, сідничні, квадрицепс,
          біцепс стегна, привідні, відвідні, литки.
        </p>
        <p className={body}>
          Колір групи означає стан відновлення: зелена готова, жовта краще
          зачекати, червона ще рано. Перші дні після тренування колір задає
          календар: сьогодні й учора червона, до трьох днів жовта. Далі
          рахується навантаження: тоннаж і підходи стають балами, основна група
          у вправі важить більше за допоміжну, і накопичене згасає з часом. Сон
          і енергія цей розрахунок прискорюють або сповільнюють у межах
          невеликого коефіцієнта.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Позначка болю прибирає вправу, а не мʼяз</h2>
        <p className={body}>
          Крім 18 мʼязових груп, позначити можна девʼять зон: плечовий суглоб,
          лікоть, запʼясток, кульшовий суглоб, коліно, гомілковостоп, ахілл,
          поперек і шийний відділ.
        </p>
        <p className={body}>
          Без них біль у плечі довелось би записати як передню дельту, і жим
          лежачи далі радився б. Тому кожна вправа каталогу має перелік
          навантажених зон, і позначка прибирає всі вправи, що з нею
          перетинаються, за мʼязом або за зоною.
        </p>
        <h3 className={h3}>На практиці</h3>
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
          Для вправи, яку ти створив сам, мапи зон немає: її перевіряє лише
          мʼязова позначка, і застосунок про це каже.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Чого застосунок про твоє відновлення не знає</h2>
        <p className={body}>
          Застосунок показує це перед порадою, до слова «готово».
        </p>
        <ol className="mt-8 flex flex-col gap-5">
          <li className="border-t border-cardline pt-4">
            <h3 className="mt-1 text-lg font-bold text-foreground-strong">
              Журнал самопочуття старіє
            </h3>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
              Запис про сон чи енергію, що давно не оновлювався, у розрахунку не
              враховується, і застосунок каже це окремим рядком: «Журнал
              самопочуття застарів». Сон і енергія старіють незалежно один від
              одного.
            </p>
          </li>
          <li className="border-t border-cardline pt-4">
            <h3 className="mt-1 text-lg font-bold text-foreground-strong">
              Порада рахується з того, що є на цьому пристрої
            </h3>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
              Поруч із нею стоїть стан синхронізації: коли востаннє приїхали
              чужі зміни і чи є свої, які ще не пішли на сервер. При невідомому
              стані застосунок вважає картину неповною і пише: «Цей пристрій
              давно не синхронізувався. Якщо ти тренувався з телефону, тут цього
              ще не видно».
            </p>
          </li>
          <li className="border-t border-cardline pt-4">
            <h3 className="mt-1 text-lg font-bold text-foreground-strong">
              Пороги підібрані на одному тілі
            </h3>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
              Числа, за якими група стає жовтою чи червоною, і швидкість, з якою
              втома згасає, підбирались на одній людині. Калібрування під себе
              поки немає, і під карткою відновлення про це написано.
            </p>
          </li>
        </ol>
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-subtle">
          Порада не блокує тренування: рішення завжди за тобою.
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
        <ModuleFooterLinks />
        <div className="mt-6">
          <TelegramCta placement="footer" label="Стати в чергу" />
        </div>
      </section>
    </SiteLayout>
  );
}
