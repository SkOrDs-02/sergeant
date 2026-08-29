import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";

const SOURCES = [
  { data: "Сума і час покупки", from: "Виписка банку", cheque: false },
  { data: "Назва магазину", from: "Виписка банку", cheque: false },
  { data: "Груба категорія (MCC)", from: "Виписка банку", cheque: false },
  { data: "Позиції: що саме куплено", from: "Тільки чек", cheque: true },
  { data: "Ціна за одиницю і кількість", from: "Тільки чек", cheque: true },
  { data: "Покупка за готівку", from: "Тільки чек", cheque: true },
];

const STEPS = [
  "Розрівняй чек і поклади на однотонну пласку поверхню. Зімʼятий папір ламає рядки саме там, де стоять цифри.",
  "Знімай згори, тримаючи камеру паралельно до чека. Зйомка під кутом перетворює колонку сум на трапецію, і суми починають «пливти».",
  "Стеж за світлом: тінь від власної руки і відблиск на глянці термопаперу зʼїдають цілі рядки.",
  "Знімай того ж дня. Термопапір вигоряє від тепла і світла, і за кілька тижнів у гаманці чек перетворюється на порожню стрічку.",
];

const SHORT_ANSWER =
  "QR на фіскальному чеку веде в реєстр ДПС, а публічний доступ до нього обмежено на час воєнного стану, тож сканування коду зараз нічого не дає. Робочий шлях лишився один: фото. Розпізнавання дістає з нього суму, дату і рядки покупок, і саме рядки тут головні – суму твій банк і так знає.";

export default function GuideChekyPage() {
  usePageMeta({
    ...ROUTE_META["/guides/cheky"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline:
        "Як перетворити паперовий чек на облік витрат, коли QR не сканується",
      inLanguage: "uk",
      dateModified: "2026-08-28",
      author: { "@type": "Person", name: "Автор Sergeant" },
      publisher: { "@type": "Organization", name: "Sergeant" },
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
              Гайди · Фінанси
            </p>
            <h1 className="mt-4 text-3xl font-extrabold leading-[1.12] tracking-tight text-balance text-foreground-strong sm:text-4xl">
              Як перетворити паперовий чек на облік витрат, коли QR не
              сканується
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
            <h2 className={h2}>Що чек додає до банківської виписки</h2>
            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_150px]">
              <span className="border-b border-cardline-strong py-2.5 text-xs font-semibold uppercase tracking-wide text-subtle">
                Дані
              </span>
              <span className="border-b border-cardline-strong py-2.5 text-xs font-semibold uppercase tracking-wide text-subtle">
                Звідки
              </span>
              {SOURCES.map((row) => (
                <div key={row.data} className="contents">
                  <span className="border-b border-cardline py-3.5 text-sm text-foreground">
                    {row.data}
                  </span>
                  <span
                    className={`border-b border-cardline py-3.5 text-sm font-bold ${
                      row.cheque ? "text-accent" : "text-muted"
                    }`}
                  >
                    {row.from}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
              Практична різниця виглядає так. Виписка каже «супермаркет,
              1&nbsp;240 грн», і ця сума цілком їде в категорію «продукти». Чек
              показує, що 300 грн з них були побутовою хімією, ще 200 – кормом
              для кота, а їжі там на дві третини суми (цифри тут як приклад).
              Місяць такого округлення, і бюджет на продукти виглядає роздутим,
              хоча їси ти рівно як завжди.
            </p>
          </section>

          <section>
            <h2 className={h2}>Що сталося з QR і що робити поки</h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
              На кожному фіскальному чеку друкується QR, який веде до цього ж
              чека в реєстрі ДПС. Публічний доступ до реєстру обмежено на час
              воєнного стану, тому код зараз веде в нікуди: перевірити чек або
              витягнути з нього позиції автоматично через код не вийде.
            </p>
            <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
              Коли обмеження знімуть, сканування коду знову стане найшвидшим
              варіантом, бо дані приходять з першоджерела і розпізнавати нічого
              не треба. Але будувати свій облік сьогодні варто на фото: воно
              працює однаково для будь-якого магазину і для чеків, які взагалі
              не мають робочого коду.
            </p>
          </section>

          <section>
            <h2 className={h2}>Як зняти чек, щоб позиції розпізналися</h2>
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
            <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
              Довгі чеки з великої закупки краще знімати двома кадрами з
              перекриттям, ніж одним здалеку: дрібний шрифт з відстані
              розпізнається гірше за все.
            </p>
          </section>

          <section>
            <h2 className={h2}>Окремий випадок: Сільпо</h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
              Покупки в Сільпо приходять з програми лояльності, тож ці чеки
              фотографувати взагалі не треба: позиції підтягуються самі. Для
              мережі, у якій ти буваєш щотижня, це знімає більшу частину ручної
              роботи, а на фото лишаються поодинокі магазини, ринок і готівкові
              покупки.
            </p>
          </section>

          <div className="flex flex-col gap-2.5 border-t border-cardline pt-6">
            <p className="text-sm leading-relaxed text-muted">
              У Фініку сканер чеків працює з фото: по одному або пачкою до
              десяти за раз, коли після вихідних назбирався жмут. Розпізнані
              позиції лягають у витрати, а продуктові рядки можна віддати в
              Харчування, щоб не вводити ту саму покупку двічі. Банківські
              транзакції тим часом тягне синк Monobank, тож чек лишається тим,
              чим і має бути: джерелом деталей. Суму банк знає і без нього.
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
