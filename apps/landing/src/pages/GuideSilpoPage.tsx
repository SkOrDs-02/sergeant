import SiteLayout from "../components/SiteLayout";
import GuideHomeModule from "../components/GuideHomeModule";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import UpdatedOn from "../components/UpdatedOn";
import TelegramCta from "../components/TelegramCta";
import { AUTHOR_NAME, AUTHOR_JSON_LD } from "../content/author";

/**
 * Єдина інтеграція, якої немає в жодного українського трекера витрат, до
 * 2026-09-15 жила двома абзацами: згадкою в гайді про чеки і рядком у
 * доповіді про стан. Людина, яка шукає «що я купив у Сільпо» або «чек
 * сільпо по позиціях», не мала куди прийти.
 *
 * Сторінка тримає рівно одне питання: як один рядок банку стає чеком і
 * що з тим чеком далі роблять гроші та їжа. Межі названі там само, бо
 * інтеграція працює лише з однією мережею і лише з власним акаунтом.
 */
const ROUTE = "/guides/silpo";

const STEPS = [
  {
    title: "Звʼяжи акаунт у налаштуваннях",
    text: "Налаштування, розділ Фінік, кнопка «Звʼязати Сільпо». Далі звичайний вхід на боці Сільпо: логін і підтвердження доступу відбуваються в них, Sergeant пароля не бачить.",
  },
  {
    title: "Підтягни історію",
    text: "Після повернення картка інтеграції показує стан «звʼязано», і кнопка «Оновити чеки» забирає покупки. Приходять і онлайн-замовлення, і паперові чеки з каси, якщо покупка була з карткою лояльності.",
  },
  {
    title: "Підтверди розбиття",
    text: "Чек сам знаходить свою операцію в стрічці витрат і пропонує розбити її за реальними категоріями. Нічого не записується без підтвердження, і помилкову пару можна зняти.",
  },
];

const USES = [
  {
    title: "Гроші: одна сума стає кількома категоріями",
    text: "Банк кладе весь похід у «продукти», бо бачить лише код категорії від банку. Чек знає позиції, тож цигарки й алкоголь ідуть окремими категоріями замість ховатися в їжі, і пакет на касі перестає бути продуктом.",
  },
  {
    title: "Їжа: комора поповнюється тим, що ти справді приніс",
    text: "Продукти з чека пропонуються до комори Харчування: списання і поповнення замикаються в цикл без ручного вводу.",
  },
  {
    title: "КБЖВ: українська полиця замість міжнародних баз",
    text: "Звʼязаний акаунт додає ще одне джерело до пошуку їжі. Звичні українські продукти, які в міжнародних базах знаходяться через раз, тут лежать зі штрихкодами і вагою фасування.",
  },
  {
    title: "Список покупок збирається в кошик",
    text: "Список із Sergeant однією дією складається в кошик Сільпо. Перед записом продукт питає підтвердження, а оплату і доставку ти завершуєш сам у застосунку мережі.",
  },
];

const LIMITS = [
  "Лише Сільпо. Чеки інших мереж так забрати не можна, там банк і далі показує один рядок.",
  "Чек, старший за завантажену історію банку, не знайде своєї операції. У живому зрізі це було причиною більшості непривʼязаних чеків: покупки в Сільпо сягають 2023 року, операції банку починались із 2026-го.",
  "Оплати немає: у Сільпо її немає в самому інтерфейсі для застосунків.",
  "Доступ персональний: твій акаунт і твої чеки. Купити щось від твого імені продукт не може.",
];

export default function GuideSilpoPage() {
  usePageMeta({
    ...ROUTE_META[ROUTE],
    jsonLd: {
      "@context": "https://schema.org",
      // HowTo, а не Article: сторінка веде людину по кроках, і саме кроки
      // мають бути машинно-читабельними. Розширених сніпетів Google для
      // HowTo більше не малює (зняв у вересні 2023), тож адресат тут –
      // AI-споживачі, ті самі, заради яких у нас llms.txt і markdown.
      "@type": "HowTo",
      name: ROUTE_META[ROUTE].title,
      inLanguage: "uk",
      dateModified: ROUTE_META[ROUTE].lastmod,
      author: AUTHOR_JSON_LD,
      publisher: { "@type": "Organization", name: "Sergeant" },
      step: STEPS.map((item, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: item.title,
        text: item.text,
      })),
    },
  });

  const h2 =
    "font-display text-xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-2xl";
  const link =
    "font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  return (
    <SiteLayout>
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 pb-20 pt-12 sm:px-8 sm:pt-16">
        <div>
          <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-subtle">
            Гайди · Фінанси
          </p>
          <h1 className="mt-4 text-3xl font-extrabold leading-[1.12] tracking-tight text-balance text-foreground-strong sm:text-4xl">
            Як бачити чек Сільпо по позиціях, а не одним рядком
          </h1>
          <p className="mt-4 text-sm text-subtle">
            Оновлено <UpdatedOn iso={ROUTE_META[ROUTE].lastmod} /> ·{" "}
            {AUTHOR_NAME}
          </p>
          <GuideHomeModule href="/hroshi" label="Гроші" />
        </div>

        <div className="rounded-[var(--radius-card)] bg-ink px-7 py-6">
          <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-ink-muted">
            Коротка відповідь
          </p>
          <p className="mt-3 leading-relaxed text-ink-text">
            Звʼязуєш акаунт Сільпо один раз, і покупки приходять чеками по
            позиціях: і онлайн-замовлення, і паперові з каси, якщо платив із
            карткою лояльності. Далі той самий чек працює двічі. У грошах він
            розкладає одну суму за реальними категоріями, у їжі поповнює комору
            тим, що ти справді приніс додому. Фотографувати нічого не треба.
          </p>
        </div>

        <section>
          <h2 className={h2}>Що бачить банк і що бачить чек</h2>
          <p className="mt-4 leading-relaxed text-muted">
            Банк знає про похід у супермаркет рівно дві речі: суму і те, що це
            продуктовий магазин. Салат по вазі, побутова хімія і пляшка вина
            приїжджають одним рядком у категорії «продукти». Це найбільша
            категорія витрат у більшості людей і найгірше деталізована.
          </p>
          <p className="mt-4 leading-relaxed text-muted">
            Чек знає позиції, тому той самий похід розгортається у список із
            різними категоріями. Розбити чек руками можна було й раніше, але
            руками цього ніхто не робить.
          </p>
        </section>

        <section>
          <h2 className={h2}>Як це підключається</h2>
          <ol className="mt-5 flex flex-col gap-4">
            {STEPS.map((step) => (
              <li key={step.title} className="border-t border-cardline pt-4">
                <h3 className="font-bold text-foreground-strong">
                  {step.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {step.text}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className={h2}>Що чек робить далі</h2>
          <div className="mt-6 grid gap-px bg-cardline-strong sm:grid-cols-2">
            {USES.map((item) => (
              <div key={item.title} className="bg-background p-5">
                <h3 className="font-bold text-foreground-strong">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className={h2}>Чого ця звʼязка не дає</h2>
          <ul className="mt-5 flex flex-col gap-3">
            {LIMITS.map((item) => (
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
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-subtle">
            Чеки решти магазинів заводяться фотографією –{" "}
            <a href="/guides/cheky" className={link}>
              про сканер чеків окремо
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className={h2}>Як відвʼязати і що станеться з даними</h2>
          <p className="mt-4 leading-relaxed text-muted">
            «Відключити» на картці інтеграції знімає доступ: нові чеки більше не
            приходять. Уже завантажені при цьому лишаються на місці, бо вони вже
            частина твоїх витрат, і мовчки зникати з історії вони не мають
            права. Стерти їх – окрема дія «Видалити всі дані Сільпо».
          </p>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-subtle">
            Повна картина доступів і сховища –{" "}
            <a href="/data" className={link}>
              на сторінці «Твої дані»
            </a>
            .
          </p>
        </section>

        <div className="flex flex-col gap-2.5 border-t border-cardline pt-6">
          <p className="text-sm leading-relaxed text-muted">
            Звʼязка з Сільпо доповнює чотири входи витрат у Фініку:
            автосинхронізацію Monobank, фото чека, виписку файлом і ручну форму.{" "}
            <a href="/hroshi" className={link}>
              Як влаштовані гроші
            </a>
            .
          </p>
          <div className="mt-4">
            <TelegramCta placement="footer" label="Стати в чергу" />
          </div>
        </div>
      </article>
    </SiteLayout>
  );
}
