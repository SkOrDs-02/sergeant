/**
 * Контракт складу `chartHex` - дизайн-аудит 2026-07, бриф «Папір» §3;
 * склад макро-трійки переглянуто продуктовим аудитом 2026-09-16 (N-13).
 *
 * Проблема, яку правило закриває: токен може бути *зареєстрований* і при
 * цьому лишатись чужим системі. Макро-бар роками фарбувався у blue-500 /
 * yellow-500 / green-500 — жодного з цих hue немає в палітрі Sergeant,
 * лінтери мовчали (значення ж не hex у `className`, а токен), і на
 * lime-модулі бар читався як сторонній віджет. Наступна ітерація перевела
 * шкалу на бренд-hue cyan/rose/lime - рівно hue Фізрука/Рутини/Їжі, тож
 * бар почав читатись як чужі модульні акценти (N-13). Макроси дістали
 * власну родину за патерном `categoryColors` - перевіряється нижче.
 *
 * Правило для решти ключів (не протеїн/жир/вуглеводи): значення мусить
 * бути або тиром бренд-палітри (emerald / teal / cyan / cream / rose /
 * lime), або ink-нейтраллю, або статус-кольором. Статус - свідомий
 * виняток: «перевитрата» має бути червоною, і жоден бренд-hue цього не
 * замінить.
 *
 * Last validated: 2026-09-22
 * Status: Active
 */
import { describe, it, expect } from "vitest";
import { brandColors, chartHex, inkTheme, statusColors } from "./tokens.js";
import {
  hexToOklch,
  contrastRatio,
  worstDichromaticDistance,
} from "./categoryColors.gen.js";

const norm = (v) => String(v).trim().toLowerCase();

/** Усі тири бренд-палітри — плоским списком. */
const BRAND_TIERS = new Set(
  Object.values(brandColors)
    .flatMap((family) => Object.values(family))
    .filter((v) => typeof v === "string" && v.startsWith("#"))
    .map(norm),
);

/** Ink-нейтралі: текстові тири + поверхні «Чорнила». */
const INK_NEUTRALS = new Set(
  [...Object.values(inkTheme.text), ...Object.values(inkTheme.surface)]
    .filter((v) => typeof v === "string" && v.startsWith("#"))
    .map(norm),
);

/**
 * Статус-кольори. Дозволені лише під ключами з семантикою статусу —
 * інакше «це ж статус» стає лазівкою для будь-якого чужого hue.
 */
const STATUS = new Set(
  Object.values(statusColors)
    .filter((v) => typeof v === "string")
    .map(norm),
);
const STATUS_KEYS = new Set(["limit"]);

/** Макро-ключі - власна родина, перевіряється окремо нижче, не тут. */
const MACRO_KEYS = new Set(["protein", "fat", "carbs"]);

/**
 * Заборонені смуги hue (OKLCH, ±~15°) - ті самі, що й для `categoryColors`
 * (`categoryColors.gen.js`): жоден модульний акцент чи статус-червоний.
 */
const FORBIDDEN_HUE_BANDS = [
  [167, 201], // teal (Фінік) 182–186 ± запас
  [200, 238], // cyan (Фізрук) 215–223 ± запас
  [113, 143], // lime (Їжа) 128 ± запас
  [352, 360], // rose (Рутина) 7 ± запас (обгортає 0°, частина 1)
  [0, 22], // rose (Рутина) 7 ± запас (обгортає 0°, частина 2)
  [10, 40], // danger (статус «перевитрата») 25 ± запас
];
const inForbiddenBand = (h) =>
  FORBIDDEN_HUE_BANDS.some(([lo, hi]) => h >= lo && h <= hi);

describe("@sergeant/design-tokens — контракт складу chartHex", () => {
  for (const [key, value] of Object.entries(chartHex)) {
    if (MACRO_KEYS.has(key)) continue;
    it(`${key} (${value}) — бренд-hue, ink-нейтраль або дозволений статус`, () => {
      const v = norm(value);
      const allowed =
        BRAND_TIERS.has(v) ||
        INK_NEUTRALS.has(v) ||
        (STATUS_KEYS.has(key) && STATUS.has(v));
      expect(
        allowed,
        `chartHex.${key} = ${value} не належить ні бренд-палітрі, ні ink-нейтралям` +
          (STATUS.has(v)
            ? ` (це статус-колір, але ключ "${key}" не в STATUS_KEYS)`
            : ""),
      ).toBe(true);
    });
  }

  it("макро-шкала має власну родину, розведену з модульними акцентами (N-13)", () => {
    const macro = [chartHex.protein, chartHex.fat, chartHex.carbs].map(norm);
    expect(new Set(macro).size).toBe(3);
    for (const hex of macro) {
      const { H } = hexToOklch(hex);
      expect(
        inForbiddenBand(H),
        `${hex} (H ${H.toFixed(1)}) потрапляє в смугу модульного акценту чи danger`,
      ).toBe(false);
    }
  });

  it("текст text-white на кожному макро-сегменті тримає ≥4.5:1", () => {
    // AI-CONTEXT: той самий поріг, що зафіксував -700 тир у попередній
    // ітерації (Hard Rule #9) - нова родина мусить лишатись не гіршою.
    for (const key of MACRO_KEYS) {
      expect(contrastRatio(chartHex[key], "#ffffff")).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it("сам сегмент не зникає на темній панелі (≥1.8:1 до surfaceHi)", () => {
    // Друга межа тієї самої вилки. Гейт на `text-white` тягне колір УНИЗ, і
    // без противаги «зроби темніше» виглядає як безкоштовне покращення - а
    // кандидат L .32 у підборі 2026-09-22 давав до панелі 1.03:1, тобто
    // сегмент зливався з тлом і бар переставав існувати.
    for (const key of MACRO_KEYS) {
      expect(
        contrastRatio(chartHex[key], inkTheme.surface.surfaceHi),
        `chartHex.${key} тоне у фоні панелі`,
      ).toBeGreaterThanOrEqual(1.8);
    }
  });

  it("сусідні макро-сегменти лишаються різними для дихроматів", () => {
    // Чому окремий гейт, а не «і так видно»: попередня ітерація пройшла ВСІ
    // перевірки вище (склад родини, hue поза модульними смугами, контраст із
    // білим 6.7:1) і все одно була непридатна - білки й вуглеводи стояли на
    // однаковій світлоті за 35° відтінку, і під протанопією між ними лишалось
    // 18 одиниць із 441. Усі ті гейти дивляться на колір ПООДИНЦІ; цей - на
    // пару. Поріг 60 узятий із запасом: чинна трійка дає 76.
    const macro = [...MACRO_KEYS];
    for (let i = 0; i < macro.length; i += 1) {
      for (let j = i + 1; j < macro.length; j += 1) {
        const [a, b] = [macro[i], macro[j]];
        expect(
          worstDichromaticDistance(chartHex[a], chartHex[b]),
          `${a} (${chartHex[a]}) і ${b} (${chartHex[b]}) зливаються для дихромата`,
        ).toBeGreaterThanOrEqual(60);
      }
    }
  });
});
