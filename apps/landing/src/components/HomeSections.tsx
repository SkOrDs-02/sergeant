import TelegramCta from "./TelegramCta";
import { Eyebrow } from "./Eyebrow";

/**
 * Секції головної.
 *
 * Ритм навмисно нерівний. Раніше тут стояли чотири сітки карток поспіль
 * (3 → 4 → 3 → 2) в однаковій оболонці, і сторінка читалась як шаблон:
 * послідовність, перелік рівних сутностей і головна теза виглядали
 * ідентично, хоча несуть різне. Тепер кожна секція має форму, яка щось
 * означає — послідовність тече вертикально, модулі стали легендою, а теза
 * продукту отримала власну поверхню.
 */

/**
 * Крок процесу. Це справді послідовність (лог → зведення → підказка), тому
 * нумерація тут несе інформацію, а не прикрашає — і виражена вертикальною
 * рейкою, а не трьома рівними коробками.
 */
export function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Логи зʼявляються майже самі",
      text: "Фінанси підтягуються через Monobank. Їжу додаєш фото чи сканером. Звичка — один тап, тренування — таймер.",
    },
    {
      n: "02",
      title: "Sergeant зводить це докупи",
      text: "Один застосунок бачить усі чотири сфери одночасно — тому може помітити те, що окремі трекери проґавлять.",
    },
    {
      n: "03",
      title: "Ти отримуєш підказку, а не докір",
      text: "Раз на тиждень — короткий підсумок звʼязків. Спокійно, як від друга, а не як від сержанта на плацу.",
    },
  ];

  return (
    <section
      id="how"
      className="mx-auto w-full max-w-5xl px-5 py-20 sm:px-8 sm:py-28"
    >
      <h2 className="max-w-xl font-display text-3xl font-bold tracking-tight text-balance text-foreground-strong sm:text-4xl">
        Цінність не в тому, що все в одному місці. А в{" "}
        <span className="text-accent">звʼязках</span> між сферами.
      </h2>

      <ol className="mt-14">
        {steps.map((s, i) => (
          <li
            key={s.n}
            className="relative grid grid-cols-[auto_1fr] gap-x-5 pb-12 last:pb-0 sm:gap-x-8"
          >
            {/* Рейка — вертикальна лінія прогресу; на останньому кроці обривається. */}
            {i < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute bottom-2 left-[7px] top-6 w-px bg-cardline-strong"
              />
            ) : null}
            <span
              aria-hidden="true"
              className="mt-[7px] h-[15px] w-[15px] rounded-full border-[3px] border-accent bg-background"
            />
            <div>
              <span className="font-display text-xs font-bold tabular-nums tracking-widest text-subtle">
                {s.n}
              </span>
              <h3 className="mt-1 font-display text-xl font-bold text-foreground-strong sm:text-2xl">
                {s.title}
              </h3>
              <p className="mt-2 max-w-md leading-relaxed text-muted">
                {s.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Модулі — це легенда до всього іншого на сторінці, а не список переваг.
 * Тому без карткової оболонки: чотири рівні сутності, кожна тримається на
 * власному акценті. Іконок немає навмисно — геометричні гліфи в квадратиках
 * нічого не пояснювали, а колір тут уже несе ідентичність.
 */
export function ModulesSection() {
  const modules = [
    {
      name: "ФІНІК",
      domain: "гроші",
      text: "Бюджети в гривні, синк із Monobank, категорії та борги без ручного вводу.",
      rule: "bg-finyk",
      label: "text-finyk",
    },
    {
      name: "ФІЗРУК",
      domain: "тіло",
      text: "Плани тренувань, прогрес силових і біометрія в одному місці.",
      rule: "bg-fizruk",
      label: "text-fizruk",
    },
    {
      name: "Рутина",
      domain: "звички",
      text: "Стріки й чек-іни з чесною статистикою — без прикрашання цифр.",
      rule: "bg-routine",
      label: "text-routine",
    },
    {
      name: "Харчування",
      domain: "їжа",
      text: "КБЖУ, сканер штрих-кодів і українська база продуктів.",
      rule: "bg-nutrition",
      label: "text-nutrition",
    },
  ];

  return (
    <section
      id="modules"
      className="mx-auto w-full max-w-5xl px-5 py-16 sm:px-8 sm:py-20"
    >
      <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {modules.map((m) => (
          <article key={m.name}>
            <span
              aria-hidden="true"
              className={`block h-[3px] w-10 rounded-full ${m.rule}`}
            />
            <h3 className="mt-4 font-display text-base font-bold text-foreground-strong">
              {m.name}{" "}
              <span className={`font-medium ${m.label}`}>— {m.domain}</span>
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {m.text}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

/**
 * СИГНАТУРА СТОРІНКИ.
 *
 * Єдине, чого не роблять окремі трекери, — речення, що звʼязує дві сфери.
 * Раніше воно жило в трьох однакових картках 14-м кеглем і губилось серед
 * решти. Тепер це власна темна поверхня, кожен звʼязок — намальований дріт
 * між двома модулями, а сам висновок набраний як цитата, бо це і є цитата
 * з продукту. Уся сміливість сторінки витрачена тут; решта — тиха.
 */
export function ConnectionsSection() {
  const links = [
    {
      a: { label: "ФІЗРУК", dot: "bg-fizruk-glow", text: "text-fizruk-glow" },
      b: { label: "ФІНІК", dot: "bg-finyk-glow", text: "text-finyk-glow" },
      insight:
        "У тижні, коли ти тренуєшся 3+ рази, замовлень доставки помітно менше.",
    },
    {
      a: {
        label: "Харчування",
        dot: "bg-nutrition-glow",
        text: "text-nutrition-glow",
      },
      b: {
        label: "Рутина",
        dot: "bg-routine-glow",
        text: "text-routine-glow",
      },
      insight:
        "Коли снідаєш вдома, ранкова рутина тримається довше, а зриви — рідше.",
    },
    {
      a: { label: "ФІНІК", dot: "bg-finyk-glow", text: "text-finyk-glow" },
      b: {
        label: "Харчування",
        dot: "bg-nutrition-glow",
        text: "text-nutrition-glow",
      },
      insight:
        "Імпульсивні витрати на їжу частішають у дні, коли пропускаєш обід.",
    },
  ];

  return (
    <section id="connections" className="bg-ink py-20 sm:py-28">
      <div className="mx-auto w-full max-w-5xl px-5 sm:px-8">
        <h2 className="max-w-2xl font-display text-3xl font-bold tracking-tight text-balance text-ink-text sm:text-4xl">
          Окремі трекери показують цифри. Sergeant показує звʼязки між ними.
        </h2>

        {/* Ліва межа збігається з рештою сторінки, але міра рядка тримається
            читабельною — дріт не має розтягуватись на всю ширину екрана. */}
        <div className="mt-16 flex max-w-3xl flex-col gap-14">
          {links.map((l) => (
            <figure key={l.insight}>
              {/* Дріт: дві точки модулів, зʼєднані лінією. Форма повторює те,
                  що описує речення нижче — звʼязок між двома сферами. */}
              <div
                aria-hidden="true"
                className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.14em]"
              >
                <span className={`flex items-center gap-2 ${l.a.text}`}>
                  <i className={`h-2 w-2 rounded-full ${l.a.dot}`} />
                  {l.a.label}
                </span>
                <span className="h-px flex-1 bg-ink-line" />
                <span className={`flex items-center gap-2 ${l.b.text}`}>
                  {l.b.label}
                  <i className={`h-2 w-2 rounded-full ${l.b.dot}`} />
                </span>
              </div>
              <blockquote className="mt-5 font-display text-xl font-medium leading-snug text-balance text-ink-text sm:text-2xl">
                {l.insight}
              </blockquote>
              {/* Дублюємо пару текстом для скрінрідерів — вище вона aria-hidden,
                  бо там це декоративна графіка, а не читабельний зміст. */}
              <figcaption className="sr-only">
                Звʼязок між модулями {l.a.label} і {l.b.label}
              </figcaption>
            </figure>
          ))}
        </div>

        <p className="mt-16 max-w-xl text-sm leading-relaxed text-ink-muted">
          Приклади ілюстративні. Реальні звʼязки Sergeant будує на твоїх даних —
          і показує лише ті, в яких упевнений.
        </p>
      </div>
    </section>
  );
}

/**
 * Чесність про стан — рідкісна для лендінга річ, тож вона має читатись як
 * пряме порівняння, а не як дві однакові картки, де око не бачить різниці.
 * Різницю робить типографіка й лінія, а не рамки.
 */
export function HonestSection() {
  const now = [
    "Автосинк фінансів через Monobank",
    "Логи їжі, тренувань і звичок",
    "Тижневий підсумок з кількома звʼязками між сферами",
  ];
  const soon = [
    "Глибша аналітика кореляцій (поки бачимо кілька пар за раз)",
    "Динамічні цілі, що підлаштовуються під тебе",
    "Більше джерел даних поза Monobank",
  ];

  return (
    <section className="mx-auto w-full max-w-5xl px-5 py-20 sm:px-8 sm:py-24">
      <h2 className="max-w-lg font-display text-3xl font-bold tracking-tight text-balance text-foreground-strong sm:text-4xl">
        Що вже працює, а що ще збираємо
      </h2>
      <p className="mt-4 max-w-xl leading-relaxed text-muted">
        Ми не обіцяємо магію. Sergeant показує звʼязки з тією впевненістю, яку
        реально має, і мовчить, коли даних ще замало.
      </p>

      <div className="mt-12 grid gap-10 sm:grid-cols-2 sm:gap-14">
        <div>
          <Eyebrow className="font-bold text-accent">Вже в застосунку</Eyebrow>
          <ul className="mt-5 flex flex-col gap-4 border-t border-cardline pt-5">
            {now.map((item) => (
              <li
                key={item}
                className="text-sm leading-relaxed text-foreground"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <Eyebrow className="font-bold text-subtle">У розробці</Eyebrow>
          <ul className="mt-5 flex flex-col gap-4 border-t border-cardline pt-5">
            {soon.map((item) => (
              <li key={item} className="text-sm leading-relaxed text-muted">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function BetaCta() {
  return (
    <section
      id="beta"
      className="mx-auto w-full max-w-5xl px-5 pb-24 pt-4 sm:px-8"
    >
      <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-balance text-foreground-strong sm:text-4xl">
        Долучайся, поки ми будуємо це разом
      </h2>
      <p className="mt-4 max-w-lg leading-relaxed text-pretty text-muted">
        Ранні користувачі формують продукт: обираєш, які звʼязки Sergeant
        вчиться помічати першими. Напишу в Telegram, щойно відкриємо доступ.
      </p>
      <div className="mt-8">
        <TelegramCta placement="footer" label="Написати боту" />
      </div>
    </section>
  );
}
