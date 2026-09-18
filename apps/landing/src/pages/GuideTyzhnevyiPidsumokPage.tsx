import SiteLayout from "../components/SiteLayout";
import GuideHomeModule from "../components/GuideHomeModule";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import UpdatedOn from "../components/UpdatedOn";
import TelegramCta from "../components/TelegramCta";
import { AUTHOR_NAME, AUTHOR_JSON_LD } from "../content/author";

/**
 * Гайд, а не повтор модульної сторінки: `/zvyazky` пояснює логіку
 * крос-модульних кореляцій, а тут – коли підсумок зʼявляється сам і як
 * дістати його вручну. Правило часу узяте з коду (`useMondayAutoDigest.ts`),
 * лейбл тумблера – з `AIDigestSection.tsx`; чисел підсумок не публікує.
 */
const ENTRY_POINTS = [
  "Кнопка «Оновити звіт» під тілом уже готового підсумку.",
  "Тумблер «Автогенерація щопонеділка» в налаштуваннях AI-звіту: якщо його вимкнути, підсумок не збереться.",
];

export default function GuideTyzhnevyiPidsumokPage() {
  usePageMeta({
    ...ROUTE_META["/guides/tyzhnevyi-pidsumok"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: "Коли приходить тижневий підсумок і як отримати його вручну",
      inLanguage: "uk",
      dateModified: ROUTE_META["/guides/tyzhnevyi-pidsumok"].lastmod,
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
            Гайди · Звʼязки
          </p>
          <h1 className="mt-4 text-3xl font-extrabold leading-[1.12] tracking-tight text-balance text-foreground-strong sm:text-4xl">
            Коли приходить тижневий підсумок і як отримати його вручну
          </h1>
          <p className="mt-4 text-sm text-subtle">
            Оновлено{" "}
            <UpdatedOn iso={ROUTE_META["/guides/tyzhnevyi-pidsumok"].lastmod} />{" "}
            · {AUTHOR_NAME}
          </p>
          <GuideHomeModule href="/zvyazky" label="Звʼязки" />
        </div>

        <div className="rounded-[var(--radius-card)] bg-ink px-7 py-6">
          <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-ink-muted">
            Коротка відповідь
          </p>
          <p className="mt-3 leading-relaxed text-ink-text">
            Підсумок збирається сам щопонеділка за тиждень, що щойно завершився.
            Створити його достроково не можна, є лише оновлення вже готового
            звіту.
          </p>
        </div>

        <section>
          <h2 className={h2}>Коли він зʼявляється сам</h2>
          <p className="mt-4 leading-relaxed text-muted">
            Автогенерація спрацьовує в першу сесію понеділка (за годинником
            твого пристрою) і збирає звіт за тиждень, що завершився в неділю.
            Якщо у вівторок шукати підсумок «цього тижня», його не буде: тиждень
            ще не закінчився, є лише підсумок за попередній.
          </p>
        </section>

        <section>
          <h2 className={h2}>Що лишилось під рукою</h2>
          <p className="mt-4 leading-relaxed text-muted">
            Створити підсумок раніше понеділка не вийде: так звіт не збирається
            на пів тижня даних. Керувати можна двома речами:
          </p>
          <ul className="mt-5 flex flex-col gap-3">
            {ENTRY_POINTS.map((item) => (
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
          <p className="mt-5 leading-relaxed text-muted">
            Сам звіт живе внизу головної. Окремої сторінки «Звіти» немає:
            вкладка «Звʼязки» показує кореляції між сферами.
          </p>
        </section>

        <section>
          <h2 className={h2}>Тумблер автогенерації</h2>
          <p className="mt-4 leading-relaxed text-muted">
            Підсумок увімкнено за замовчуванням. Вимкнути автозапуск можна тим
            самим тумблером. Денний ліміт AI-запитів підсумок не витрачає.
          </p>
        </section>

        <section>
          <h2 className={h2}>Що всередині</h2>
          <p className="mt-4 leading-relaxed text-muted">
            Підсумок іде по модулях окремо: коротке зведення, коментар і
            рекомендації за кожним, плюс спільний висновок на тиждень. Звʼязків
            між сферами з рівнем впевненості тут немає: вони живуть окремо, у
            розділі «Звʼязки», і читаються там. Що саме означає рівень
            впевненості і звідки він береться –{" "}
            <a
              href="/zvyazky"
              className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
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
