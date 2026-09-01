import TelegramCta from "./TelegramCta";
import { LogoMark } from "./Wordmark";

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
 */
export function ModulesSection() {
  const label = "font-display text-xs font-medium uppercase tracking-[0.12em]";
  const title = "font-display text-2xl font-extrabold uppercase";
  const body = "mt-1.5 text-sm leading-relaxed";

  return (
    <section id="modules" className="scroll-mt-16">
      <div className="mx-auto w-full max-w-6xl px-5 pb-9 pt-16 sm:px-8">
        <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-balance text-foreground-strong sm:text-3xl">
          Чотири модулі, один простір
        </h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-muted">
          Кожен збирає сигнали без зайвого вводу: фінанси з Monobank і чеків,
          їжа фото чи сканером, звичка одним тапом.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4">
        <a
          href="/hroshi"
          className="group flex flex-col gap-1 bg-finyk px-6 py-7 text-ink-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <p className={label}>01 · Гроші</p>
          <h3 className={`${title} group-hover:underline`}>Фінік</h3>
          <p className={`${body} text-ink-text/90`}>
            Чотири входи витрат замість одного банку.
          </p>
        </a>

        <a
          href="/trenuvannia"
          className="group flex flex-col gap-1 bg-fizruk px-6 py-7 text-ink-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <p className={label}>02 · Тіло</p>
          <h3 className={`${title} group-hover:underline`}>Фізрук</h3>
          <p className={`${body} text-ink-text/90`}>
            Щоденник тренувань і чесні межі поради.
          </p>
        </a>

        <a
          href="/zvychky"
          className="group flex flex-col gap-1 bg-routine px-6 py-7 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <p className={label}>03 · Звички</p>
          <h3 className={`${title} group-hover:underline`}>Рутина</h3>
          <p className={`${body} text-ink/90`}>
            Пропуск із причиною не обнуляє серію.
          </p>
        </a>

        <a
          href="/yizha"
          className="group flex flex-col gap-1 bg-nutrition-glow px-6 py-7 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <p className={label}>04 · Їжа</p>
          <h3 className={`${title} group-hover:underline`}>Харчування</h3>
          <p className={`${body} text-ink/90`}>
            КБЖВ, коли половини продуктів немає в базах.
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
 * Три приклади звʼязків: підтверджений, слабкий і порожній. Живуть окремим
 * експортом, бо головна показує лише перший, а `/zvyazky` – усі три;
 * «порожня нотатка» там центральний елемент, а не виняток.
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
          «У дні, коли тренуєшся зранку, інші звички зриваються рідше»
        </blockquote>
        <figcaption className="mt-auto text-xs text-subtle">
          тримається стабільно · 6 тижнів даних
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
          «Коли снідаєш удома, ранкова рутина тримається довше»
        </blockquote>
        <figcaption className="mt-auto text-xs text-subtle">
          поки що збіг · 2 тижні даних
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
          «Закономірностей не помічено. Ще збираю дані»
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
        Окремі трекери показують цифри. Sergeant читає всі сфери разом і
        показує, як вони впливають одна на одну.
      </p>

      <figure className="paper-shadow mt-9 flex max-w-xl -rotate-1 flex-col gap-3.5 rounded-[var(--radius-card)] bg-note p-6">
        <div
          aria-hidden="true"
          className="flex items-center gap-3 text-[13px] font-bold"
        >
          <span className="text-fizruk">Фізрук</span>
          <PairArrow />
          <span className="text-routine-strong">Рутина</span>
        </div>
        <blockquote className="text-lg font-medium leading-snug text-foreground">
          «У дні, коли тренуєшся зранку, інші звички зриваються рідше»
        </blockquote>
        <figcaption className="mt-auto text-xs text-subtle">
          тримається стабільно · 34 спільні дні
        </figcaption>
      </figure>

      <p className="mt-7 max-w-2xl text-sm leading-relaxed text-subtle">
        Приклади ілюстративні: Sergeant будує висновки на твоїх даних і підписує
        кожен рівнем впевненості, а нижче порогу мовчить.{" "}
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
        Я вів чотири застосунки паралельно: банк, тренування, звички, їжу. Кожен
        показував свої цифри, і жоден не бачив цілої картини. Sergeant я роблю
        для себе і таких, як я: чесна статистика і жодної торгівлі даними.
      </p>
      <p className="mt-4 text-subtle">– автор Sergeant</p>
    </section>
  );
}

/** Доповідь про стан – чесний список працює/в розробці. */
/**
 * Рядок-місток замість винесеної `StatusSection`. Не опційний елемент:
 * без нього сигнал життя продукту зникає з першої сторінки. Дата мусить
 * збігатися зі `STATUS_UPDATED` у `pages/StanPage.tsx`.
 */
export function StatusBridge() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
      <div className="border-t-2 border-foreground-strong pt-6">
        <p className="max-w-2xl text-lg leading-relaxed text-muted">
          Що вже працює, а що ні –{" "}
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
          <time dateTime="2026-08-31" className="font-semibold">
            31 серпня 2026
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
            Стань у чергу в Telegram, і я напишу одне повідомлення, коли
            відкриється твоя.
          </p>
          <p className="text-sm text-ink-muted">
            Ядро безкоштовне назавжди · Твої дані залишаються твоїми
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
