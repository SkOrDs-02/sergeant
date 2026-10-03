import SiteLayout from "../components/SiteLayout";
import GuideHomeModule from "../components/GuideHomeModule";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import UpdatedOn from "../components/UpdatedOn";
import TelegramCta from "../components/TelegramCta";
import { AUTHOR_NAME, AUTHOR_JSON_LD } from "../content/author";

const VISION = [
  {
    what: "Яка це страва",
    how: "Впевнено: борщ, плов, паста з соусом впізнаються з першого кадру.",
  },
  {
    what: "Видимі інгредієнти",
    how: "Здебільшого влучно: мʼясо, крупу й овочі на тарілці видно.",
  },
  {
    what: "Вага порції",
    how: "Слабко. Тарілки на 22 і на 28 см виглядають схоже, хоча площа різниться в півтора раза.",
  },
  {
    what: "Олія і вершкове масло",
    how: "Майже ніяк. Ложка олії важить 120 ккал, і на знімку її не існує.",
  },
  {
    what: "Соус чи заправка",
    how: "Слабко. Ложка майонезу важить 15 г і додає близько 100 ккал.",
  },
  {
    what: "Цукор у напої й десерті",
    how: "Ніяк: розчинений цукор не має вигляду.",
  },
];

const STEPS = [
  "Поклади в кадр знайомий предмет: виделку або столову ложку. Модель міряє розмір, порівнюючи зі знайомою річчю, і коли такої опори в кадрі немає, вона просто вгадує.",
  "Знімай згори під легким кутом: вид рівно зверху ховає висоту гірки, тобто половину обʼєму.",
  "Відповідай на уточнення і дописуй те, чого на знімку немає: «дві ложки олії», «майонез». Це найдешевша правка з усіх.",
  "Один раз зваж свої звичні порції. Далі ваги можна відкласти: ти вже знаєш, що твоя миска каші важить 250 г.",
];

const SHORT_ANSWER =
  "Оцінити можна, і за секунди: модель впізнає страву й дає стартові КБЖВ. Слабке місце: те, чого на знімку фізично немає, вага порції, олія зі сковорідки, цукор у соусі. Тому Сержант не зупиняється на кадрі: коли непевний, він ставить одне-три короткі уточнення і перераховує цифри з твоїх відповідей. А для страв, які ти їси щодня, точність добирають ваги або збережений рецепт.";

const link =
  "font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export default function GuideFotoKaloriiPage() {
  usePageMeta({
    ...ROUTE_META["/guides/foto-kalorii"],
    jsonLd: {
      "@context": "https://schema.org",
      // HowTo, а не Article: сторінка веде людину по кроках, і саме кроки
      // мають бути машинно-читабельними. Розширених сніпетів Google для
      // HowTo більше не малює (зняв у вересні 2023), тож адресат тут –
      // AI-споживачі, ті самі, заради яких у нас llms.txt і markdown.
      "@type": "HowTo",
      name: "Чи можна порахувати калорії страви з фото – і наскільки це точно",
      inLanguage: "uk",
      dateModified: ROUTE_META["/guides/foto-kalorii"].lastmod,
      author: AUTHOR_JSON_LD,
      publisher: { "@type": "Organization", name: "Sergeant" },
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
    <SiteLayout>
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 pb-20 pt-12 sm:px-8 sm:pt-16">
        <div>
          <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-subtle">
            Гайди · Харчування
          </p>
          <h1 className="mt-4 text-3xl font-extrabold leading-[1.12] tracking-tight text-balance text-foreground-strong sm:text-4xl">
            Чи можна порахувати калорії страви з фото – і наскільки це точно
          </h1>
          <p className="mt-4 text-sm text-subtle">
            Оновлено{" "}
            <UpdatedOn iso={ROUTE_META["/guides/foto-kalorii"].lastmod} /> ·{" "}
            {AUTHOR_NAME}
          </p>
          <GuideHomeModule href="/yizha" label="Їжа" />
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
          <h2 className={h2}>Що фото бачить добре, а де починає вгадувати</h2>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
            <span className="hidden border-b border-cardline-strong py-2.5 text-xs font-semibold uppercase tracking-wide text-subtle sm:block">
              Що треба оцінити
            </span>
            <span className="hidden border-b border-cardline-strong py-2.5 text-xs font-semibold uppercase tracking-wide text-subtle sm:block">
              Наскільки допомагає фото
            </span>
            {VISION.map((row) => (
              <div key={row.what} className="contents">
                <span className="pt-3.5 text-sm font-bold text-foreground sm:border-b sm:border-cardline sm:py-3.5 sm:pr-6 sm:font-semibold">
                  {row.what}
                </span>
                <span className="border-b border-cardline pb-3.5 pt-1 text-sm leading-relaxed text-muted sm:py-3.5">
                  {row.how}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
            Фото сильне в питанні «що це» і слабке в «скільки».
          </p>
          <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
            Оцінку Сержант дає одразу, а коли непевний, ставить одне-три короткі
            питання: скільки грамів у порції, чи була олія, який соус.
            Відповідаєш одним рядком, і цифри перераховуються. Це закриває рівно
            ті рядки таблиці, де фото сліпе.
          </p>
        </section>

        <section>
          <h2 className={h2}>Ієрархія точності</h2>
          <ol className="mt-5 flex flex-col gap-3.5">
            <li className="flex gap-4 leading-relaxed text-foreground">
              <span className="shrink-0 font-bold text-foreground-strong">
                1.
              </span>
              <span>
                <strong>Штрихкод пакованого продукту.</strong> Склад надрукував
                виробник, лишається зчитати код і взяти свою порцію.
              </span>
            </li>
            <li className="flex gap-4 leading-relaxed text-foreground">
              <span className="shrink-0 font-bold text-foreground-strong">
                2.
              </span>
              <span>
                <strong>Збережений рецепт домашньої страви.</strong> Зважуєш
                каструлю один раз, далі кожна тарілка рахується з відомого
                складу.
              </span>
            </li>
            <li className="flex gap-4 leading-relaxed text-foreground">
              <span className="shrink-0 font-bold text-foreground-strong">
                3.
              </span>
              <span>
                <strong>Фото.</strong> Для страви, яку бачиш уперше, або коли
                їси не вдома.
              </span>
            </li>
            <li className="flex gap-4 leading-relaxed text-foreground">
              <span className="shrink-0 font-bold text-foreground-strong">
                4.
              </span>
              <span>
                <strong>Око.</strong> Останній рівень, але запис на око все одно
                кращий за пропущений день.
              </span>
            </li>
          </ol>
          <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
            Чим частіше ти їси страву, тим вище варто піднятися списком. Борщ,
            який ти вариш кожні десять днів, заслуговує на рецепт, випадковий
            обід у кафе піде з фото. Чому пошук спотикається на українських
            продуктах, розібрано в{" "}
            <a href="/guides/kbzhv" className={link}>
              гайді про КБЖВ
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className={h2}>Як зменшити похибку фото</h2>
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
          <h2 className={h2}>Стабільна похибка проти стрибучої</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
            Похибка, яка тримається однаковою, майже не шкодить. Якщо ти щоразу
            занижуєш олію приблизно на ту саму величину, тиждень усе одно
            порівнюється з тижнем, і тренд не бреше. Псує картину похибка, що
            стрибає: три дні ти зважував, чотири оцінював з фото, і ці два числа
            поруч уже про різні речі.
          </p>
          <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
            Обери один спосіб на кожну повторювану страву й тримайся його,
            навіть якщо він грубіший за сусідній. І дивись на середнє за
            тиждень: один обід нічого не означає, звична структура тижня
            проступає за кілька тижнів записів.
          </p>
        </section>

        <section>
          <p className="text-sm text-subtle">
            AI-розпізнавання фото входить у платний план, штрихкод і ручний
            запис безкоштовні назавжди. Як влаштоване Харчування –{" "}
            <a href="/yizha" className={link}>
              на сторінці модуля
            </a>
            .
          </p>
          <div className="mt-6">
            <TelegramCta placement="footer" label="Стати в чергу" />
          </div>
        </section>
      </article>
    </SiteLayout>
  );
}
