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
  "Оцінка зусилля від 1 до 10 на кожен підхід, за бажанням.",
  "Орієнтир максимуму на одне повторення: вага × (1 + повторення / 30).",
  "Заміри тіла: вага, відсоток жиру, обхвати шиї, грудей, талії, стегон, біцепса, передпліччя, стегна й литки, парні окремо зліва і справа.",
  "Сон, енергія й настрій: короткий журнал самопочуття. У розрахунок відновлення входять сон і енергія.",
  "Тижнева серія: скільки тижнів поспіль ти тренувався не менше, ніж запланував.",
];

const PRACTICE_NOTES = [
  "Позначити можна кроком «Щось болить?» після тренування або на сторінці «Тіло». Зон можна обрати кілька.",
  "Зняти позначку можна лише вручну, на сторінці «Тіло».",
  "Після зняття калькулятор ще якийсь час рахує від зниженого орієнтира.",
];

const NOT_YET = [
  "Не веде програму за тебе. Програми з каталогу знають розклад і вправи дня, але не планують наступний тиждень і розвантаження. Вагу наступного підходу застосунок підкаже, коли закриєш діапазон повторень.",
  "Не має окремих категорій бігу, кардіо і йоги. Це трекер підходів: силових, на час або на дистанцію.",
  "Не враховує оцінку зусилля у втомі: пʼять підходів на межі й пʼять упівсили дають однакову втому.",
  "Не діагностує й не лікує. Позначка болю лише прибирає навантаження з порад.",
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
        Модуль <span className="font-sans">·</span> Фізрук
      </p>
      <h1 className="mt-4 font-display text-4xl font-extrabold uppercase leading-[1.06] tracking-tight text-foreground-strong sm:text-5xl">
        Щоденник тренувань
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-muted">
        Фізрук веде журнал підходів, рахує тоннаж і рекорди і підказує, яким
        мʼязам ще рано. Найкраще він знає силові. Перед порадою показує, чого
        про тебе не знає.
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
          Записуєш підходи: вагу і повторення. Для вправ на час чи дистанцію –
          час або дистанцію. Розминку, дроп-сет і підхід до відмови можна
          позначити, розминка не йде в обʼєм і рекорди.
        </p>
        <ul className="mt-6 flex max-w-2xl flex-col gap-2.5">
          {METRICS.map((metric) => (
            <li
              key={metric}
              className="flex items-baseline gap-2.5 text-[15px] leading-relaxed text-muted"
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
          Серія тижнева, щоб день відпочинку її не ламав. Тиждень починається з
          понеділка, і поки він триває, видно «1 з 2 цього тижня».
        </p>
        <p className={body}>
          Якщо силового підходу у вправі довго не було, рекорд позначається як
          застарілий, і калькулятор робочої ваги рахує обережніше. Після перерви
          таблиця рекордів показує, на скільки відсотків ти нижче за пік.
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
          рахується навантаження: основна група у вправі важить більше за
          допоміжну, і втома згасає з часом. Сон і енергія трохи прискорюють або
          сповільнюють відновлення.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Позначка болю прибирає вправу, а не мʼяз</h2>
        <p className={body}>
          Крім 18 мʼязових груп, позначити можна девʼять зон: плечовий суглоб,
          лікоть, запʼясток, кульшовий суглоб, коліно, гомілковостоп, ахіллове
          сухожилля, поперек і шийний відділ.
        </p>
        <p className={body}>
          Кожна вправа каталогу знає, які зони навантажує, і позначка прибирає
          всі вправи, що їх зачіпають, за мʼязом або за зоною. Без зон біль у
          плечі довелось би записати як передню дельту, і жим лежачи лишився б у
          порадах.
        </p>
        <h3 className={h3}>На практиці</h3>
        <ul className="mt-4 flex max-w-2xl flex-col gap-3">
          {PRACTICE_NOTES.map((note) => (
            <li
              key={note}
              className="flex items-baseline gap-2.5 text-[15px] leading-relaxed text-muted"
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
          Своя вправа не має мапи зон, її перевіряє лише позначка мʼяза.
          Застосунок про це попереджає.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Чого застосунок про твоє відновлення не знає</h2>
        <p className={body}>Це видно ще до поради.</p>
        <ol className="mt-8 flex flex-col gap-5">
          <li className="border-t border-cardline pt-4">
            <h3 className="mt-1 text-lg font-bold text-foreground-strong">
              Журнал самопочуття старіє
            </h3>
            <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">
              Давній запис про сон чи енергію в розрахунок не йде, і застосунок
              пише: «Журнал самопочуття застарів». Сон і енергія старіють
              окремо.
            </p>
          </li>
          <li className="border-t border-cardline pt-4">
            <h3 className="mt-1 text-lg font-bold text-foreground-strong">
              Порада рахується з того, що є на цьому пристрої
            </h3>
            <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">
              Поруч видно, коли востаннє приїхали зміни з інших пристроїв і чи є
              свої, ще не відправлені. Якщо стан невідомий, застосунок пише:
              «Цей пристрій давно не синхронізувався. Якщо ти тренувався з
              телефону, тут цього ще не видно».
            </p>
          </li>
          <li className="border-t border-cardline pt-4">
            <h3 className="mt-1 text-lg font-bold text-foreground-strong">
              Пороги підібрані на одному тілі
            </h3>
            <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">
              Числа, за якими група стає жовтою чи червоною, і швидкість, з якою
              втома згасає, підбирались на одній людині. Налаштувати їх під себе
              поки не можна, про це написано під карткою відновлення.
            </p>
          </li>
        </ol>
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-subtle">
          Порада не блокує тренування: рішення завжди за тобою.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Як це виглядає</h2>
        <figure className="mt-6 max-w-[320px]">
          <img
            src="/screens/fizruk.webp"
            alt="Завершене тренування у Фізруку: пʼять вправ, 15 підходів, обʼєм 7 500 кг×повторення і підходи кожної вправи"
            width={390}
            height={844}
            loading="lazy"
            className="paper-shadow w-full rounded-[var(--radius-card)] border border-cardline-strong bg-card"
          />
          <figcaption className="mt-2.5 text-xs text-subtle">
            Фізрук: підсумок тренування з підходами. Екран бети з демо-даними.
          </figcaption>
        </figure>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Чого модуль поки не робить</h2>
        <ul className="mt-6 flex max-w-2xl flex-col gap-3">
          {NOT_YET.map((item) => (
            <li
              key={item}
              className="flex items-baseline gap-2.5 text-[15px] leading-relaxed text-muted"
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
