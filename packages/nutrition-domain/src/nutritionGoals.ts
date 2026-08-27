/**
 * Append-only журнал цілей КБЖВ і чистий резолвер ефективної цілі дня.
 *
 * W1-KBJU-APPEND, СТАДІЯ 2. Тут ЛИШЕ типи і чисті функції — споживачів
 * поки НЕМАЄ за задумом: `NutritionPrefs.dailyTarget*` лишається єдиним
 * джерелом цілі для всіх 9 ретроспективних читачів (тижневий дайджест,
 * coach-снапшот, тижневий графік, рекомендації, stories + три mobile-
 * дзеркала). Cutover — стадія 3, і вона гейтиться відповіддю founder-а на
 * openQuestion «чи має редагування цілі перефарбовувати минуле».
 *
 * DOM-free: жодного `window`/`localStorage`/React і жодного `new Date()` —
 * споживають і `apps/web`, і `apps/mobile`, і потенційно сервер.
 *
 * Модель
 * ------
 * Період — незмінний факт наміру: «з дня `effectiveFrom` і далі юзер хотів
 * ось такі цілі». Ефективна ціль дня `D` = ОСТАННІЙ період з
 * `effectiveFrom <= D`. Наступний період автоматично закриває попередній —
 * власного `effectiveTo` в рядку немає і бути не повинно: дві дати на
 * сходинку означали б два джерела істини про той самий кордон.
 *
 * AI-CONTEXT: чотири рішення тут навмисні, і ламати їх не можна.
 *
 * 1. **Дата ДО найранішого періоду → `origin: 'unknown'`, а не найраніша
 *    ціль.** Ми ЧЕСНО не знаємо, що діяло тоді. Простягнути перший період
 *    назад у часі — це та сама ретроактивна брехня, від якої лікує вся
 *    задача, лише переставлена з кінця історії на її початок.
 * 2. **`origin` доїжджає до консюмера незміненим — зокрема `'backfill'`.**
 *    Стадія 3 мусить МОГТИ відрізнити реконструкцію (міграція 087
 *    припустила сьогоднішню ціль) від факту. Якщо резолвер «нормалізує»
 *    origin у 'manual', ця можливість зникає назавжди, і вибір founder-а
 *    між (a) малювати як звичайні / (b) з позначкою / (c) без відсотка
 *    стає нереалізовним.
 * 3. **`null` у полі цілі лишається `null`, не стає `0`.** «Ціль не
 *    задана» і «ціль нуль» — різні речі: нуль пофарбував би кожен день у
 *    провал. Консюмер сам вирішує не малювати відсоток.
 * 4. **Мʼяко видалений період (`deletedAt`) невидимий.** Це ретракція
 *    помилкового запису, а не редагування історії: тіло рядка ніхто не
 *    переписує, резолвер просто перестає його враховувати.
 *
 * Tie-break: кілька періодів з однаковим `effectiveFrom` (юзер поправив
 * ціль двічі за вечір) розвʼязуються по `createdAt` — виграє останній. За
 * рівних `createdAt` виграє останній у вхідному масиві: вхід приходить із
 * SQL з `ORDER BY`, і зберігати його порядок чесніше, ніж вигадувати
 * власний.
 *
 * Канон: docs/01-product/model/nutrition.md §4 / §12
 * Аудит: docs/90-work/audits/product-knowledge-nutrition.md § E-1 / H2
 */

/**
 * Звідки взявся період. Дзеркалить CHECK у `087_nutrition_goal_periods.sql`.
 *
 * `'backfill'` — РЕКОНСТРУКЦІЯ міграцією 087: ми не знаємо, що було
 * насправді, ми припустили тодішню поточну ціль.
 */
export type GoalOrigin = "manual" | "preset" | "tdee" | "backfill";

/**
 * `origin` ефективної цілі. Ширший за `GoalOrigin` на одне значення:
 * `'unknown'` означає «за цей день періоду НЕМАЄ» — день раніше за
 * найранішу відому сходинку.
 */
export type EffectiveGoalOrigin = GoalOrigin | "unknown";

/** Один рядок `nutrition_goal_periods` у доменній формі (camelCase). */
export interface GoalPeriod {
  readonly id: string;
  /** Kyiv-локальний day key `YYYY-MM-DD`, з якого діє ціль. */
  readonly effectiveFrom: string;
  readonly kcal: number | null;
  readonly proteinG: number | null;
  readonly fatG: number | null;
  readonly carbsG: number | null;
  readonly waterMl: number | null;
  readonly origin: GoalOrigin;
  /** ISO-8601. Tie-break, коли в один день лягло кілька періодів. */
  readonly createdAt: string;
  /** ISO-8601 tombstone ретракції. Не `null` → період невидимий. */
  readonly deletedAt?: string | null;
}

/**
 * Ціль, що діяла конкретного дня.
 *
 * `origin: 'unknown'` + усі значення `null` — це НЕ «ціль 0», це «ми не
 * знаємо». Консюмер має показати день без відсотка від цілі, а не як
 * провалений.
 */
export interface EffectiveGoal {
  readonly kcal: number | null;
  readonly proteinG: number | null;
  readonly fatG: number | null;
  readonly carbsG: number | null;
  readonly waterMl: number | null;
  readonly origin: EffectiveGoalOrigin;
  /** `id` періоду, з якого взято значення; `null` для `'unknown'`. */
  readonly sourcePeriodId: string | null;
  /** `effectiveFrom` періоду-джерела; `null` для `'unknown'`. */
  readonly effectiveFrom: string | null;
}

const UNKNOWN_GOAL: EffectiveGoal = {
  kcal: null,
  proteinG: null,
  fatG: null,
  carbsG: null,
  waterMl: null,
  origin: "unknown",
  sourcePeriodId: null,
  effectiveFrom: null,
};

/** `YYYY-MM-DD` — той самий формат, що `nutrition_water_log.date_key`. */
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isLive(p: GoalPeriod): boolean {
  return p.deletedAt == null;
}

/**
 * Порівняння day key-ів як РЯДКІВ.
 *
 * Це не лінь: `YYYY-MM-DD` з нулями попереду лексикографічно впорядкований
 * так само, як хронологічно. Парсити в `Date` було б і повільніше, і
 * небезпечніше — зʼявилась би залежність від таймзони середовища рівно в
 * тому місці, де вся суть у тому, що день уже зафіксований у Kyiv.
 */
function compareDayKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Чи `candidate` пізніший за `best` за (effectiveFrom, createdAt, порядок). */
function beats(candidate: GoalPeriod, best: GoalPeriod): boolean {
  const byDay = compareDayKeys(candidate.effectiveFrom, best.effectiveFrom);
  if (byDay !== 0) return byDay > 0;
  // Однаковий день — виграє пізніший `createdAt`. За рівних (або
  // непарсабельних) `createdAt` виграє той, хто йде пізніше у вхідному
  // масиві: `>=` замість `>` саме для цього.
  const candMs = Date.parse(candidate.createdAt);
  const bestMs = Date.parse(best.createdAt);
  if (Number.isNaN(candMs) || Number.isNaN(bestMs)) return true;
  return candMs >= bestMs;
}

function toEffective(p: GoalPeriod): EffectiveGoal {
  return {
    kcal: p.kcal,
    proteinG: p.proteinG,
    fatG: p.fatG,
    carbsG: p.carbsG,
    waterMl: p.waterMl,
    origin: p.origin,
    sourcePeriodId: p.id,
    effectiveFrom: p.effectiveFrom,
  };
}

/**
 * Ціль, що діяла в день `dateKey`.
 *
 * Вхід НЕ мусить бути відсортованим і МОЖЕ містити ретраговані періоди —
 * функція розбирається сама. Некоректний `dateKey` (не `YYYY-MM-DD`) дає
 * `'unknown'`, а не виняток: підсунути зіпсований ключ здатен будь-який
 * консюмер, і падати посеред рендера тижневого графіка — гірша поведінка,
 * ніж «цілі не знаю».
 *
 * @example
 *   resolveEffectiveGoal(periods, "2026-05-10").kcal; // → 1800
 */
export function resolveEffectiveGoal(
  periods: readonly GoalPeriod[],
  dateKey: string,
): EffectiveGoal {
  if (!DAY_KEY_RE.test(dateKey)) return UNKNOWN_GOAL;

  let best: GoalPeriod | null = null;
  for (const p of periods) {
    if (!isLive(p)) continue;
    if (!DAY_KEY_RE.test(p.effectiveFrom)) continue;
    // Період, що починається ПІСЛЯ цього дня, до нього не застосовується —
    // саме це й робить історію замороженою.
    if (compareDayKeys(p.effectiveFrom, dateKey) > 0) continue;
    if (best === null || beats(p, best)) best = p;
  }

  return best === null ? UNKNOWN_GOAL : toEffective(best);
}

/**
 * Ефективні цілі для кожного дня діапазону `[fromKey, toKey]` включно.
 *
 * Повертає `Map<dateKey, EffectiveGoal>` — форма, яку хоче тижневий
 * дайджест і 7-денний графік: один прохід замість `resolveEffectiveGoal`
 * на день.
 *
 * Порожня мапа, коли діапазон перевернутий (`from > to`) або ключі
 * некоректні — знову ж таки без винятку.
 */
export function resolveEffectiveGoalsForRange(
  periods: readonly GoalPeriod[],
  fromKey: string,
  toKey: string,
): Map<string, EffectiveGoal> {
  const out = new Map<string, EffectiveGoal>();
  if (!DAY_KEY_RE.test(fromKey) || !DAY_KEY_RE.test(toKey)) return out;
  if (compareDayKeys(fromKey, toKey) > 0) return out;

  // Живі періоди, впорядковані за (effectiveFrom, createdAt). Далі йдемо
  // днями і посуваємо курсор — O(days + periods), без повторного скану
  // журналу на кожен день.
  const live = periods
    .filter((p) => isLive(p) && DAY_KEY_RE.test(p.effectiveFrom))
    .slice()
    .sort((a, b) => {
      const byDay = compareDayKeys(a.effectiveFrom, b.effectiveFrom);
      if (byDay !== 0) return byDay;
      const aMs = Date.parse(a.createdAt);
      const bMs = Date.parse(b.createdAt);
      if (Number.isNaN(aMs) || Number.isNaN(bMs)) return 0;
      return aMs - bMs;
    });

  let cursor = 0;
  let current: GoalPeriod | null = null;
  for (const dateKey of enumerateDayKeys(fromKey, toKey)) {
    while (
      cursor < live.length &&
      compareDayKeys(live[cursor]!.effectiveFrom, dateKey) <= 0
    ) {
      current = live[cursor]!;
      cursor += 1;
    }
    out.set(dateKey, current === null ? UNKNOWN_GOAL : toEffective(current));
  }
  return out;
}

/**
 * Дні `[fromKey, toKey]` включно як `YYYY-MM-DD`.
 *
 * Рахуємо через `Date.UTC` і крок у добу. UTC тут БЕЗПЕЧНИЙ саме тому, що
 * ключ уже є Kyiv-локальним днем: ми лише перебираємо календарні мітки, а
 * не конвертуємо моменти часу, тож DST-переходи Києва на результат не
 * впливають (в UTC доба завжди 24 години).
 */
function* enumerateDayKeys(fromKey: string, toKey: string): Generator<string> {
  const [fy, fm, fd] = fromKey.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [ty, tm, td] = toKey.split("-").map(Number) as [number, number, number];
  const endMs = Date.UTC(ty, tm - 1, td);
  let ms = Date.UTC(fy, fm - 1, fd);
  while (ms <= endMs) {
    const d = new Date(ms);
    yield `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
      d.getUTCDate(),
    ).padStart(2, "0")}`;
    ms += 86_400_000;
  }
}
