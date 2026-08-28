import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";

const SITUATIONS = [
  {
    when: "Магазинний товар з етикеткою",
    what: "Штрихкод. Склад уже надрукований на упаковці, лишається його зчитати.",
  },
  {
    when: "Локальний бренд, якого немає в базі",
    what: "Внести один раз руками з етикетки. Далі він твій і шукається за назвою.",
  },
  {
    when: "Ваговий товар з ринку",
    what: "Брати базовий продукт («сир кисломолочний 9%»), а не шукати конкретну ферму.",
  },
  {
    when: "Домашня страва на кілька днів",
    what: "Зважити раз усю каструлю і зберегти як рецепт.",
  },
  {
    when: "Порція в кафе",
    what: "Оцінка на око. Це найбільша похибка дня, і з нею доводиться жити.",
  },
];

const STEPS = [
  "Випиши 10–15 продуктів, які ти їси майже щодня. Зазвичай саме вони дають більшу частину калорій за тиждень. Заведи їх уважно: це той список, який працюватиме роками.",
  "Перший тиждень зважуй. Річ не в дисципліні: око систематично занижує порцію крупи і завищує порцію овочів, і свій особистий зсув краще дізнатися на старті, а не на другому місяці.",
  "Домашні страви записуй рецептом, а не набором інгредієнтів щоразу. Борщ, який ти вариш кожні десять днів, має бути одним записом. Кожне повторне перебирання буряка з квасолею наближає той день, коли ти закинеш облік.",
  "Дивись на середнє за тиждень. Один день не означає нічого: сіль, вода і час зважування рухають вагу сильніше, ніж 200 ккал різниці в записах.",
];

const SHORT_ANSWER =
  "Підрахунок ламається на пошуку, а не на арифметиці: у міжнародних базах немає половини того, що лежить у твоєму холодильнику. Майже всі випадки закривають три речі: сканер штрихкоду для всього, що має етикетку, українська база для локальних брендів і одна збережена картка на кожну домашню страву, яку ти готуєш регулярно. Точність до грама тут зайва: стабільна похибка все одно показує правильний напрямок.";

export default function GuideKbzhuPage() {
  usePageMeta({
    ...ROUTE_META["/guides/kbzhu"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: "Як рахувати КБЖУ, коли в базі немає українських продуктів",
      inLanguage: "uk",
      dateModified: "2026-08-28",
      step: STEPS.map((text, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        text,
      })),
    },
  });

  const h2 =
    "font-display text-xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-2xl";

  return (
    <>
      <SiteHeader />

      <main>
        <article className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 pb-20 pt-12 sm:px-8 sm:pt-16">
          <div>
            <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-subtle">
              Гайди · Харчування
            </p>
            <h1 className="mt-4 text-3xl font-extrabold leading-[1.12] tracking-tight text-balance text-foreground-strong sm:text-4xl">
              Як рахувати КБЖУ, коли в базі немає українських продуктів
            </h1>
            <p className="mt-4 text-sm text-subtle">
              Оновлено 28.08.2026 · автор Sergeant
            </p>
          </div>

          <div className="rounded-[var(--radius-card)] bg-ink px-7 py-6">
            <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-ink-muted">
              Коротка відповідь
            </p>
            <p className="mt-2.5 font-semibold leading-relaxed text-ink-text">
              {SHORT_ANSWER}
            </p>
          </div>

          <section>
            <h2 className={h2}>Де саме ламається підрахунок</h2>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <span className="hidden border-b border-cardline-strong py-2.5 text-xs font-semibold uppercase tracking-wide text-subtle sm:block">
                Ситуація
              </span>
              <span className="hidden border-b border-cardline-strong py-2.5 text-xs font-semibold uppercase tracking-wide text-subtle sm:block">
                Що з нею робити
              </span>
              {SITUATIONS.map((row) => (
                <div key={row.when} className="contents">
                  <span className="pt-3.5 text-sm font-bold text-foreground sm:border-b sm:border-cardline sm:py-3.5 sm:pr-6 sm:font-semibold">
                    {row.when}
                  </span>
                  <span className="border-b border-cardline pb-3.5 pt-1 text-sm leading-relaxed text-muted sm:py-3.5">
                    {row.what}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
              Помітно, що жоден рядок не вимагає ідеальної бази даних. Вимагає
              він одного: щоб продукти, які ти їси щотижня, були заведені
              акуратно, а решта заповнювалася приблизно.
            </p>
          </section>

          <section>
            <h2 className={h2}>Чотири кроки, які робиш один раз</h2>
            <ol className="mt-5 flex flex-col gap-3.5">
              {STEPS.map((step, i) => (
                <li
                  key={i}
                  className="flex gap-4 leading-relaxed text-foreground"
                >
                  <span className="shrink-0 font-bold text-foreground-strong">
                    {i + 1}.
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className={h2}>Скільки похибки можна собі дозволити</h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
              Похибка, яка стабільна, майже не заважає. Якщо ти щоразу занижуєш
              олію на однакову величину, тренд лишається чесним, бо ти порівнюєш
              тиждень із тижнем, а не з ідеалом. Псує справу похибка, що
              стрибає: пів тижня зважуєш, пів тижня оцінюєш на око, і два числа
              поруч уже про різні речі.
            </p>
            <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
              Друге правило простіше. Якщо один запис займає більше 20 секунд,
              на третьому тижні ти його не зробиш. Швидкість тут важливіша за
              точність: повний тиждень приблизних записів дає кращу картину, ніж
              три бездоганні дні і тиша до наступного понеділка.
            </p>
            <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
              І про очікування. Перші кілька днів цифри виглядають хаотично, бо
              ти ще калібруєш і себе, і базу. Сенс зʼявляється на дистанції в
              кілька тижнів, коли видно не окремий обід, а звичну структуру
              тижня: де насправді сидять калорії і що з цього ти навіть не
              помічав.
            </p>
          </section>

          <div className="flex flex-col gap-2.5 border-t border-cardline pt-6">
            <p className="text-sm leading-relaxed text-muted">
              У Харчуванні типовий запис займає кілька секунд: штрихкод для
              магазинного товару, фото страви, українська база продуктів. Поруч
              у тому самому просторі живуть фінанси, тренування і звички, тому
              тижневий підсумок може показати звʼязок між ними. Показує він
              тільки те, у чому статистично впевнений: перше спостереження
              зʼявляється приблизно після 14 днів даних, а поки їх мало,
              підсумок чесно мовчить.
            </p>
            <a
              href="/beta"
              className="text-sm font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Стати в чергу →
            </a>
          </div>
        </article>
      </main>

      <SiteFooter />
    </>
  );
}
