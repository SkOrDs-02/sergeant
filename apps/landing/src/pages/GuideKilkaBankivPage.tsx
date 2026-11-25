import SiteLayout from "../components/SiteLayout";
import GuideHomeModule from "../components/GuideHomeModule";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import UpdatedOn from "../components/UpdatedOn";
import TelegramCta from "../components/TelegramCta";
import { AUTHOR_NAME, AUTHOR_JSON_LD } from "../content/author";

/**
 * Питання, яке досі жило одним підрядком у FAQ. Автосинк є лише з
 * Monobank, тож для решти карт відповідь – виписка файлом. Тип розмітки –
 * `Article`, а не `HowTo`: це відповідь на питання, а не послідовність
 * кроків, які треба виконати підряд.
 */
export default function GuideKilkaBankivPage() {
  usePageMeta({
    ...ROUTE_META["/guides/kilka-bankiv"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Як звести витрати докупи, якщо карти в кількох банках",
      inLanguage: "uk",
      dateModified: ROUTE_META["/guides/kilka-bankiv"].lastmod,
      author: AUTHOR_JSON_LD,
      publisher: { "@type": "Organization", name: "Sergeant" },
    },
  });

  const h2 =
    "font-display text-xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-2xl";

  return (
    <SiteLayout>
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 pb-20 pt-12 sm:px-8 sm:pt-16">
        <div>
          <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-subtle">
            Гайди <span className="font-sans">·</span> Фінанси
          </p>
          <h1 className="mt-4 text-3xl font-extrabold leading-[1.12] tracking-tight text-balance text-foreground-strong sm:text-4xl">
            Як звести витрати докупи, якщо карти в кількох банках
          </h1>
          <p className="mt-4 text-sm text-subtle">
            Оновлено{" "}
            <UpdatedOn iso={ROUTE_META["/guides/kilka-bankiv"].lastmod} /> ·{" "}
            {AUTHOR_NAME}
          </p>
          <GuideHomeModule href="/hroshi" label="Гроші" />
        </div>

        <div className="rounded-[var(--radius-card)] bg-ink px-7 py-6">
          <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-ink-muted">
            Коротка відповідь
          </p>
          <p className="mt-3 leading-relaxed text-ink-text">
            Автоматично операції присилає лише Monobank. Решта карт заводиться
            випискою файлом: раз на місяць вивантажуєш CSV або XLSX з
            інтернет-банку і завантажуєш у Фінік. Витрати з усіх банків
            опиняються в одній стрічці.
          </p>
        </div>

        <section>
          <h2 className={h2}>Чому не всі банки підключаються самі</h2>
          <p className="mt-4 leading-relaxed text-muted">
            Щоб операції приходили самі, банк має віддавати їх через API, доступ
            до якого клієнт видає сам. Monobank так уміє: ти створюєш
            персональний токен і сам його відкликаєш. Інших банківських
            підключень у Фініку немає.
          </p>
          <p className="mt-4 leading-relaxed text-muted">
            Другу карту не доведеться забивати руками: вона заходить випискою.
          </p>
        </section>

        <section>
          <h2 className={h2}>Як це виглядає на практиці</h2>
          <ol className="mt-5 flex flex-col gap-4">
            <li className="border-t border-cardline pt-4">
              <h3 className="font-bold text-foreground-strong">
                Основну карту підключаєш до автосинхронізації
              </h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
                Ту, якою платиш найчастіше. Її операції приходять самі.
              </p>
            </li>
            <li className="border-t border-cardline pt-4">
              <h3 className="font-bold text-foreground-strong">
                Решту заводиш випискою раз на період
              </h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
                Зручно раз на місяць, коли банк уже сформував повний період.
                Читаються CSV, XLSX і .xls, який банк віддає як HTML-таблицю.
                PDF-виписку Фінік не читає: візьми в банку той самий період у
                CSV або XLSX.
              </p>
            </li>
            <li className="border-t border-cardline pt-4">
              <h3 className="font-bold text-foreground-strong">
                Перевіряєш таблицю перед збереженням
              </h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
                Рядки приїжджають із підказкою категорії. Схожі на вже записані
                позначені бейджем і без галочки. Без твого підтвердження нічого
                не зберігається, і весь імпорт можна скасувати однією дією:
                кнопка «Скасувати імпорт».
              </p>
            </li>
          </ol>
        </section>

        <section>
          <h2 className={h2}>Що робити з готівкою і переказами між своїми</h2>
          <p className="mt-4 leading-relaxed text-muted">
            Готівку закриває фото чека. Переказ між своїми картками – найчастіша
            причина подвійного рахунку: сума виходить з однієї карти, заходить
            на іншу і виглядає як витрата плюс дохід. Фінік пробує впізнати такі
            пари сам, остаточне рішення за тобою в таблиці перевірки.
          </p>
        </section>

        <section>
          <h2 className={h2}>Чого цей спосіб не дає</h2>
          <ul className="mt-5 flex flex-col gap-3">
            {[
              "Балансу другої карти в реальному часі: виписка показує період, що минув.",
              "Категорій там, де опис нічого не каже: якщо у виписці немає ні категорії, ні її коду, а в описі лише цифри, підказки не буде.",
            ].map((item) => (
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
        </section>

        <section>
          <p className="text-sm text-subtle">
            Як влаштовані всі входи витрат –{" "}
            <a
              href="/hroshi"
              className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              на сторінці про гроші
            </a>
            . Як підключити Monobank –{" "}
            <a
              href="/guides/monobank"
              className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              в окремому гайді
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
