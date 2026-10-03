/**
 * Last validated: 2026-08-24
 * Status: Active
 *
 * Теплова шкала й геометрія тап-зон атласа мʼязів.
 *
 * AI-DANGER: `MuscleState.fatigue` з `recoveryCompute` — це НЕ частка 0..1,
 * а накопичувальний бал (пороги статусів там 2.2 «жовтий» і 4.5 «червоний»,
 * тож після двох важких сесій поспіль бал спокійно переходить за одиницю).
 * Атлас читає його як інтенсивність 0..1 — і саме на цьому стику ламався
 * рендер: `heatColor(1.6)` давало `color-mix(in oklab, … 219%, …)`, а
 * відсоток понад 100 у CSS невалідний, тож `stop-color` мовчки падав у
 * ЧОРНИЙ і перетренована група ставала суцільно чорною плямою
 * (браузерне QA 2026-08-23, `fz-14*.png`: 6 з 90 `<stop>` були невалідні,
 * усі — у грудях). Тому інтенсивність тут НАСИЧУЄТЬСЯ, а не обрізає дані:
 * усе, що понад 1, малюється максимально гарячим кольором шкали, і те саме
 * число показується як «100%», а не «160%».
 */

/**
 * Верхній край теплової шкали в одиницях `fatigue`. Одиниця — історична
 * калібровка атласа (шкала 0..1); змінювати її означає перефарбувати весь
 * силует, тож константа стоїть окремо й названа вголос.
 */
export const ATLAS_FATIGUE_FULL = 1;

/** Інтенсивність 0..1 для теплової шкали: насичується, не ламається. */
export function atlasIntensity(value: number): number {
  // `Number.isNaN`, а не `!Number.isFinite`: `Infinity` — це «максимально
  // гаряче», а не «холодне». Сплутати їх означало б пофарбувати найбільш
  // перевантажений мʼяз як відновлений.
  if (Number.isNaN(value) || value <= 0) return 0;
  return Math.min(1, value / ATLAS_FATIGUE_FULL);
}

/** Втома у відсотках для картки мʼяза — завжди 0..100. */
export function fatiguePercent(fatigue: number): number {
  return Math.round(atlasIntensity(fatigue) * 100);
}

/**
 * Кінці теплової шкали — var-backed (`--c-chart-{success,warning,danger}`
 * з `theme.css`), НЕ статичний hex: hex, обчислений один раз на module-eval,
 * не реагує на `.dark`/`html.hc` (дизайн-аудит TH1/TH7). Інтерполяцію
 * робить браузер через `color-mix()`.
 */
const HEAT_LOW = "rgb(var(--c-chart-success))";
const HEAT_MID = "rgb(var(--c-chart-warning))";
const HEAT_HIGH = "rgb(var(--c-chart-danger))";

/**
 * Інтенсивність 0..1 → CSS `color-mix()` по шкалі success → warning → danger.
 *
 * `null` нижче невеликої підлоги, щоб «холодні» мʼязи лишались нейтральною
 * заливкою силуету, а не вимитим бренд-відтінком.
 */
export function heatColor(value: number): string | null {
  const t = atlasIntensity(value);
  if (t <= 0.02) return null;
  const from = t < 0.5 ? HEAT_LOW : HEAT_MID;
  const to = t < 0.5 ? HEAT_MID : HEAT_HIGH;
  const k = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  // Подвійний запобіжник: навіть якби `atlasIntensity` колись повернув
  // щось поза межами, у CSS не потрапить відсоток поза 0..100.
  const pct = Math.min(100, Math.max(0, Math.round(k * 100)));
  return `color-mix(in oklab, ${to} ${pct}%, ${from})`;
}

/**
 * Мінімальний тап-таргет групи мʼязів у одиницях viewBox.
 *
 * `ATLAS_VIEWBOX` має ширину 164 одиниці, а сам `<svg>` на сторінці атласа
 * рендериться приблизно у 260–300 CSS-px, тобто масштаб ≈1.6 px на одиницю.
 * 28 одиниць ≈ 45 px — тобто підлога 44×44 для coarse-pointer виконується
 * з невеликим запасом навіть на найвужчому телефоні.
 */
export const ATLAS_MIN_HIT_UNITS = 28;

/**
 * Мінімальний «слоп» навколо КОЖНОЇ групи, навіть великої.
 *
 * Потрібен не заради розміру, а заради дірок ВСЕРЕДИНІ групи: груди — це два
 * окремі полігони з проміжком ≈2.8 одиниці між половинами, і клік рівно в
 * центр bounding-box групи потрапляв у голий `<svg>` і не робив нічого
 * (браузерне QA 2026-08-23). 4 одиниці (по 2 з кожного боку) перекривають
 * такий проміжок.
 */
export const ATLAS_HIT_SLOP_UNITS = 4;

/** Bounding box набору полігонів у `points`-форматі SVG. */
export function atlasPolygonsBox(polygons: readonly string[]): {
  width: number;
  height: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const poly of polygons) {
    const nums = poly.trim().split(/\s+/).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = nums[i];
      const y = nums[i + 1];
      if (x === undefined || y === undefined) continue;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (minX === Infinity) return { width: 0, height: 0 };
  return { width: maxX - minX, height: maxY - minY };
}

/**
 * Ширина прозорого «hit»-штриха, який дотягує групу до `ATLAS_MIN_HIT_UNITS`.
 *
 * Штрих іде по КОНТУРУ мʼяза, а не по його bounding-box: прямокутник на всю
 * коробку групи накрив би сусідів цілком (front-deltoids і chest, наприклад,
 * майже повністю перетинаються по вертикалі), а штрих розширює зону рівно на
 * половину своєї ширини назовні. Тому великі групи отримують лише слоп, і
 * «крадіжка» кліків у сусіда лишається вузькою смужкою по межі.
 */
export function atlasHitStroke(polygons: readonly string[]): number {
  const { width, height } = atlasPolygonsBox(polygons);
  return Math.max(
    ATLAS_HIT_SLOP_UNITS,
    ATLAS_MIN_HIT_UNITS - width,
    ATLAS_MIN_HIT_UNITS - height,
  );
}
