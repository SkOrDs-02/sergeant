import TelegramCta from "./TelegramCta";
import { LogoMark } from "./Wordmark";
import { CONFIDENCE } from "../content/confidenceLevels";
import { formatDateUk } from "../lib/dates";
import { STATUS_UPDATED } from "../pages/StanPage";
import { AUTHOR_NAME } from "../content/author";

/** Стрілка звʼязку між парою модулів. */
function PairArrow() {
  return (
    <svg
      width="26"
      height="10"
      viewBox="0 0 26 10"
      fill="none"
      aria-hidden="true"
      className="stroke-subtle"
      strokeWidth="1.6"
    >
      <path d="M1 5 h22 m-5 -4 5 4 -5 4" />
    </svg>
  );
}

/**
 * Модулі – чотири кольорові блоки на повну ширину: акцент модуля тут
 * не декор, а сама поверхня (module-accent containment: колір живе лише
 * всередині свого блока). Кожен блок несе живий фрагмент даних різної
 * форми, а не сітку однакових карток (анти-слоп: accent-swap ≠ ідентичність).
 *
 * Заголовок плитки – сфера («Гроші»), а не бренд-імʼя («Фінік»): так само,
 * як у шапці. Бренд-імʼя лишається підписом, бо новачок читає найбільший
 * шрифт, а «Фінік» без слова «гроші» поруч не каже нічого. Останній рядок
 * кожної плитки – місток до звʼязків, щоб чотири модулі не читались як
 * чотири окремі трекери (рада щодо сайту 2026-09-15).
 */
export function ModulesSection() {
  const label = "font-display text-xs font-medium uppercase tracking-[0.12em]";
  const title = "font-display text-2xl font-extrabold uppercase";
  const body = "mt-1.5 text-sm leading-relaxed";

  return (
    <section id="modules" className="scroll-mt-16">
      <div className="mx-auto w-full max-w-6xl px-5 pb-9 pt-16 sm:px-8">
        <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-balance text-foreground-strong sm:text-3xl">
          Чотири модулі, які бачать один одного
        </h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-muted">
          Витрати приходять з Monobank і чеків, їжа – зі штрихкоду чи фото,
          звичка – одним тапом.
        </p>
      </div>

      {/* Смуга в тій самій колонці max-w-6xl, що й решта головної: на всю
          ширину вікна текст крайніх блоків стояв за 24px від краю екрана, а не
          по сітці (рішення власника за аудитом сайту 2026-10-08, V18). */}
      <div className="mx-auto grid w-full max-w-6xl sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
        <a
          href="/hroshi"
          className="group flex flex-col gap-1 bg-finyk px-6 py-7 text-ink-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <p className={label}>модуль Фінік</p>
          <h3 className={`${title} group-hover:underline`}>Гроші</h3>
          <p className={`${body} text-ink-text`}>
            Чотири входи витрат замість одного банку.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-ink-text">
            У звʼязках: як доставка їжі залежить від тренувань
          </p>
        </a>

        <a
          href="/trenuvannia"
          className="group flex flex-col gap-1 bg-fizruk px-6 py-7 text-ink-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <p className={label}>модуль Фізрук</p>
          <h3 className={`${title} group-hover:underline`}>Тренування</h3>
          <p className={`${body} text-ink-text`}>
            Щоденник тренувань і порада, коли відпочити.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-ink-text">
            У звʼязках: як тренування тримають звички
          </p>
        </a>

        <a
          href="/zvychky"
          className="group flex flex-col gap-1 bg-routine px-6 py-7 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <p className={label}>модуль Рутина</p>
          <h3 className={`${title} group-hover:underline`}>Звички</h3>
          <p className={`${body} text-ink/90`}>
            Пропуск із причиною не обнуляє серію.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-ink">
            У звʼязках: як звички впливають на їжу і витрати
          </p>
        </a>

        <a
          href="/yizha"
          className="group flex flex-col gap-1 bg-nutrition-glow px-6 py-7 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <p className={label}>модуль Харчування</p>
          <h3 className={`${title} group-hover:underline`}>Їжа</h3>
          <p className={`${body} text-ink/90`}>
            КБЖВ, коли половини продуктів немає в базах.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-ink">
            У звʼязках: як їжа відгукується на звички
          </p>
        </a>
      </div>
    </section>
  );
}

/**
 * Звʼязки – «паперові» нотатки, ніби Sergeant лишив їх на столі. Третя
 * нотатка навмисно порожня формою (пунктир, без тіні): право мовчати,
 * коли закономірності немає – це чесність продукту, показана версткою.
 */
/**
 * Три приклади звʼязків: підтверджений, слабкий і порожній. Один експорт на
 * головну і `/zvyazky`: до 2026-09-15 головна показувала лише перший, а
 * порожня нотатка («Закономірностей не помічено») жила на четвертому кліку.
 * Рада щодо сайту назвала її головним доказом права мовчати, якого жоден
 * конкурент показати не може, і founder вирішив винести всі три на головну.
 */
export function ConnectionExamples() {
  return (
    <div className="mt-9 grid gap-6 lg:grid-cols-3">
      <figure className="paper-shadow flex -rotate-1 flex-col gap-3.5 rounded-[var(--radius-card)] bg-note p-6">
        <div
          aria-hidden="true"
          className="flex items-center gap-3 text-[13px] font-bold"
        >
          <span className="text-fizruk">Фізрук</span>
          <PairArrow />
          <span className="text-routine-strong">Рутина</span>
        </div>
        <blockquote className="text-lg font-medium leading-snug text-foreground">
          «Коли тренуєшся важче, краще тримаєш звички»
        </blockquote>
        <figcaption className="mt-auto text-xs text-subtle">
          {CONFIDENCE.stable} · 34 спільні дні
        </figcaption>
      </figure>

      <figure className="paper-shadow flex rotate-[0.8deg] flex-col gap-3.5 rounded-[var(--radius-card)] bg-note p-6">
        <div
          aria-hidden="true"
          className="flex items-center gap-3 text-[13px] font-bold"
        >
          <span className="text-nutrition">Харчування</span>
          <PairArrow />
          <span className="text-routine-strong">Рутина</span>
        </div>
        <blockquote className="text-lg font-medium leading-snug text-foreground">
          «Коли тримаєш звички, їси менше»
        </blockquote>
        <figcaption className="mt-auto text-xs text-subtle">
          {CONFIDENCE.coincidence} · 2 тижні даних
        </figcaption>
      </figure>

      <figure className="flex -rotate-[0.5deg] flex-col gap-3.5 rounded-[var(--radius-card)] border-2 border-dashed border-cardline-strong p-6">
        <div
          aria-hidden="true"
          className="flex items-center gap-3 text-[13px] font-bold"
        >
          <span className="text-finyk">Фінік</span>
          <PairArrow />
          <span className="text-fizruk">Фізрук</span>
        </div>
        <blockquote className="text-lg font-medium leading-snug text-subtle">
          «Поки рано порівнювати»
        </blockquote>
        <figcaption className="sr-only">
          Звʼязок між Фініком і Фізруком ще не підтверджено
        </figcaption>
      </figure>
    </div>
  );
}

export function ConnectionsSection() {
  return (
    <section
      id="connections"
      className="mx-auto w-full max-w-6xl scroll-mt-16 px-5 pb-20 pt-16 sm:px-8"
    >
      <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-3xl">
        Звʼязки, які він помічає
      </h2>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted">
        Окремі трекери показують цифри. Застосунок читає всі сфери разом і
        показує, як вони впливають одна на одну. А коли даних замало, мовчить.
      </p>

      <ConnectionExamples />

      <p className="mt-7 max-w-2xl text-sm leading-relaxed text-subtle">
        Приклади ілюстративні.{" "}
        <a
          href="/zvyazky"
          className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Як це влаштовано
        </a>
      </p>
    </section>
  );
}

/** Голос автора – місток довіри між статутом і станом розробки. */
export function FounderSection() {
  return (
    <section className="mx-auto w-full max-w-3xl border-t-2 border-foreground-strong px-5 py-14 sm:px-8">
      <div className="flex items-center gap-3">
        <LogoMark size={22} />
        <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-2xl">
          Чому я це роблю
        </h2>
      </div>
      <p className="mt-4 leading-relaxed text-foreground">
        Я вів чотири застосунки паралельно, і жоден не бачив цілої картини.
        Sergeant роблю для себе і таких, як я, і користуюсь ним щодня.
      </p>
      <p className="mt-4 text-subtle">
        – {AUTHOR_NAME}, автор Sergeant ·{" "}
        <a
          href="/about"
          className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          чому саме так
        </a>
      </p>
    </section>
  );
}

/** Доповідь про стан – чесний список працює/в розробці. */
/**
 * Рядок-місток замість винесеної `StatusSection`. Не опційний елемент:
 * без нього сигнал життя продукту зникає з першої сторінки. Дата береться
 * зі `STATUS_UPDATED` у `pages/StanPage.tsx`, а не дублюється руками.
 */
export function StatusBridge() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
      <div className="border-t-2 border-foreground-strong pt-6">
        <p className="max-w-2xl text-lg leading-relaxed text-muted">
          Що вже працює –{" "}
          <a
            href="/stan"
            className="font-semibold text-foreground-strong underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            у доповіді про стан
          </a>
          .
        </p>
        <p className="mt-2 text-sm text-subtle">
          Оновлено:{" "}
          <time dateTime={STATUS_UPDATED} className="font-semibold">
            {formatDateUk(STATUS_UPDATED)}
          </time>
        </p>
      </div>
    </section>
  );
}

export function ClosingCta() {
  return (
    <section className="bg-ink text-ink-text">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-8 px-5 py-14 sm:px-8 lg:flex-row lg:items-center">
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-balance sm:text-3xl">
            Бета відкривається хвилями
          </h2>
          <p className="max-w-lg leading-relaxed text-ink-muted">
            Стань у чергу в Telegram, і я напишу, коли відкриється твоя.
          </p>
        </div>
        <TelegramCta
          placement="footer"
          label="Стати в чергу"
          variant="inverse"
        />
      </div>
    </section>
  );
}
