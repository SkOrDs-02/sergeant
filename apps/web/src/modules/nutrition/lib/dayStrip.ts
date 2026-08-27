/**
 * Last validated: 2026-08-06
 * Status: Active
 *
 * Смуга дня — signature-view Їжі (анти-слоп П1,
 * `docs/05-design/design/anti-slop-strategy.md` §4/П1; мокап —
 * `mockups/product/signature-views.html`, рішення власника 2026-08-06).
 *
 * Діагноз той самий, що дав полотно Рутині й гребінь Фініку: запис страви
 * несе `time`, `macros.kcal` і `macroSource`, а журнал показує з них
 * рядок із числом. Втрачається двоє: КОЛИ людина їсть протягом доби і
 * СКІЛЬКИ з денного числа насправді відомо, а скільки вгадано з фото.
 *
 * Тут — чиста побудова смуги. Рендер — `DayStrip.tsx`.
 *
 * AI-CONTEXT: форма навмисно та сама, що в `monthOutflowComb` — стовпчики
 * на осі часу, один стовпчик на одиницю часу, суми всередині одиниці.
 * Гребінь каже це речення про місяць, смуга — про добу. Продукт із
 * власною мовою має кілька форм, ужитих послідовно; нова форма на кожен
 * модуль — це той самий слоп, лише дорожчий.
 */
import { isEstimatedMeal, type Meal } from "@sergeant/nutrition-domain";
import { macrosToTotals } from "@sergeant/shared";

/** Годин у добі — довжина осі. */
export const HOURS_IN_DAY = 24;

/**
 * Менше двох прийомів — смуги немає.
 *
 * Одна риска не показує ні розподілу, ні перекосу: щоб побачити «вечеря
 * майже така сама, як обід», потрібні принаймні дві. Той самий клас
 * рішення, що `MIN_ENTRIES` у гребені й `MIN_N` у крос-модульних
 * звʼязках — вид зʼявляється, коли має що сказати.
 */
export const MIN_MEALS = 2;

/** Одна година доби. */
export interface DayStripHour {
  /** 0..23 — позиція на осі. */
  hour: number;
  /** Усі калорії, зʼїдені в цю годину. */
  kcal: number;
  /** З них вгадані ШІ з фото. Завжди `<= kcal`. */
  estimatedKcal: number;
}

export interface DayStrip {
  /** Рівно 24 елементи, від 0 до 23. Порожні години теж тут. */
  hours: DayStripHour[];
  /** Найбільша година у ккал — нею нормується висота. */
  peakKcal: number;
  /** Скільки годин мають хоч якісь калорії. */
  filledHours: number;
  /**
   * Скільки записів не потрапило на вісь, бо не мають валідного часу.
   *
   * AI-DANGER: їх калорії ВХОДЯТЬ у денну суму й у `estimatedKcalShare`
   * дашборда, але стовпчика не мають — покласти запис без часу нікуди.
   * Число треба показати поруч зі смугою, інакше вона мовчки применшує
   * день: людина бачить чотири стовпчики, а в сумі шість страв.
   */
  unplacedCount: number;
  /**
   * Калорії дня — УСІ, разом із записами без часу.
   *
   * AI-DANGER: денні суми навмисно рахуються по всіх стравах, а стовпчики
   * — лише по розміщених. Два різні знаменники тут не помилка, а вимога:
   * частка здогадок мусить збігатися з `getDaySummary().estimatedKcalShare`
   * на дашборді, інакше два екрани покажуть різні відсотки про той самий
   * день. Рахувати частку по стовпчиках здається природним — і саме так
   * ця помилка й зʼявилась первісно: страва без часу на 900 ккал давала
   * 0% у смузі й 82% на дашборді.
   */
  dayKcal: number;
  /** Скільки з `dayKcal` вгадав ШІ з фото. Теж по ВСІХ стравах. */
  dayEstimatedKcal: number;
}

/** `"HH:MM"` → година й хвилина, або `null` для невалідного рядка. */
function parseHour(raw: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return hour;
}

/**
 * Скласти смугу з денного списку страв.
 *
 * Повертає `null`, коли показувати нема чого — викликач просто не рендерить
 * секцію. Порожнього стану немає навмисно: «замало даних» під порожньою
 * рамкою — це шум, а не інформація.
 */
export function buildDayStrip(meals: readonly Meal[]): DayStrip | null {
  if (meals.length < MIN_MEALS) return null;

  const hours: DayStripHour[] = Array.from(
    { length: HOURS_IN_DAY },
    (_, hour) => ({ hour, kcal: 0, estimatedKcal: 0 }),
  );
  let unplacedCount = 0;
  let placedMeals = 0;
  let dayKcal = 0;
  let dayEstimatedKcal = 0;

  for (const meal of meals) {
    const kcal = macrosToTotals(meal.macros).kcal;
    // Запис без калорій не має висоти й на смузі не існує. Це НЕ те саме,
    // що запис без часу: там є що показати, але нема куди покласти.
    if (kcal <= 0) continue;
    const estimated = isEstimatedMeal(meal);
    // Денні суми набираються ДО перевірки часу — див. `AI-DANGER` біля
    // `dayKcal`. Запис без часу не має стовпчика, але з дня не зникає.
    dayKcal += kcal;
    if (estimated) dayEstimatedKcal += kcal;
    const hour = parseHour(meal.time);
    if (hour === null) {
      unplacedCount += 1;
      continue;
    }
    const slot = hours[hour];
    if (!slot) continue;
    slot.kcal += kcal;
    if (estimated) slot.estimatedKcal += kcal;
    placedMeals += 1;
  }

  if (placedMeals < MIN_MEALS) return null;

  /*
    AI-CONTEXT: спільна шкала висоти тут ПРАВИЛЬНА — на відміну від
    гребеня Фініка, де дохід навмисно не ділить шкалу з відтоком.
    Різниця в тім, що там на одній картинці жили дві РІЗНІ величини
    (зарплата й окреме списання), і більша робила меншу невидимою. Тут
    усі стовпчики — калорії, одна величина. Спільна шкала і є те, заради
    чого вид існує: побачити, що вечеря майже така сама, як обід.
  */
  const peakKcal = hours.reduce((max, h) => (h.kcal > max ? h.kcal : max), 0);
  const filledHours = hours.reduce((n, h) => (h.kcal > 0 ? n + 1 : n), 0);

  return {
    hours,
    peakKcal,
    filledHours,
    unplacedCount,
    dayKcal,
    dayEstimatedKcal,
  };
}
