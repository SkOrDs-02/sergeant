/**
 * Last validated: 2026-08-05
 * Status: Active
 *
 * `Money` / `Delta` — типографіка чисел (анти-слоп П4,
 * `docs/05-design/design/anti-slop-strategy.md` §4/П4).
 *
 * Sergeant — продукт про числа: гривні, копійки, кілокалорії, кілограми,
 * дні. Власне трактування числа — найдешевша і найстійкіша відмінність,
 * бо вона видна на кожному екрані і не копіюється скріншотом: конкурент
 * бачить результат, але не бачить правила.
 *
 * Правило тут одне й просте: **сума домінує, решта прислуговує**.
 *
 *   −1 250,50 ₴
 *   │ └─┬──┘└┬┘└┬┘
 *   │   │    │  └─ символ: 0.72em, приглушений — валюта та сама на всьому
 *   │   │    │     екрані, тож повторювати її на повну силу — шум
 *   │   │    └──── копійки: 0.64em, приглушені — окремий тир, бо в житті
 *   │   │          вони майже ніколи не важать так, як гривні
 *   │   └───────── гривні: повний кегль і вага — це і є число
 *   └───────────── знак: 0.78em, приглушений; U+2212, не дефіс, щоб рядки
 *                  в стовпчику не з'їжджали
 *
 * Числа тут не «на око однакові»: символ найбільший із трьох, бо ₴ у
 * більшості шрифтів має малу x-висоту і на 0.62em просто зникає в підписі;
 * копійки найменші, бо їх читають рідше за все. Перевірено рендером.
 *
 * AI-CONTEXT: розмір тирів заданий в `em`, а не в токенах шкали. Це
 * навмисно — компонент має лягати й у hero-число, і в підпис таблиці,
 * успадковуючи кегль від контейнера. Викликач ставить `text-style-*` на
 * `className`, а пропорції всередині лишаються тими самими. Токенна шкала
 * тут дала б два розміри, які треба тримати в парі вручну.
 *
 * `tabular-nums` — не косметика: без нього цифри різної ширини «дихають»
 * при кожному оновленні суми, і колонка чисел перестає бути колонкою.
 */
import {
  splitMoneyParts,
  NARROW_NBSP,
  type FormatMoneyOptions,
} from "@sergeant/shared";
import { cn } from "@shared/lib/ui/cn";
import { CounterReveal } from "./CounterReveal";

/**
 * Тон приглушених тирів.
 *
 * AI-CONTEXT: тонів рівно два, і це навмисно. `muted` — для чисел
 * звичайного кольору тексту. `inherit` — для будь-якого ЗАБАРВЛЕНОГО числа
 * (успіх, небезпека, hero-ink на градієнті): тири беруть той самий колір і
 * гасяться прозорістю. До цього кожна поверхня вигадувала свій приглушений
 * колір символу (`text-brand-700 dark:text-success/70` в одному місці,
 * `text-muted` в сусідньому), і та сама роль виглядала по-різному.
 * `currentColor` знімає це питання назавжди: тир не може розійтися з числом,
 * бо він і є число, тільки тихіше.
 */
export type MoneyTone = "muted" | "inherit";

const MUTED_CLASS: Record<MoneyTone, string> = {
  muted: "text-muted",
  inherit: "opacity-65",
};

export interface MoneyProps extends FormatMoneyOptions {
  /** Сума в гривнях (не в копійках). */
  amount: number;
  /**
   * Показувати копійки. За замовчуванням — ні: на більшості поверхонь
   * вони шум. Вмикай там, де копійка є частиною факту (розділення чека,
   * борг, точний залишок).
   */
  kopecks?: boolean;
  tone?: MoneyTone;
  /**
   * Анімувати ЦІЛУ частину через `CounterReveal` (вхідний tween від нуля).
   *
   * AI-CONTEXT: анімується лише ціле, і це не спрощення. Копійки та символ
   * під час відліку крутились би як окремі шумові елементи — рівно та
   * «жива» дрібнота, яка робить число неспокійним. Проміжні значення
   * форматуються тим самим `splitMoneyParts`, тож розряди не «стрибають»
   * між кадрами.
   *
   * Hard Rule #17 — `CounterReveal` займає слот ambient-motion на екрані.
   * Дві анімовані суми на одній поверхні — це вже дві анімації.
   */
  animate?: boolean;
  className?: string;
}

/**
 * Сума з розділенням на тири. Один DOM-вузол на частину, тож рядок
 * лишається виділюваним і копіюється як звичайний текст.
 */
export function Money({
  amount,
  kopecks = false,
  tone = "muted",
  animate = false,
  className,
  ...opts
}: MoneyProps) {
  const fractionOpts = {
    ...opts,
    minFractionDigits: opts.minFractionDigits ?? (kopecks ? 2 : 0),
  };
  const parts = splitMoneyParts(amount, fractionOpts);
  const muted = MUTED_CLASS[tone];

  return (
    <span className={cn("tabular-nums whitespace-nowrap", className)}>
      {parts.sign !== "" && (
        <span className={cn("text-[0.78em] font-normal", muted)}>
          {parts.sign}
        </span>
      )}
      {animate ? (
        <CounterReveal
          value={Math.abs(Number.isFinite(amount) ? amount : 0)}
          entranceFrom={0}
          format={(v) => splitMoneyParts(v, fractionOpts).integer}
        />
      ) : (
        parts.integer
      )}
      {parts.fraction !== "" && (
        <span className={cn("text-[0.64em] font-normal", muted)}>
          {parts.decimalSeparator}
          {parts.fraction}
        </span>
      )}
      {/* `NARROW_NBSP` константою, а не JSX-пробілом: `{" "}` схлопується
          разом із відступами розмітки, і символ прилипає до суми впритул.
          Перевірено рендером — на око дрібниця, у наборі помітна. */}
      <span className={cn("text-[0.72em] font-normal", muted)}>
        {NARROW_NBSP}
        {parts.symbol}
      </span>
    </span>
  );
}

/**
 * Дельта («+340 ₴», «−12 %») як ТИПОГРАФІЧНИЙ елемент, а не бейдж.
 *
 * AI-CONTEXT: бейдж — плашка з фоном і радіусом — це дефолт кожного
 * дашборда в медіані (анти-слоп §3.2). Тут те саме повідомлення несуть
 * знак і колір, без другого прямокутника поруч із першим. Заразом бейдж
 * ламав би вирівнювання в стовпчику: у плашки своя висота й свої відступи.
 *
 * Колір НЕ вирішує, чи це добре: `+340 ₴` доходу — успіх, `+340 ₴` витрат
 * — ні. Тому семантику задає викликач через `polarity`, а не знак числа.
 */
export interface DeltaProps {
  /** Значення дельти. Знак береться з нього. */
  value: number;
  /**
   * Що означає ЗРОСТАННЯ цього числа. `positive` — зростання добре
   * (дохід, накопичення), `negative` — зростання погане (витрати, борг),
   * `neutral` — просто зміна.
   */
  polarity?: "positive" | "negative" | "neutral";
  /** Одиниця після числа. `"₴"` за замовчуванням; `"%"` для часток. */
  symbol?: string;
  kopecks?: boolean;
  className?: string;
}

export function Delta({
  value,
  polarity = "neutral",
  symbol = "₴",
  kopecks = false,
  className,
}: DeltaProps) {
  const grew = value > 0;
  const colored = polarity !== "neutral" && value !== 0;
  const toneClass = !colored
    ? "text-muted"
    : (polarity === "positive") === grew
      ? "text-success"
      : "text-danger";

  return (
    <Money
      amount={value}
      signed
      kopecks={kopecks}
      symbol={symbol}
      // AI-CONTEXT: забарвлена дельта віддає тирам СВІЙ колір, а не
      // `text-muted`. Інакше знак і символ виходять сірими впритул до
      // зеленого числа — а знак тут несе половину повідомлення, і сірий
      // мінус біля червоної суми читається як чужий елемент. Нейтральна
      // дельта вже сама `text-muted`, тож там дефолтний тон правильний.
      tone={colored ? "inherit" : "muted"}
      className={cn("font-semibold", toneClass, className)}
    />
  );
}
