/**
 * Генератор палітри категорій Фініка + OKLCH-хелпери для гейтів.
 *
 * Last validated: 2026-08-11
 * Status: Active
 *
 * Чому генератор, а не таблиця хексів. Умова «жоден колір категорії не
 * сидить на hue модульного акценту» перевіряється в OKLCH, а не на око.
 * Тримати hue-таблицю тут, а хекси — фрозен-літералом у `tokens.js`
 * (щоб споживачі не рахували математику на кожному імпорті) можна лише
 * доти, доки їх звіряє гейт: `categoryColors.contract.test.js` робить
 * deep-equal `tokens.categoryColors` ↔ `buildCategoryColors()`.
 *
 * Правити треба ТУТ (hue або тир), потім скопіювати вивід
 * `node packages/design-tokens/categoryColors.gen.js` у `tokens.js`.
 */

const srgb = (x) =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
const linear = (x) =>
  x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);

/** OKLCH → linear sRGB triplet (може вийти за гамут — див. `oklchToHex`). */
function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** sRGB hex → OKLCH. Використовується гейтом для заміру hue акцентів. */
export function hexToOklch(hex) {
  const [R, G, B] = hexToRgb(hex).map(linear);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const H = (Math.atan2(b, a) * 180) / Math.PI;
  return { L, C: Math.hypot(a, b), H: H < 0 ? H + 360 : H };
}

export function hexToRgb(hex) {
  const n = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
}

/** Відносна яскравість (WCAG 2.x). */
export function relativeLuminance(hex) {
  const [R, G, B] = hexToRgb(hex).map(linear);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** Контраст двох hex-кольорів (WCAG 2.x). */
export function contrastRatio(a, b) {
  const x = relativeLuminance(a) + 0.05;
  const y = relativeLuminance(b) + 0.05;
  return Math.max(x, y) / Math.min(x, y);
}

/**
 * OKLCH → hex із гамут-мапінгом: якщо колір не влазить у sRGB, ріжемо
 * хрому кроками, зберігаючи L і H. Так тир лишається на своїй світлоті
 * (а отже й контраст), навіть якщо hue «вузький» у sRGB.
 */
export function oklchToHex(L, C, H) {
  let c = C;
  let rgb = oklchToRgb(L, c, H);
  const out = (v) => v < -0.0005 || v > 1.0005;
  while (rgb.some(out) && c > 0) {
    c -= 0.002;
    rgb = oklchToRgb(L, c, H);
  }
  return (
    "#" +
    rgb
      .map((v) =>
        Math.round(Math.min(1, Math.max(0, srgb(v))) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/**
 * Hue кожної категорії + множник хроми. Дуга свідомо обходить смуги
 * модульних акцентів (teal 182–186 · cyan 215–223 · lime 128 · rose 7)
 * і статус-червоний (25). Частотні категорії рознесені максимально.
 *
 * Два записи розділені НЕ кутом, а хромою, бо на дузі вільного hue вже
 * не лишилось (16 витратних категорій на 232°):
 *   `other`  — тепла нейтраль (C×0.12) між smoking 79 і charity 92;
 *   `income` — приглушена зелень на hue статусного `success` (162), за
 *              2° від `entertainment` (160). Повна хрома дала б там два
 *              однакові чипи, C×0.35 — ні: 160 читається як насичена
 *              мʼята, 162 як тиха шавлія. Дохід і витрата ніколи не
 *              ділять один сегмент діаграми (графіки будуються лише з
 *              витрат), тож розрізняти їх треба в стрічці операцій, де
 *              поруч стоїть підпис і зелена сума.
 *
 * П'ять категорій 2026-10-01 (`home`, `pets`, `telecom`, `p2p_transfer`,
 * `gifts`; рішення власника «c1») сіли не на нові hue, а на СЕРЕДИНИ
 * наявних проміжків із приглушеною хромою — вільних дуг у дозволених
 * смугах (40–113 · 143–167 · 238–352) уже не було, а повна хрома за 6–8°
 * від сусіда дала б парні чипи. Заміряно в OKLab проти всіх 18 наявних:
 * найближча пара за `tint` — 0.0086 (найслабша наявна `restaurant/travel`
 * — 0.0067), за `solid` — 0.030 (наявна найслабша — 0.027). Тобто нові не
 * гірші за найгірше, що вже було; колір, як і раніше, підсилює підпис, а
 * не замінює його.
 *   `p2p_transfer` — холодна «шавлієва» нейтраль (C×0.3): перекази людям —
 *              не категорія покупок, тож і не повинна мати «товарний»
 *              відтінок. Від теплої нейтралі `other` відрізняється hue.
 */
export const CATEGORY_HUES = /** @type {const} */ ({
  restaurant: [42, 1],
  travel: [53, 1],
  home: [59.5, 0.5],
  utilities: [66, 1],
  smoking: [79, 0.6],
  charity: [92, 1],
  sport: [105, 1],
  food: [145, 1],
  pets: [152.5, 0.6],
  entertainment: [160, 1],
  transport: [240, 1],
  telecom: [248.5, 0.4],
  education: [257, 1],
  subscriptions: [274, 1],
  p2p_transfer: [282.5, 0.3],
  shopping: [291, 1],
  beauty: [308, 1],
  gifts: [316.5, 0.65],
  health: [325, 1],
  debt: [342, 1],
  alcohol: [350, 0.6],
  other: [74, 0.12],
  income: [162, 0.35],
});

/** Світлота + базова хрома кожного тира. */
export const CATEGORY_TIERS = /** @type {const} */ ({
  tint: [0.945, 0.042],
  border: [0.885, 0.055],
  ink: [0.46, 0.105],
  solid: [0.62, 0.14],
  tintDark: [0.275, 0.045],
  inkDark: [0.85, 0.085],
});

/** Повна палітра категорій — джерело для літерала в `tokens.js`. */
export function buildCategoryColors() {
  /** @type {Record<string, Record<string, string>>} */
  const out = {};
  for (const [id, [H, k]] of Object.entries(CATEGORY_HUES)) {
    /** @type {Record<string, string>} */
    const tiers = {};
    for (const [tier, [L, C]] of Object.entries(CATEGORY_TIERS)) {
      tiers[tier] = oklchToHex(L, C * k, H);
    }
    out[id] = tiers;
  }
  return out;
}

// Прямий запуск — друкує блок для вставки в `tokens.js`.
if (process.argv[1] && process.argv[1].endsWith("categoryColors.gen.js")) {
  for (const [id, t] of Object.entries(buildCategoryColors())) {
    const body = Object.entries(t)
      .map(([k, v]) => `${k}: "${v}"`)
      .join(", ");
    const [H, k] = CATEGORY_HUES[id];
    console.log(`  ${id}: { ${body} }, // H ${H}${k === 1 ? "" : `, C×${k}`}`);
  }
}

/**
 * Матриці симуляції дихромазії (Viénot-Brettel-Mollon), застосовуються до
 * ЛІНІЙНОГО sRGB. Протанопія й дейтеранопія разом - близько 8% чоловіків;
 * тританопія рідкісна, але дешева в перевірці.
 */
const DICHROMACY = {
  protan: [
    [0.152, 1.053, -0.205],
    [0.115, 0.786, 0.099],
    [-0.004, -0.048, 1.052],
  ],
  deutan: [
    [0.367, 0.861, -0.228],
    [0.28, 0.673, 0.047],
    [-0.012, 0.043, 0.969],
  ],
  tritan: [
    [1.256, -0.077, -0.179],
    [-0.078, 0.931, 0.148],
    [0.005, 0.691, 0.304],
  ],
};

function toSrgb(v) {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** Як колір бачить дихромат. `kind` - `protan` / `deutan` / `tritan`. */
export function simulateDichromacy(hex, kind) {
  const lin = hexToRgb(hex).map(linear);
  return DICHROMACY[kind]
    .map((row) => row.reduce((sum, k, i) => sum + k * lin[i], 0))
    .map((v) => Math.min(1, Math.max(0, toSrgb(v))));
}

/**
 * Наскільки два кольори лишаються різними для НАЙГІРШОГО з трьох типів
 * дихромазії. Евклідова відстань у sRGB, шкала 0-441; практичний поріг
 * «сусідні сегменти ще розрізняються» - близько 60.
 *
 * AI-CONTEXT: заведено 2026-09-22 після того, як макро-шкала другої
 * ітерації пройшла всі наявні гейти (склад родини, hue поза модульними
 * смугами, контраст із text-white) і все одно виявилась непридатною:
 * білки й вуглеводи стояли на однаковій світлоті за 35° відтінку і під
 * протанопією зливались (18 одиниць). Жоден із тих гейтів такого не ловить,
 * бо всі вони дивляться на колір ПООДИНЦІ, а не на пару.
 */
export function worstDichromaticDistance(a, b) {
  return Math.min(
    ...["protan", "deutan", "tritan"].map((kind) => {
      const x = simulateDichromacy(a, kind);
      const y = simulateDichromacy(b, kind);
      return Math.hypot(...x.map((v, i) => (v - y[i]) * 255));
    }),
  );
}
