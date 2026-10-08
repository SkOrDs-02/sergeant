import SiteLayout from "../components/SiteLayout";
import GuideHomeModule from "../components/GuideHomeModule";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import UpdatedOn from "../components/UpdatedOn";
import TelegramCta from "../components/TelegramCta";
import { AUTHOR_NAME, AUTHOR_JSON_LD } from "../content/author";

/**
 * Питання, яке неминуче ставить кожен, хто прочитав, що автосинк є лише
 * з Monobank: «а мій Приват?». Відповідь досі жила абзацом у гайді про
 * кілька банків. Тепер вона окрема, бо люди шукають її окремо. Тип
 * `Article`: це відповідь, не послідовність кроків, які треба виконати
 * підряд.
 */
const ROUTE = "/guides/pryvat24";

const STEPS = [
  {
    title: "Вивантаж виписку за період табличним файлом",
    text: "У Приват24 виписку за період можна отримати файлом. Потрібен саме табличний формат: Excel або CSV. PDF Фінік не читає: підкаже взяти той самий період у таблиці.",
  },
  {
    title: "Завантаж файл у Фінік",
    text: "Формат визначається за вмістом: файл, який банк віддає як .xls, читається так само, навіть якщо всередині проста табличка, а не справжній Excel. Будь-який файл із кирилицею читається.",
  },
  {
    title: "Переглянь таблицю перед збереженням",
    text: "Рядки приїжджають із підказкою категорії. Ті, що схожі на вже записані, отримують бейдж і зняту галочку. Нічого не зберігається без твого підтвердження, і весь імпорт можна скасувати однією дією.",
  },
];

const LIMITS = [
  "Балансу Приват24 у реальному часі Фінік не бачить: виписка показує період, що минув.",
  "Бінарний Excel 97 і PDF не читаються. Якщо банк віддав саме такий файл, візьми той самий період у CSV або сучасному Excel.",
  "Категорія підставляється лише там, де є доказ: колонка банку, код категорії від банку або знайомий опис продавця. Без доказу рядок лишається без підказки.",
];

export default function GuidePryvat24Page() {
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
            Гайди <span className="font-sans">·</span> Фінанси
          </p>
          <h1 className="mt-4 text-3xl font-extrabold leading-[1.12] tracking-tight text-balance text-foreground-strong sm:text-4xl">
            Як завести виписку Приват24 у трекер витрат
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
            Прямого підключення до Приват24 у Sergeant поки немає. Виписка за
            період вивантажується з банку файлом Excel або CSV і завантажується
            у Фінік: рядки приїжджають із підказкою категорії, дублі
            позначаються, і все перевіряється в таблиці до збереження. Раз на
            місяць цього досить, щоб витрати з Привату лежали в одній стрічці з
            Monobank і чеками.
          </p>
        </div>

        <section>
          <h2 className={h2}>Чому не автосинхронізація, як із Monobank</h2>
          <p className="mt-4 leading-relaxed text-muted">
            Monobank дає клієнту персональний токен, який ти створюєш і
            відкликаєш сам, тому операції приходять автоматично. Для Привату
            такого самообслуговуваного доступу в Sergeant поки немає:
            підключення написане, але вимкнене, доки банк не відкриє доступ.
            Поки що працює виписка.
          </p>
        </section>

        <section>
          <h2 className={h2}>Як це виглядає на практиці</h2>
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
          <h2 className={h2}>Наскільки добре читається категорія</h2>
          <p className="mt-4 leading-relaxed text-muted">
            Виписка Приват24 несе власну колонку «Категорія», і Фінік бере її як
            перший доказ. На одній живій виписці з 27 рядків із категорією
            приїхали 23. Це один замір на одному файлі. Підказка нічого не
            вирішує остаточно: кожен рядок проходить таблицю перевірки перед
            збереженням.
          </p>
        </section>

        <section>
          <h2 className={h2}>Чого цей спосіб не дає</h2>
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
        </section>

        <section>
          <p className="text-sm text-subtle">
            Як зводити витрати, коли карт кілька –{" "}
            <a href="/guides/kilka-bankiv" className={link}>
              в окремому гайді
            </a>
            . Як влаштовані всі входи витрат –{" "}
            <a href="/hroshi" className={link}>
              на сторінці про гроші
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
