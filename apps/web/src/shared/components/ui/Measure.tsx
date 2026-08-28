/**
 * Last validated: 2026-08-06
 * Status: Active
 *
 * `Measure` — типографіка ВИМІРУ (анти-слоп П4,
 * `docs/05-design/design/anti-slop-strategy.md` §4/П4).
 *
 * `Money` закрив гривні. Але Sergeant рахує не лише їх: кілокалорії та
 * грами в Їжі, кілограми в Фізруку, відсотки в Рутині. До цього компонента
 * кожне з них набиралось рядком `{Math.round(x)} ккал` — тобто рівно тим
 * набором, який П4 і замінює, тільки поза Фініком.
 *
 * Правило те саме: **число домінує, одиниця прислуговує**.
 *
 *   −2,5 кг
 *   │ └┬┘└┬┘
 *   │  │  └─ одиниця: 0.72em, приглушена; вузький нерозривний перед нею
 *   │  └──── число ЦІЛКОМ, разом із дробовою частиною — повний кегль
 *   └─────── знак: 0.78em, приглушений; U+2212, не дефіс
 *
 * AI-CONTEXT: тирів тут ТРИ, а не чотири — і це не спрощення, а інше
 * правило. У `Money` копійки йдуть окремим приглушеним тиром, бо копійка
 * це сота частка гривні й у житті майже ніколи не важить так, як гривні.
 * У вимірі дробова частина важить: 0,5 кг — це пʼята частина 2,5 кг, а
 * 0,5 год — половина. Демотувати її означало б збрехати про величину.
 *
 * Саме тому це окремий компонент, а не `<Money symbol="кг">`: збігаються
 * шкала тирів (`numberTiers.ts`) і `tabular-nums`, але розкладка різна.
 *
 * Прозу компонент НЕ обслуговує. Речення на кшталт «1 г білка = 4 ккал»
 * лишається текстом — там число живе в мові, а не в колонці, яку звіряють.
 * Та сама межа, що й у таблиці винятків `Money` (див. П4 в стратегії).
 */
import { splitMoneyParts, NARROW_NBSP } from "@sergeant/shared";
import { cn } from "@shared/lib/ui/cn";
import {
  NUMBER_TONE_CLASS,
  TIER_SIGN,
  TIER_UNIT,
  type NumberTone,
} from "./numberTiers";

export interface MeasureProps {
  /** Величина в одиницях `unit` (не в базових — конверсію робить викликач). */
  value: number;
  /**
   * Одиниця виміру: `"ккал"`, `"кг"`, `"г"`, `"%"`, `"кг×повт"`.
   *
   * Порожній рядок пропускає весь вузол — для колонок, де одиниця стоїть
   * один раз у шапці, а тири й `tabular-nums` потрібні кожному числу.
   */
  unit: string;
  /**
   * Знаків після коми. За замовчуванням 0 — більшість поверхонь показує
   * округлене. Дробові там, де дріб є частиною факту (вага тіла, 2,5 кг
   * на штанзі).
   */
  fractionDigits?: number;
  /** Показувати `+` для додатних. Мінус ставиться завжди. */
  signed?: boolean;
  tone?: NumberTone;
  className?: string;
}

/**
 * Вимір із розділенням на тири. Один DOM-вузол на частину, тож рядок
 * лишається виділюваним і копіюється як звичайний текст.
 */
export function Measure({
  value,
  unit,
  fractionDigits = 0,
  signed = false,
  tone = "muted",
  className,
}: MeasureProps) {
  /*
    AI-CONTEXT: форматування бере `splitMoneyParts`, хоч це й не гроші.
    Не з ліні: там уже живе групування розрядів `uk-UA`, роздільник дробу
    з локалі (а не хардкод «,») і нормалізація знака в U+2212. Власний
    `toLocaleString` тут означав би другий формат чисел у репо — рівно те
    розходження, проти якого П4 і затіяно. Демотування дробу не
    успадковується: частини склеюються назад в один текстовий вузол.
  */
  const parts = splitMoneyParts(value, {
    symbol: unit,
    signed,
    minFractionDigits: fractionDigits,
  });
  const muted = NUMBER_TONE_CLASS[tone];
  const body =
    parts.fraction === ""
      ? parts.integer
      : `${parts.integer}${parts.decimalSeparator}${parts.fraction}`;

  return (
    <span className={cn("tabular-nums whitespace-nowrap", className)}>
      {parts.sign !== "" && (
        <span className={cn(TIER_SIGN, muted)}>{parts.sign}</span>
      )}
      {body}
      {parts.symbol !== "" && (
        <span className={cn(TIER_UNIT, muted)}>
          {NARROW_NBSP}
          {parts.symbol}
        </span>
      )}
    </span>
  );
}
