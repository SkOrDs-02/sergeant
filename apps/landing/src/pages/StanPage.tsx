import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import TelegramCta from "../components/TelegramCta";
import { formatDateUk } from "../lib/dates";

/**
 * Єдина сторінка сайту, яка змінюється щотижня, і єдина, де видима дата –
 * частина змісту. `STATUS_UPDATED` мусить збігатися з `lastmod` запису
 * `/stan` у routeMeta і з датою в рядку-містку на головній.
 */
export const STATUS_UPDATED = "2026-09-02";

const NOW = [
  "Автосинк фінансів через Monobank",
  "Сканер чеків із фото: поодинці й пачкою",
  "Чеки Сільпо підтягуються з програми лояльності",
  "Логи їжі, тренувань і звичок",
  "AI-помічник: спитай про свої дані в чаті",
  "Тижневий підсумок зі звʼязками між сферами",
  "Звʼязки між сферами з рівнем впевненості і розкриттям у дні",
  "Мобільний застосунок: працює і синхронізується",
];

const SOON = [
  "Глибша аналітика кореляцій",
  "Динамічні цілі, що підлаштовуються під тебе",
  "Єдиний експорт, що зводить акаунтські дані й дані модулів в один файл",
];

/**
 * Гострі кути, на які бета-тестер натрапить сьогодні. Кожен пункт уже
 * описаний на своїй сторінці; тут вони зібрані в один список, бо /beta
 * обіцяє «список зламаного» саме тут, а до 2026-09-02 сторінка мала лише
 * «працює» і «в розробці». Пункт зникає, коли виправлений.
 */
const PROBLEMS = [
  {
    text: "Єдиного експорту одним файлом немає: акаунтські дані вивантажуються з профілю, дані модулів – локальним бекапом. CSV теж поки немає.",
    href: "/vyhid",
    label: "Забрати свої дані",
  },
  {
    text: "Статистика звичок: календар і відсоток виконання вже виключають день із причиною зі знаменника, а зведення на сторінці статистики – ще ні.",
    href: "/zvychky",
    label: "Звички",
  },
  {
    text: "Шаблон тренування не зберігає ваги й повтори: кожен підхід вводиться заново, кнопки «повторити попередній підхід» немає.",
    href: "/ruchna-robota",
    label: "Скільки вводити руками",
  },
  {
    text: "Промах штрихкоду не запамʼятовується: товар, якого немає в базах, завтра дасть той самий промах.",
    href: "/yizha",
    label: "Їжа",
  },
  {
    text: "Комора не сигналізує, що продукт закінчується: списання працює, нагадування немає.",
    href: "/yizha",
    label: "Їжа",
  },
  {
    text: "Мобільний застосунок ще на жорсткій серії: показує власні, нижчі відсотки на тих самих даних, поки не переведений на логіку вебу.",
    href: "/zvychky",
    label: "Звички",
  },
];

const link =
  "font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export default function StanPage() {
  usePageMeta({
    ...ROUTE_META["/stan"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Стан розробки Sergeant",
      inLanguage: "uk",
      dateModified: STATUS_UPDATED,
      author: { "@type": "Person", name: "Автор Sergeant" },
      publisher: { "@type": "Organization", name: "Sergeant" },
    },
  });

  return (
    <SiteLayout mainClassName="mx-auto w-full max-w-6xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
      <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-5xl">
        Доповідь про стан
      </h1>
      <p className="mt-5 max-w-xl leading-relaxed text-muted">
        Що працює сьогодні, а що поки що обіцянка. Оновлюється, коли змінюється
        стан, а не за розкладом.
      </p>
      <p className="mt-3 text-sm text-subtle">
        Оновлено:{" "}
        <time dateTime={STATUS_UPDATED} className="font-semibold text-muted">
          {formatDateUk(STATUS_UPDATED)}
        </time>
      </p>

      <div className="mt-10 grid gap-10 sm:grid-cols-2 sm:gap-14">
        <div>
          <h2 className="border-b-2 border-foreground-strong pb-2.5 font-display text-xs font-bold uppercase tracking-[0.08em] text-foreground-strong">
            Вже працює
          </h2>
          <ul className="mt-4 flex flex-col gap-4">
            {NOW.map((item) => (
              <li
                key={item}
                className="flex items-baseline gap-2.5 text-[15px] font-semibold leading-relaxed text-foreground"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 translate-y-px bg-foreground-strong"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="border-b-2 border-cardline-strong pb-2.5 font-display text-xs font-bold uppercase tracking-[0.08em] text-subtle">
            У розробці
          </h2>
          <ul className="mt-4 flex flex-col gap-4">
            {SOON.map((item) => (
              <li key={item} className="text-[15px] leading-relaxed text-muted">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div
        id="vidomi-problemy"
        className="mt-14 scroll-mt-16 border-t-2 border-foreground-strong pt-8"
      >
        <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong">
          Відомі проблеми
        </h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted">
          Гострі кути, на які натрапиш сьогодні. Кожен уже описаний на своїй
          сторінці, тут вони зібрані в один список. Пункт зникає звідси, коли
          виправлений.
        </p>
        <ul className="mt-6 flex max-w-2xl flex-col gap-4">
          {PROBLEMS.map((item) => (
            <li
              key={item.text}
              className="flex items-baseline gap-2.5 text-[15px] leading-relaxed text-foreground"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 translate-y-px bg-foreground-strong"
              />
              <span>
                {item.text}{" "}
                <a href={item.href} className={link}>
                  {item.label}
                </a>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong">
          Про мобільний застосунок
        </h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted">
          Раніше тут стояло «у розробці». Це було неточно: застосунок існує,
          працює і синхронізується з веб-версією.
        </p>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted">
          Чесна відповідь інша: публічний вихід відкладено, поки веб не доведе,
          що продуктом користуються. Поки цього немає, вкладати в дві поверхні
          одночасно – це розмазати одну людину на дві роботи. Паритет функцій не
          обіцяється: частина речей є лише у вебі.
        </p>
      </div>

      <div className="mt-12 border-t border-cardline pt-8">
        <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong">
          Що означають ці слова
        </h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted">
          «Вже працює» – можна відкрити й скористатись сьогодні. Не «код
          написаний», не «в тестуванні».
        </p>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted">
          «У розробці» – я цим займаюсь, але дати не називаю. Дата, названа
          наперед однією людиною без команди, – це вигадка, за яку потім
          соромно.
        </p>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted">
          Чого в списку немає взагалі – того я не планую найближчим часом,
          навіть якщо це очевидна ідея.
        </p>
        <div className="mt-6">
          <TelegramCta placement="footer" label="Стати в чергу" />
        </div>
      </div>
    </SiteLayout>
  );
}
