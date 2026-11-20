/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Побутові порції для найчастіших позицій корпусу базової їжі (OD-27 Х-1 а,
 * рішення власника 2026-11-18; спека
 * `docs/work/specs/nutrition-household-portions.md`, там же критерій вибору
 * позицій і походження ваг).
 *
 * Що це дає: «Яйце куряче» стартує з «1 яйце, 50 г», а не зі 100 г, і
 * кількість можна вводити яйцями. У запис, як і для власних порцій продукту,
 * їде лише `amount_g`: одиниця — спосіб ввести вагу.
 *
 * Чому окремо від корпусу (`@sergeant/shared/data/genericFoods`): локальна
 * база вже засіяна в IndexedDB без порцій і повторно сіди не перезаписує,
 * а серверний пошук віддає `defaultGrams` зі своєї таблиці. Порція тому
 * накладається в мить вибору продукту за стабільним id `gen_<slug>`, і так
 * діє однаково для локального і серверного хіта, без міграції сховищ.
 *
 * Формат стиснутий навмисно (дані їдуть у JS модуля Харчування, а запас
 * JS-бюджету малий): позиція — або число (лише типова вага, г), або список
 * пар [одиниця, г на одну одиницю]. Перша одиниця і є порцією за
 * замовчуванням. Вага — на ЇСТІВНУ частину, як `per100` корпусу.
 */
import type { FoodPortion } from "./foodDb";

/** Форми назви одиниці: 1, 2–4, 5+ і дробове число («1,5 скибки»). */
export type HouseholdForms = readonly [
  one: string,
  few: string,
  many: string,
  part: string,
];

/** Порція з корпусу: як власна, плюс форми назви для узгодження з числом. */
export interface HouseholdPortion extends FoodPortion {
  forms: HouseholdForms;
}

const f = (one: string, few: string, many: string, part: string) =>
  [one, few, many, part] as const;

export const HOUSEHOLD_UNITS = {
  slice: f("скибка", "скибки", "скибок", "скибки"),
  piece: f("штука", "штуки", "штук", "штуки"),
  glass: f("склянка", "склянки", "склянок", "склянки"),
  cup: f("чашка", "чашки", "чашок", "чашки"),
  can: f("банка", "банки", "банок", "банки"),
  bottle: f("пляшка", "пляшки", "пляшок", "пляшки"),
  wineglass: f("келих", "келихи", "келихів", "келиха"),
  shot: f("чарка", "чарки", "чарок", "чарки"),
  tbsp: f("столова ложка", "столові ложки", "столових ложок", "столової ложки"),
  tsp: f("чайна ложка", "чайні ложки", "чайних ложок", "чайної ложки"),
  scoop: f("мірна ложка", "мірні ложки", "мірних ложок", "мірної ложки"),
  handful: f("жменя", "жмені", "жмень", "жмені"),
  pack: f("пачка", "пачки", "пачок", "пачки"),
  pot: f("стаканчик", "стаканчики", "стаканчиків", "стаканчика"),
  bowl: f("тарілка", "тарілки", "тарілок", "тарілки"),
  wedge: f("шматок", "шматки", "шматків", "шматка"),
  bit: f("шматочок", "шматочки", "шматочків", "шматочка"),
  bar: f("батончик", "батончики", "батончиків", "батончика"),
  tablet: f("плитка", "плитки", "плиток", "плитки"),
  ball: f("кулька", "кульки", "кульок", "кульки"),
  half: f("половинка", "половинки", "половинок", "половинки"),
  egg: f("яйце", "яйця", "яєць", "яйця"),
  clove: f("зубчик", "зубчики", "зубчиків", "зубчика"),
  cob: f("качан", "качани", "качанів", "качана"),
  apple: f(
    "середнє яблуко",
    "середні яблука",
    "середніх яблук",
    "середнього яблука",
  ),
  pear: f("середня груша", "середні груші", "середніх груш", "середньої груші"),
  banana: f(
    "середній банан",
    "середні банани",
    "середніх бананів",
    "середнього банана",
  ),
  orange: f(
    "середній апельсин",
    "середні апельсини",
    "середніх апельсинів",
    "середнього апельсина",
  ),
  tangerine: f("мандарин", "мандарини", "мандаринів", "мандарина"),
  peach: f(
    "середній персик",
    "середні персики",
    "середніх персиків",
    "середнього персика",
  ),
  potato: f(
    "середня картоплина",
    "середні картоплини",
    "середніх картоплин",
    "середньої картоплини",
  ),
  tomato: f(
    "середній помідор",
    "середні помідори",
    "середніх помідорів",
    "середнього помідора",
  ),
  cucumber: f(
    "середній огірок",
    "середні огірки",
    "середніх огірків",
    "середнього огірка",
  ),
  carrot: f(
    "середня морквина",
    "середні морквини",
    "середніх морквин",
    "середньої морквини",
  ),
  onion: f(
    "середня цибулина",
    "середні цибулини",
    "середніх цибулин",
    "середньої цибулини",
  ),
  pepper: f(
    "середній перець",
    "середні перці",
    "середніх перців",
    "середнього перця",
  ),
  sausage: f("сосиска", "сосиски", "сосисок", "сосиски"),
  wiener: f("сарделька", "сардельки", "сардельок", "сардельки"),
  patty: f("котлета", "котлети", "котлет", "котлети"),
  dumpling: f("вареник", "вареники", "вареників", "вареника"),
  pelmen: f("пельмень", "пельмені", "пельменів", "пельменя"),
  pancake: f("млинець", "млинці", "млинців", "млинця"),
  crepe: f("налисник", "налисники", "налисників", "налисника"),
  syrnyk: f("сирник", "сирники", "сирників", "сирника"),
  derun: f("дерун", "деруни", "дерунів", "деруна"),
  cabbageRoll: f("голубець", "голубці", "голубців", "голубця"),
  drumstick: f("ніжка", "ніжки", "ніжок", "ніжки"),
} as const satisfies Record<string, HouseholdForms>;

export type HouseholdUnitKey = keyof typeof HOUSEHOLD_UNITS;

type Entry = number | readonly (readonly [HouseholdUnitKey, number])[];

/**
 * slug корпусу → типова вага (г) або побутові одиниці. Порядок і групи —
 * як у корпусі; список і джерела ваг — у спеці.
 */
export const HOUSEHOLD_PORTIONS: Readonly<Record<string, Entry>> = {
  // Хліб і випічка
  "khlib-pshenychnyi": [["slice", 30]],
  "khlib-zhytnii": [["slice", 30]],
  "khlib-tsilnozernovyi": [["slice", 30]],
  baton: [["slice", 25]],
  "khlib-tostovyi": [["slice", 25]],
  "khlibtsi-rysovi": [["piece", 8]],
  kruasan: [["piece", 60]],
  "pyrizhok-z-kapustoiu": [["piece", 70]],
  // Напої
  "kava-bez-tsukru": [["cup", 200]],
  "chai-bez-tsukru": [["cup", 250]],
  "apelsynovyi-sik": [["glass", 250]],
  late: [["cup", 300]],
  kapuchino: [["cup", 200]],
  kola: [
    ["can", 330],
    ["glass", 250],
  ],
  "pyvo-svitle-4-5": [
    ["bottle", 500],
    ["glass", 250],
  ],
  "vyno-sukhe": [["wineglass", 150]],
  "horilka-40": [["shot", 50]],
  // Молочні продукти
  "moloko-2-5": [["glass", 250]],
  "moloko-1": [["glass", 250]],
  "kefir-2-5": [["glass", 250]],
  riazhanka: [["glass", 250]],
  "iohurt-naturalnyi-2": [
    ["pot", 140],
    ["tbsp", 20],
  ],
  "iohurt-hretskyi-2": [
    ["pot", 140],
    ["tbsp", 20],
  ],
  "syr-kyslomolochnyi-5": [
    ["pack", 200],
    ["tbsp", 25],
  ],
  "syr-kyslomolochnyi-9": [
    ["pack", 200],
    ["tbsp", 25],
  ],
  "syr-tverdyi": [["slice", 15]],
  "syr-motsarela": [["ball", 125]],
  "smetana-20": [["tbsp", 20]],
  "smetana-15": [["tbsp", 20]],
  "vershkove-maslo": [
    ["tsp", 5],
    ["tbsp", 15],
  ],
  "syrok-hlazurovanyi": [["piece", 40]],
  // Яйця
  "iaitse-kuriache": [["egg", 50]],
  "iaitse-varene": [["egg", 50]],
  iaiechnia: 100,
  omlet: 150,
  // Фрукти і ягоди
  iabluko: [["apple", 160]],
  hrusha: [["pear", 160]],
  banan: [["banana", 120]],
  apelsyn: [["orange", 130]],
  mandaryn: [["tangerine", 80]],
  kivi: [["piece", 70]],
  persyk: [["peach", 150]],
  abrykos: [["piece", 35]],
  slyva: [["piece", 30]],
  khurma: [["piece", 170]],
  avokado: [["half", 70]],
  kavun: [["slice", 280]],
  vynohrad: [["glass", 150]],
  polunytsia: [["glass", 150]],
  chornytsia: [["glass", 145]],
  vyshnia: [["glass", 140]],
  // Овочі і гриби
  kartoplia: [["potato", 150]],
  tomat: [["tomato", 120]],
  "pomidor-cherri": [["piece", 15]],
  ohirok: [["cucumber", 120]],
  "perets-solodkyi": [["pepper", 120]],
  morkva: [["carrot", 70]],
  tsybulia: [["onion", 100]],
  chasnyk: [["clove", 4]],
  kukurudza: [["cob", 100]],
  "hryby-shampinony": [["piece", 20]],
  // Мʼясо і птиця
  "kuriacha-hrudka": 150,
  sosysky: [["sausage", 50]],
  sardelky: [["wiener", 90]],
  "kovbasa-varena": [["slice", 20]],
  shynka: [["slice", 20]],
  salo: [["slice", 15]],
  "kotleta-miasna": [["patty", 90]],
  "kotleta-kuriacha": [["patty", 90]],
  "kuriacha-nizhka": [["drumstick", 70]],
  // Горіхи і насіння
  myhdal: [["handful", 30]],
  "horikhy-voloski": [["handful", 30]],
  arakhis: [["handful", 30]],
  keshiu: [["handful", 30]],
  // Олії, соуси, солодке до чаю
  "olyvkova-oliia": [
    ["tbsp", 14],
    ["tsp", 5],
  ],
  "oliia-soniashnykova": [
    ["tbsp", 14],
    ["tsp", 5],
  ],
  maionez: [["tbsp", 15]],
  ketchup: [["tbsp", 15]],
  "soievyi-sous": [["tbsp", 15]],
  tsukor: [["tsp", 5]],
  med: [
    ["tsp", 8],
    ["tbsp", 21],
  ],
  varennia: [["tbsp", 20]],
  // Солодощі
  "chornyi-shokolad": [["tablet", 100]],
  "shokolad-molochnyi": [["tablet", 100]],
  "pechyvo-vivsiane": [["piece", 15]],
  "proteinovyi-batonchyk": [["bar", 50]],
  "tort-medovyk": [["wedge", 120]],
  // Крупи і злаки (типова порція без побутової одиниці)
  "vivsianka-sukha": 50,
  "vivsiani-plastivtsi-shvydki": 40,
  miusli: 40,
  "hrechka-varena": 150,
  "rys-varenyi": 150,
  "pasta-varena": 150,
  "bulhur-varenyi": 150,
  "pshono-varene": 150,
  "piure-kartopliane": 200,
  // Готові страви й українська кухня
  borshch: [["bowl", 300]],
  "kuriacha-lokshyna": [["bowl", 300]],
  "varenyky-z-kartopleiu": [["dumpling", 30]],
  "varenyky-z-syrom": [["dumpling", 30]],
  "varenyky-z-vyshneiu": [["dumpling", 30]],
  "varenyky-zamorozheni": [["dumpling", 20]],
  pelmeni: [["pelmen", 12]],
  "pelmeni-zamorozheni": [["pelmen", 12]],
  mlyntsi: [["pancake", 45]],
  "nalysnyky-z-syrom": [["crepe", 80]],
  syrnyky: [["syrnyk", 50]],
  deruny: [["derun", 60]],
  holubtsi: [["cabbageRoll", 120]],
  pitsa: [["wedge", 110]],
  "sushi-roll": [["bit", 30]],
  burher: [["piece", 220]],
  shaurma: [["piece", 350]],
  plov: 250,
  // Спортивне харчування
  "syrovatkovyi-protein": [["scoop", 30]],
};

export interface HouseholdServing {
  /** Типова вага, г: перша одиниця або число з таблиці. */
  defaultGrams: number;
  portions: HouseholdPortion[];
}

/** Побутова порція за id продукту (`gen_<slug>`); `null` — немає. */
export function householdServingFor(id: unknown): HouseholdServing | null {
  const raw = String(id ?? "");
  if (!raw.startsWith("gen_")) return null;
  const entry = HOUSEHOLD_PORTIONS[raw.slice(4)];
  if (entry == null) return null;
  if (typeof entry === "number") return { defaultGrams: entry, portions: [] };
  const portions = entry.map(([key, grams]) => {
    const forms = HOUSEHOLD_UNITS[key];
    // Стабільний id: памʼять «остання одиниця продукту» переживає сесію.
    return { id: `hh_${key}`, name: forms[0], grams, forms };
  });
  return { defaultGrams: portions[0]?.grams ?? 100, portions };
}

interface PickableFood {
  id?: string | number | undefined;
  defaultGrams?: number | undefined;
  portions?: FoodPortion[] | undefined;
}

/**
 * Продукт із побутовою порцією корпусу. Власні порції людини виграють: якщо
 * вона завела свої (продукт уже не базовий), корпус нічого не підмінює.
 */
export function withHouseholdServing<T extends PickableFood>(food: T): T {
  if ((food.portions?.length ?? 0) > 0) return food;
  const serving = householdServingFor(food.id);
  if (!serving) return food;
  return {
    ...food,
    defaultGrams: serving.defaultGrams,
    portions: serving.portions,
  };
}
