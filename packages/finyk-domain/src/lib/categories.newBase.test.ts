/**
 * Last validated: 2026-10-01
 * Status: Active
 *
 * П'ять базових категорій витрат, додані 2026-10-01 (рішення власника «c1»):
 * «Звʼязок та інтернет», «Перекази людям», «Дім і ремонт», «Тварини»,
 * «Подарунки». Кожен MCC і кожне ключове слово з каталогу має тут власний
 * рядок: каталог — це дані, і розійтись із задумом він може мовчки.
 *
 * Окремий файл, а не `categories.test.ts`: там живуть тести поповнення банки
 * й ключових слів за імʼям банки.
 */
import { describe, expect, it } from "vitest";
import { categoryColors } from "@sergeant/design-tokens";
import {
  CATEGORY_RESOLUTION_ORDER,
  INTERNAL_TRANSFER_ID,
  MCC_CATEGORIES,
  P2P_TRANSFER_ID,
  P2P_TRANSFER_MCCS,
  mergeExpenseCategoryDefinitions,
} from "../constants";
import { getCatTiers } from "../domain/categories";
import { CATEGORY_ICON_SLUGS, categoryIconName } from "./categoryIcons";
import { getCategory, getExpenseCategoryForTransaction } from "./categories";
import {
  MANUAL_EXPENSE_PICKER,
  canonicalManualCategoryId,
} from "./manualTaxonomy";

const NEW_IDS = ["telecom", "home", "pets", "gifts", "p2p_transfer"] as const;

describe("нові категорії — цілісність каталогу", () => {
  it("кожна має підпис без емодзі, колір, гліф із закритого набору й чип у ручному пікері", () => {
    const pickerIds = new Set(MANUAL_EXPENSE_PICKER.map((d) => d.id));
    const allowedGlyphs = new Set<string>(CATEGORY_ICON_SLUGS);
    for (const id of NEW_IDS) {
      const cat = MCC_CATEGORIES.find((c) => c.id === id);
      expect(cat, id).toBeDefined();
      expect(/\p{Extended_Pictographic}/u.test(cat!.label), id).toBe(false);
      // Власний тир, а не fallback «першої кастомної» (колір категорії
      // «Транспорт»): `getCatTiers` без запису в палітрі віддав би саме його.
      expect(categoryColors[id], `палітра: ${id}`).toBeDefined();
      expect(getCatTiers(id)).toBe(categoryColors[id]);
      expect(allowedGlyphs.has(categoryIconName(id)), `гліф: ${id}`).toBe(true);
      expect(pickerIds.has(id), `ручний пікер: ${id}`).toBe(true);
      expect(canonicalManualCategoryId(id)).toBe(id);
    }
  });

  it("підписи — такі, як у рішенні власника", () => {
    const labels = Object.fromEntries(
      MCC_CATEGORIES.filter((c) => NEW_IDS.includes(c.id as never)).map((c) => [
        c.id,
        c.label,
      ]),
    );
    expect(labels).toEqual({
      telecom: "Звʼязок та інтернет",
      home: "Дім і ремонт",
      pets: "Тварини",
      gifts: "Подарунки",
      p2p_transfer: "Перекази людям",
    });
  });

  it("пікери бюджетів і фільтрів (merge) пропонують усі пʼять, «Інше» не змінило сенсу", () => {
    const ids = mergeExpenseCategoryDefinitions([]).map((c) => c.id);
    for (const id of NEW_IDS) expect(ids).toContain(id);
    // Внутрішній переказ у пікерах витрат так і не з'явився.
    expect(ids).not.toContain(INTERNAL_TRANSFER_ID);
  });

  it("порядок показу: нові — після старих і перед службовим «Внутрішній переказ»", () => {
    const ids = MCC_CATEGORIES.map((c) => c.id);
    expect(ids.slice(-6)).toEqual([
      ...NEW_IDS.slice(0, 5),
      INTERNAL_TRANSFER_ID,
    ]);
    expect(ids.indexOf("food")).toBeLessThan(ids.indexOf("telecom"));
  });

  // AI-DANGER: гейт на `P2P_TRANSFER_MCCS`. Якщо хтось «спростить» і покладе
  // 4829 у `mccs`, сервер почне штампувати його у БД назавжди.
  it("код переказу 4829 не лежить у mccs жодної категорії каталогу", () => {
    for (const mcc of P2P_TRANSFER_MCCS) {
      for (const cat of MCC_CATEGORIES) {
        expect(cat.mccs, `"${cat.id}" містить ${mcc}`).not.toContain(mcc);
      }
    }
    expect([...P2P_TRANSFER_MCCS]).toEqual([4829]);
    expect(P2P_TRANSFER_ID).toBe("p2p_transfer");
  });

  it("порядок резолву — та сама множина категорій, лише специфічні першими", () => {
    expect(CATEGORY_RESOLUTION_ORDER).toHaveLength(MCC_CATEGORIES.length);
    expect(new Set(CATEGORY_RESOLUTION_ORDER.map((c) => c.id))).toEqual(
      new Set(MCC_CATEGORIES.map((c) => c.id)),
    );
    expect(CATEGORY_RESOLUTION_ORDER.slice(0, 3).map((c) => c.id)).toEqual([
      "home",
      "pets",
      "gifts",
    ]);
  });
});

describe("Звʼязок та інтернет (telecom)", () => {
  it.each([4812, 4814, 4816])("MCC %i → telecom", (mcc) => {
    expect(getCategory("", mcc).id).toBe("telecom");
  });

  // Головний кейс звіту власника: «lifecell» падав в «Інше».
  it("«lifecell» → telecom — і за описом, і разом з MCC оператора", () => {
    expect(getCategory("lifecell", 0).id).toBe("telecom");
    expect(getCategory("lifecell", 4814).id).toBe("telecom");
    expect(getCategory("LIFECELL UA", 0).id).toBe("telecom");
  });

  it.each([
    "Kyivstar",
    "Київстар",
    "Лайфсел",
    "Vodafone Ukraine",
    "Водафон",
    "Укртелеком",
    "Ukrtelecom",
    "Datagroup",
    "Датагруп",
    "Triolan",
    "Тріолан",
    "Volia",
    "Інтернет",
    "Оплата інтернету",
    "Інтернет-провайдер Фрінет",
    "Поповнення мобільного",
    "Поповнення телефону",
  ])("«%s» → telecom", (desc) => {
    expect(getCategory(desc, 0).id).toBe("telecom");
  });

  it("4899 (кабельне ТБ, стрімінг) лишається «Підписками» — не вкрадений", () => {
    expect(getCategory("", 4899).id).toBe("subscriptions");
    expect(getCategory("Netflix", 4899).id).toBe("subscriptions");
  });

  it("«інтернет» переїхав із «Комунальних»; решта комуналки не зачеплена", () => {
    const utilities = MCC_CATEGORIES.find((c) => c.id === "utilities");
    expect(utilities?.keywords).not.toContain("інтернет");
    expect(getCategory("Водоканал", 0).id).toBe("utilities");
    expect(getCategory("Квартплата", 0).id).toBe("utilities");
  });

  // «інтернет» стоїть у списку ПІСЛЯ старих категорій, тож не краде в них
  // власні докази (до переїзду з «Комунальних» було так само).
  it("«інтернет» у описі не краде в категорій, що йдуть раніше", () => {
    expect(getCategory("Інтернет-аптека", 5912).id).toBe("health");
    expect(getCategory("Rozetka інтернет", 0).id).toBe("shopping");
  });
});

describe("Тварини (pets)", () => {
  // `0742` у JS-літералі — вісімкове число; Monobank шле 742.
  it.each([742, 5995])("MCC %i → pets", (mcc) => {
    expect(getCategory("", mcc).id).toBe("pets");
  });

  it.each([
    "MasterZoo",
    "Мастерзоо",
    "Зоомагазин «Лапа»",
    "Зоотовари",
    "Pet shop",
    "Ветеринарна клініка",
    "Ветклініка Айболить",
    "Ветаптека",
    "Ветлікар",
  ])("«%s» → pets", (desc) => {
    expect(getCategory(desc, 0).id).toBe("pets");
  });

  // Загальні слова старих категорій не крадуть: «магазин» у «Продуктах»,
  // «аптек» у «Здоровʼї». Без `CATEGORY_RESOLUTION_ORDER` обидва падали б.
  it("«зоомагазин» і «ветаптека» перемагають «магазин» і «аптек»", () => {
    expect(getCategory("Зоомагазин", 5411).id).toBe("pets");
    expect(getCategory("Ветаптека", 5912).id).toBe("pets");
    expect(getCategory("Магазин продуктів", 0).id).toBe("food");
  });

  it("«Зоопарк» — не тварини: це розваги", () => {
    expect(getCategory("Зоопарк", 7998).id).not.toBe("pets");
    expect(getCategory("Київський зоопарк", 0).id).not.toBe("pets");
  });
});

describe("Дім і ремонт (home)", () => {
  it.each([5200, 5211, 5231, 5251, 5261, 5712, 5713, 5714, 5718, 5719])(
    "MCC %i → home",
    (mcc) => {
      expect(getCategory("", mcc).id).toBe("home");
    },
  );

  it.each([
    "Епіцентр К",
    "EPICENTR",
    "Нова Лінія",
    "JYSK",
    "IKEA Київ",
    "Леруа Мерлен",
    "Leroy Merlin",
    "Меблі Сервіс",
    "Будмаркет",
    "Будівельний ринок",
  ])("«%s» → home", (desc) => {
    expect(getCategory(desc, 0).id).toBe("home");
  });

  it("побутова техніка (5722) — не дім і ремонт", () => {
    expect(getCategory("", 5722).id).not.toBe("home");
  });

  it("«магазин меблів» — дім, а не продукти", () => {
    expect(getCategory("Магазин меблі для дому", 0).id).toBe("home");
  });
});

describe("Подарунки (gifts)", () => {
  it.each([5193, 5947, 5992])("MCC %i → gifts", (mcc) => {
    expect(getCategory("", mcc).id).toBe("gifts");
  });

  it.each([
    "Квіти",
    "Магазин квітів",
    "Квітковий магазин",
    "Флорист",
    "Flowers & Co",
    "Букет на 8 березня",
    "Подарунок мамі",
    "Подарункова карта",
    "Gift shop",
  ])("«%s» → gifts", (desc) => {
    expect(getCategory(desc, 0).id).toBe("gifts");
  });

  // «квіт» без закінчення не береться: це місяць.
  it("«квітень» в описі переказу — не подарунок", () => {
    expect(getCategory("Оренда за квітень", 4829).id).toBe("p2p_transfer");
    expect(getCategory("Аванс за квітень", 0).id).toBe("other");
  });
});

describe("Перекази людям (p2p_transfer)", () => {
  it.each(["На білу картку", "луїзка", "522119******5309", "Іван Петренко"])(
    "переказ card-to-card (4829) «%s» без іншого доказу → p2p_transfer",
    (desc) => {
      expect(getCategory(desc, 4829).id).toBe("p2p_transfer");
    },
  );

  it.each([
    "Переказ на картку",
    "Переказ на карту іншого банку",
    "Переказ коштів",
    "P2P",
    "card2card",
    "Card to card",
    "З картки на картку",
  ])("опис «%s» → p2p_transfer", (desc) => {
    expect(getCategory(desc, 0).id).toBe("p2p_transfer");
  });

  it("без коду переказу й без опису переказу — «Інше», не p2p", () => {
    expect(getCategory("щось випадкове", 9999).id).toBe("other");
    expect(getCategory("Іван Петренко", 0).id).toBe("other");
  });

  // Рішення 4Б (2026-10-01): поповнення чужої банки — «Перекази людям»
  // з кодом переказу і без нього; імʼя банки категорії не задає.
  it.each([
    "Поповнення «Відпустка»",
    "Поповнення «Мрія»",
    "Поповнення банки «Нова машина»",
    "поповнення “Квартира”",
    '  Поповнення "Резерв"',
  ])("поповнення банки «%s» → перекази людям", (desc) => {
    expect(getCategory(desc, 4829).id).toBe("p2p_transfer");
    expect(getCategory(desc, 0).id).toBe("p2p_transfer");
  });

  it("борг за доказом сильніший за слабкий код переказу", () => {
    expect(getCategory("Погашення кредиту", 4829).id).toBe("debt");
    expect(getCategory("Переказ на кредитну картку", 0).id).toBe("debt");
    expect(getCategory("Погашення наступного платежу", 4829).id).toBe("debt");
  });

  it("мерчант із власним доказом сильніший за код переказу", () => {
    expect(getCategory("lifecell", 4829).id).toBe("telecom");
    expect(getCategory("Зоомагазин", 4829).id).toBe("pets");
  });

  // Внутрішній переказ ПЕРЕМАГАЄ: підтверджена пара матчера = явний override.
  it("явний override internal_transfer сильніший за 4829 і за опис переказу", () => {
    expect(
      getCategory("Переказ на картку", 4829, INTERNAL_TRANSFER_ID).id,
    ).toBe(INTERNAL_TRANSFER_ID);
    const tx = { description: "На білу картку", mcc: 4829 };
    expect(getExpenseCategoryForTransaction(tx, INTERNAL_TRANSFER_ID).id).toBe(
      INTERNAL_TRANSFER_ID,
    );
  });

  it("явний override на p2p_transfer і ручний запис із цією категорією резолвляться", () => {
    expect(getCategory("Магазин", 5411, "p2p_transfer").id).toBe(
      "p2p_transfer",
    );
    const manual = {
      description: "",
      categoryId: "p2p_transfer",
      source: "manual",
    };
    expect(getExpenseCategoryForTransaction(manual).label).toBe(
      "Перекази людям",
    );
  });
});

describe("серверний штамп і канонічний categoryId операції", () => {
  it("серверний слаг нової категорії має пріоритет над евристикою", () => {
    const tx = { description: "щось", mcc: 5411, categoryId: "telecom" };
    expect(getExpenseCategoryForTransaction(tx).id).toBe("telecom");
  });
});
