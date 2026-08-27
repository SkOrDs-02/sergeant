/**
 * Sergeant Design Tokens — raw visual values.
 *
 * Design Philosophy:
 * - Warm, friendly, approachable colors inspired by Duolingo/Yazio/Monobank
 * - Soft pastels with rich saturated accents
 * - Each color has semantic meaning in the app context
 *
 * These tokens are the single source of truth for web + mobile.
 * Consumers:
 *   - Tailwind preset (web + mobile) in ./tailwind-preset.js
 *   - Non-Tailwind code (e.g. native status bar color) via
 *     `import { brandColors } from "@sergeant/design-tokens/tokens"`.
 */

/** Primary Brand Colors */
export const brandColors = {
  // Primary accent — Emerald/Teal spectrum
  emerald: {
    50: "#ecfdf5",
    100: "#d1fae5",
    200: "#a7f3d0",
    300: "#6ee7b7",
    400: "#34d399",
    500: "#10b981",
    600: "#059669",
    700: "#047857",
    800: "#065f46",
    900: "#064e3b",
  },
  teal: {
    50: "#f0fdfa",
    100: "#ccfbf1",
    200: "#99f6e4",
    300: "#5eead4",
    400: "#2dd4bf",
    500: "#14b8a6",
    600: "#0d9488",
    700: "#0f766e",
    800: "#115e59",
    900: "#134e4a",
  },
  // Cyan — Sergeant v2 fizruk accent (introduced 2026-05 redesign).
  // Disambiguates fizruk module from finyk emerald. `cyan[700]` (#0e7490)
  // is the canonical fizruk primary; `cyan[800]` (#155e75) is the
  // WCAG-AA companion for solid fills behind `text-white`.
  cyan: {
    50: "#ecfeff",
    100: "#cffafe",
    200: "#a5f3fc",
    300: "#67e8f9",
    400: "#22d3ee",
    500: "#06b6d4",
    600: "#0891b2",
    700: "#0e7490",
    800: "#155e75",
    900: "#164e63",
  },
  // Warm cream backgrounds (replacing cold blue-gray)
  cream: {
    50: "#fefdfb",
    100: "#fdf9f3",
    200: "#faf3e8",
    300: "#f5ead8",
    400: "#eedcc4",
    500: "#e4ccab",
  },
  // Тепла троянда для Рутини (рішення власника Б1+Р2, 2026-08-07).
  //
  // AI-CONTEXT: рампа побудована як ІЗОЛЮМІНАНТНА до попередньої коралової —
  // відносна світлота кожного тира збережена (ΔL від −0.42% до +0.46%,
  // CR(rose,rose) = 1.00 у всіх десяти). Тому всі задокументовані
  // контрастні пари лишились чинними в межах 0.02, а драбина стріків у
  // темній темі має ті самі кроки (1.33 / 1.23 / 1.36 / 1.39).
  //
  // Чому не корал: rose-600/700/900 мали hue РІВНО 0° — той самий, що
  // `--c-danger` red-500 #ef4444. Тобто акцент Рутини був буквально одного
  // відтінку з семантикою помилки. Троянда сидить на 344–346°.
  //
  // AI-DANGER: ключ і далі зветься `rose` — перейменування на `rose`
  // винесене окремим кроком (58 Tailwind-класів у 25 файлах). Значення тут
  // трояндові; не «виправляй» їх назад під імʼя.
  rose: {
    50: "#fff5f6",
    100: "#ffe7eb",
    200: "#fed3db",
    300: "#fcb3c1",
    400: "#f68da4",
    500: "#eb7691",
    600: "#d15c7a",
    700: "#ac4c64",
    800: "#8d4256",
    900: "#753949",
  },
  // Fresh lime for Nutrition module
  lime: {
    50: "#f8fee7",
    100: "#effccb",
    200: "#dff99d",
    300: "#c8f264",
    400: "#b0e636",
    500: "#92cc17",
    600: "#71a30d",
    700: "#567c0f",
    800: "#466212",
    900: "#3b5314",
  },
  // Warm neutral (stone) — the HUB chrome family (2026-07 design-audit M1).
  // The hub/shell is a *neutral parent* so the four module accents
  // (finyk teal · fizruk cyan · routine rose · nutrition lime) each read
  // as the single point of colour on any screen. Previously the hub `brand`
  // token aliased teal, making the shell indistinguishable from finyk and
  // effectively a fifth accent. This warm-gray ramp pairs with the cream
  // page background yet carries no module hue of its own. Not a module
  // colour — never use it as a module accent (Hard Rule #12).
  stone: {
    50: "#fafaf9",
    100: "#f5f5f4",
    200: "#e7e5e4",
    300: "#d6d3d1",
    400: "#a8a29e",
    500: "#78716c",
    600: "#57534e",
    700: "#44403c",
    800: "#292524",
    900: "#1c1917",
  },
};

/**
 * Chart segments palette — soft organic colors for pie charts.
 * Harmonious, balanced, not too saturated.
 */
export const chartPalette = {
  1: "#10b981", // emerald-500 (primary)
  2: "#14b8a6", // teal-500
  3: "#eb7691", // rose-500
  4: "#92cc17", // lime-500
  5: "#60a5fa", // blue-400 (soft)
  6: "#a78bfa", // violet-400 (soft)
  7: "#fbbf24", // amber-400 (warm)
  8: "#f472b6", // pink-400 (soft)
};

export const chartPaletteList = Object.values(chartPalette);

/**
 * Кольори категорій витрат Фініка — окрема родина, НЕ похідна від
 * модульних акцентів (рішення власника 2026-08-11, репорт тестера
 * «якби лейби категорій мали кольорову диференціацію, було б легше
 * зчитувати»).
 *
 * AI-CONTEXT: чому окрема родина, а не бренд-палітра. Чотири з шести
 * бренд-родин уже зайняті модулями (teal=Фінік, cyan=Фізрук,
 * rose=Рутина, lime=Їжа), а stone — нейтральна хромота хабу. Тобто на
 * 16 категорій лишалося дві родини — фарбувати категорії бренд-тирами
 * означало б або повторювати hue між категоріями, або вносити акцент
 * чужого модуля всередину піддерева Фініка. Тому категорії дістали
 * власний набір hue, свідомо РОЗВЕДЕНИЙ із модульними.
 *
 * Заборонені смуги (OKLCH hue ±~15°, заміряно з самих токенів):
 *   teal 182–186 · cyan 215–223 · lime 128 · rose 7 · danger 25.
 * Жоден hue нижче в ці смуги не потрапляє — це гейт
 * `categoryColors.contract.test.js`, а не домовленість на словах.
 *
 * Тири на категорію:
 *   tint     — фон чипа/строки у світлій темі (OKLCH L .945, C ≤ .042)
 *   border   — межа того ж чипа (L .885)
 *   ink      — гліф і текст поверх `tint` (L .46) — ≥ 5.6:1 і на `tint`,
 *              і на фоні сторінки `#ecebe7`, і на білій картці
 *   solid    — насичений мід-тон для точок і сегментів діаграм (L .62)
 *   tintDark / inkDark — та сама пара для «Чорнила» (≥ 9.2:1)
 *
 * AI-GENERATED: packages/design-tokens/categoryColors.gen.js — правити
 * генератор (hue + тир), не хекси руками; гейт звіряє їх deep-equal.
 *
 * Чесне обмеження: 16 взаємно-розрізнюваних приглушених кольорів на
 * 232° дуги (після вирізання модульних смуг) не існує — сусідні пари
 * на кшталт `travel`/`utilities` різняться на 13°. Колір тут ПІДСИЛЮЄ
 * підпис, а не замінює його; частотні категорії (їжа, ресторан,
 * транспорт, покупки, здоровʼя) навмисно рознесені максимально.
 *
 * 17-й запис `income` (2026-08-13) — спільний тир УСІХ надходжень
 * (`salary`, `freelance`, `gift`, `refund`, `other-income` і легасі
 * `in_*` та `internal_transfer`). До нього жодне з цих id не мало
 * запису в палітрі, тож `getCatTiers` віддавав їм перший fallback-тир —
 * і кожен чип доходу малювався кольором категорії «Транспорт». Дохід
 * навмисно ОДНОТИРНИЙ: вільного hue на 5 окремих кольорів уже немає,
 * а розрізняти види доходу має підпис, не відтінок. Відділений від
 * `entertainment` (160) хромою, не кутом — див. `categoryColors.gen.js`.
 */
export const categoryColors = {
  restaurant: {
    tint: "#fee7df",
    border: "#facebd",
    ink: "#874124",
    solid: "#ca653c",
    tintDark: "#3a2015",
    inkDark: "#febca2",
  }, // H 42
  travel: {
    tint: "#fee8db",
    border: "#f7d0b8",
    ink: "#844514",
    solid: "#c66a25",
    tintDark: "#392112",
    inkDark: "#fbbf9a",
  }, // H 53
  utilities: {
    tint: "#fee9d4",
    border: "#f3d3b3",
    ink: "#7e4a00",
    solid: "#bd7200",
    tintDark: "#37230e",
    inkDark: "#f4c392",
  }, // H 66
  smoking: {
    tint: "#f6ebda",
    border: "#e5d7c1",
    ink: "#6b542d",
    solid: "#a18049",
    tintDark: "#2f2618",
    inkDark: "#e0cba9",
  }, // H 79, C×0.6
  charity: {
    tint: "#f7edce",
    border: "#e6d9b0",
    ink: "#6b5603",
    solid: "#a18304",
    tintDark: "#30270a",
    inkDark: "#e2cd8d",
  }, // H 92
  sport: {
    tint: "#f0efcf",
    border: "#dedcb2",
    ink: "#605a01",
    solid: "#928a07",
    tintDark: "#2b290c",
    inkDark: "#d6d190",
  }, // H 105
  food: {
    tint: "#dcf5dc",
    border: "#c3e3c3",
    ink: "#2c6730",
    solid: "#479c4d",
    tintDark: "#192d1a",
    inkDark: "#abddac",
  }, // H 145
  entertainment: {
    tint: "#d6f6e3",
    border: "#bbe5cd",
    ink: "#036944",
    solid: "#019f68",
    tintDark: "#112e20",
    inkDark: "#9cdfbb",
  }, // H 160
  transport: {
    tint: "#ddf0fe",
    border: "#b9dffa",
    ink: "#015e8c",
    solid: "#0a8fd1",
    tintDark: "#102a3b",
    inkDark: "#9cd6ff",
  }, // H 240
  education: {
    tint: "#e2eeff",
    border: "#c3dbfe",
    ink: "#2f5892",
    solid: "#4b86d9",
    tintDark: "#19283e",
    inkDark: "#b0d0fe",
  }, // H 257
  subscriptions: {
    tint: "#e7ecff",
    border: "#cdd7fe",
    ink: "#465292",
    solid: "#6d7dda",
    tintDark: "#21263e",
    inkDark: "#becbfe",
  }, // H 274
  shopping: {
    tint: "#eceaff",
    border: "#d9d3fc",
    ink: "#594c8e",
    solid: "#8874d3",
    tintDark: "#28233c",
    inkDark: "#cdc5fe",
  }, // H 291
  beauty: {
    tint: "#f3e7ff",
    border: "#e3d0f6",
    ink: "#684685",
    solid: "#9e6cc6",
    tintDark: "#2e2139",
    inkDark: "#ddbff9",
  }, // H 308
  health: {
    tint: "#fce4fd",
    border: "#eccdee",
    ink: "#754178",
    solid: "#b066b4",
    tintDark: "#332034",
    inkDark: "#ebbbed",
  }, // H 325
  debt: {
    tint: "#ffe4f4",
    border: "#f4cbe3",
    ink: "#7e3e68",
    solid: "#be619e",
    tintDark: "#371e2e",
    inkDark: "#f5b8dd",
  }, // H 342
  alcohol: {
    tint: "#fbe6ef",
    border: "#ebd1dc",
    ink: "#73495d",
    solid: "#ad718d",
    tintDark: "#322229",
    inkDark: "#e9c1d2",
  }, // H 350, C×0.6
  other: {
    tint: "#efece9",
    border: "#dcd8d4",
    ink: "#5c5750",
    solid: "#8c857b",
    tintDark: "#292725",
    inkDark: "#d2cdc7",
  }, // H 74, C×0.12 — тепла нейтраль
  income: {
    tint: "#e5f0ea",
    border: "#cfddd5",
    ink: "#465f52",
    solid: "#6c907d",
    tintDark: "#212a25",
    inkDark: "#bdd4c8",
  }, // H 162, C×0.35 — приглушена зелень, спільний тир усіх надходжень
};

/**
 * Палітра для КАСТОМНИХ категорій (їх id наперед невідомий). Порядок —
 * максимальний хроматичний крок між сусідами, щоб дві поспіль створені
 * категорії не виявились однакового відтінку.
 */
export const categoryFallbackOrder = [
  "transport",
  "restaurant",
  "shopping",
  "food",
  "health",
  "charity",
  "subscriptions",
  "travel",
  "entertainment",
  "beauty",
];

/**
 * Module-specific accent colors. Each module has its own personality.
 */
export const moduleColors = {
  finyk: {
    // 2026-07: shifted from emerald-500 (#10b981) to teal-700 (#0f766e).
    // Emerald-500 is the "Tailwind default" AI-slop tell — teal-700 is
    // deeper and more distinctive while staying in the same hue family.
    primary: "#0f766e", // teal-700
    secondary: "#0d9488", // teal-600
    surface: "#f0fdfa", // teal-50
    surfaceAlt: "#ccfbf1", // teal-100
  },
  fizruk: {
    primary: "#0e7490", // cyan-700 — disambiguates from finyk emerald (was teal-500 #14b8a6)
    secondary: "#0891b2", // cyan-600 — same family as primary (design-audit F5)
    surface: "#ecfeff", // cyan-50
    accent: "#c8f264", // lime-300 (CTA highlight)
  },
  routine: {
    primary: "#eb7691", // rose-500
    secondary: "#f68da4", // rose-400
    surface: "#fff5f6", // rose-50
    surfaceAlt: "#ffe7eb", // rose-100
  },
  nutrition: {
    primary: "#92cc17", // lime-500
    secondary: "#b0e636", // lime-400
    surface: "#f8fee7", // lime-50
    surfaceAlt: "#effccb", // lime-100
  },
};

/**
 * Module-accent RGB triplets for the `--module-accent-rgb` and
 * `--module-accent-strong-rgb` CSS variables exposed by
 * `ModuleAccentProvider`. Kept here (not in the React component) so
 * the triplets stay in lockstep with `moduleColors.primary` and
 * `brandColors.{emerald,teal,rose,lime}[700|800]` — the single source
 * of truth for Sergeant module branding.
 *
 * Shape: "R G B" (space-separated, no commas) so the value is directly
 * usable inside `rgb(…)` + Tailwind arbitrary values:
 *
 *   className="bg-[rgb(var(--module-accent-rgb)/0.1)]"
 *   className="bg-[rgb(var(--module-accent-strong-rgb))] text-white"
 *
 * The `strong` triplet is the WCAG-AA companion shade — `-800` for усіх
 * чотирьох модулів. It matches the `bg-{module}-strong` Tailwind utility.
 *
 * AI-CONTEXT (2026-08-07): routine стояв на `-700` і був єдиним винятком.
 * Обґрунтування в цьому ж коментарі («routine — той модуль, де -700 уже
 * тримає AA») міряло контраст проти БІЛОГО; на білому rose-700 справді
 * дає 5.29. Але `text-routine-strong` стоїть і на фоні сторінки, а там
 * після переходу на базу `#ecebe7` виходило 4.43 — нижче AA. Решта трьох
 * модулів на `-800` дають 5.8–6.4, тобто routine був сиротою і за
 * контрастом, і за тиром. `-800` (`#8d4256`) → 5.78 на фоні сторінки.
 * Значення тут мусить збігатися з `--c-routine-accent` у `theme.css` —
 * гейт `contrast.test.js` тепер читає саме цю мапу, а не свою копію.
 */
export const moduleAccentRgb = {
  finyk: { default: "15 118 110", strong: "17 94 89" }, // teal-700 / teal-800 (2026-07: was emerald-500/-700)
  fizruk: { default: "14 116 144", strong: "21 94 117" }, // cyan-700 / cyan-800 — disambiguates fizruk from finyk emerald (was teal-500 / teal-700). `strong` companion ≈ 7.5:1 on white for hover/active states.
  routine: { default: "235 118 145", strong: "141 66 86" }, // rose-500 / -800 (2026-08-07: was rose-700, 4.43 на фоні сторінки)
  nutrition: { default: "146 204 23", strong: "70 98 18" }, // lime-500 / -800
};

/**
 * «Чорнило» (Ink) — dark-first surface + text scale.
 *
 * Canonical values for the `.theme-dark` "Ink" visual direction (spec:
 * docs/90-work/planning/specs/chornylo-visual-direction.md § 1). A single
 * deep warm-charcoal surface with luminescent per-module accents; depth comes
 * from surface tint + accent border + glow, not a downward shadow.
 *
 * AI-CONTEXT: база була зелено-чорною (#0d1512 / #121c17 / #17231d) до
 * 2026-08-05. Зелений фон під зеленими tier-400 акцентами давав фон і акцент
 * одного hue — головний «tell» генерованого дизайну, через який наш скрін не
 * відрізнявся від чужих продуктів (docs/05-design/design/anti-slop-strategy.md
 * § 2, § 5/P1). Тепле вугілля розводить hue фону й акценту і водночас робить
 * теплу базу наскрізною ідеєю обох тем, а не збігом у світлій.
 * Контраст не постраждав — нова база трохи темніша, тож усі пари виросли:
 * текст strong 16.98 → 17.33, fg 15.93 → 16.26, muted 6.03 → 6.16 на фоні;
 * акценти tier-400 на фоні 8.18–12.55 → 8.35–12.81; ink-текст поверх
 * акцент-філу — ті самі числа (симетрична пара). Усе ≥ AA.
 *
 * `surface`/`text` are authored here as the source of truth for the `.dark`
 * CSS variables in apps/web/src/styles/theme.css. `accent` re-surfaces the
 * existing `brandColors.{emerald,cyan,rose,lime}[400]` tier-400 tones in
 * their module role — text placed over an accent fill is always `bg` ink
 * (#14100e), never white (spec § 1).
 */
export const inkTheme = {
  surface: {
    bg: "#14100e", // page background — тепле вугілля
    surface: "#1b1613", // cards, rows, nav, fields
    surfaceHi: "#221c18", // hover / input bg
    line: "rgba(255, 255, 255, 0.06)", // hairline
    lineStrong: "rgba(255, 255, 255, 0.12)", // prominent divider
  },
  text: {
    strong: "#f2f6f2", // display / headings — 17.33:1 on bg
    fg: "#e7f0ea", // body — 16.26:1 on bg
    // AI-CONTEXT (2026-08-21): обидва нейтральні тири підняті на один
    // щабель. Підпис `subtle` — «labels ≥12px only» — посилався на
    // послаблення WCAG до 3:1, якого для 12px НЕ ІСНУЄ: 3:1 діє від
    // 18.66px bold / 24px regular, а 12px — звичайний текст із порогом
    // 4.5:1. Тому старий `#5f6b64` давав 3.22 на картці й axe ловив
    // `[serious] color-contrast` на підписах `/settings [dark]` (розбір —
    // docs/90-work/tech-debt/frontend.md § «`text-subtle` у темній темі»).
    // Там же зафіксовано розвилку «підняти значення vs звузити роль»;
    // власник обрав перше (репорт тестера 2026-08-21: «сірі літери погано
    // видно»). `muted` пішов слідом, щоб драбина лишилась із трьома
    // помітними щаблями, а не двома.
    muted: "#a3aea6", // meta — 7.83:1 on surface (було #8a968e, 5.84)
    subtle: "#8a968e", // hints — 5.84:1 on surface (було #5f6b64, 3.22 = фейл AA)
  },
  accent: {
    finyk: brandColors.teal[400], // #2dd4bf (2026-07: was emerald-400 #34d399)
    fizruk: brandColors.cyan[400], // #22d3ee
    routine: brandColors.rose[400], // #f68da4
    nutrition: brandColors.lime[400], // #b0e636
  },
};

/** Status/semantic colors — consistent across app. */
export const statusColors = {
  success: "#10b981", // emerald-500
  warning: "#f59e0b", // amber-500
  danger: "#ef4444", // red-500
  info: "#0ea5e9", // sky-500
};

/**
 * WCAG-AA компаньйони до `statusColors` — те, що рендериться як ТЕКСТ
 * (`text-{c}-strong`) або як суцільний філ під `text-white`
 * (`bg-{c}-strong`). Насичені `-500` вище для цього не годяться.
 *
 * AI-CONTEXT (2026-08-07): ці значення жили лише в `tailwind-preset.js`
 * як літерали, і тому не мали гейта — `contrast.test.js` не імпортує
 * пресет. Наслідок знайшли перезаміром таблиці brandbook:
 * `warning-strong` на `amber-700` давав **4.21 на фоні сторінки**, тобто
 * фейлив AA, а підпис у пресеті стверджував 4.83. Число 4.83 не було
 * вигадкою — воно міряло стару кремову базу, яка зникла з переходом на
 * `#ecebe7`. Тепер мапа експортується, пресет її споживає, а тест читає
 * саме її: та сама схема, що закрила drift у `moduleAccentRgb`.
 *
 * Усі чотири на `-800` — один тир із чотирма модульними акцентами.
 * Змішані тири і були тим ґрунтом, на якому виростали сироти: система з
 * двома конвенціями не має способу відрізнити «свідомий виняток» від
 * «забули підняти».
 */
export const statusStrongHex = {
  success: "#065f46", // emerald-800 — 6.44:1 на #ecebe7 (was emerald-700, 4.60)
  warning: "#92400e", // amber-800   — 5.94:1 на #ecebe7 (was amber-700, 4.21 — фейл AA)
  danger: "#991b1b", // red-800     — 6.97:1 на #ecebe7 (was red-700, 5.42)
  info: "#075985", // sky-800     — 6.34:1 на #ecebe7 (was sky-700, 4.97)
};

/**
 * «Чорнило»-компаньйони до `statusStrongHex` — те, що рендериться як
 * ТЕКСТ статусу в ТЕМНІЙ темі.
 *
 * AI-CONTEXT (2026-08-21, репорт тестера «червоні літери в темній темі
 * погано видно»): `statusStrongHex` — тир -800, підібраний під світлу
 * базу. У «Чорнилі» він дає 1.9:1 (red-800 #991b1b на картці #1b1613),
 * тобто помилка форми була практично невидима. Дефект був системний, а
 * не в одному екрані: `text-{status}-strong` стоїть у 376 місцях, і лише
 * дві третини з них мали ручну пару `dark:text-{status}`. Друга третина
 * малювала темно-червоне по темному.
 *
 * Тому тир розвернуто через CSS-змінну `--c-{status}-ink`, а не ручні
 * `dark:`-пари в className (вони й були тим механізмом, який мовчки
 * пропустив третину місць). Значення — тир -400: рівно той самий щабель,
 * що вже несуть модульні акценти й `--c-chart-{status}` у темній темі,
 * тож система лишається з ОДНИМ тиром на тему, а не з мішанкою.
 *
 * Пороги на ink-поверхнях (bg #14100e / surface #1b1613 / surfaceHi
 * #221c18) — 6.09…11.33:1, найтісніше в danger.
 */
export const statusInkHex = {
  success: "#34d399", // emerald-400 — 9.33:1 на #1b1613
  warning: "#fbbf24", // amber-400   — 10.74:1 на #1b1613
  danger: "#f87171", // red-400     — 6.48:1 на #1b1613
  info: "#38bdf8", // sky-400      — 8.37:1 на #1b1613
};

/**
 * Святкування — єдиний hue поза чотирма модульними, який система
 * узаконює. Подія (сота доба серії, конфеті, level-up) не належить
 * жодному модулю, тож фарбувати її модульним акцентом було б брехнею.
 *
 * Пара, а не одне значення: amber-400 світиться на ink-базі, але дає
 * 1.66:1 на білому — для світлої теми береться AA-компаньйон amber-700
 * (5.02:1). Значення дзеркалять `--c-celebration` / `--c-streak-tier-100`
 * у `apps/web/src/styles/theme.css`.
 */
export const celebrationColors = {
  light: "#b45309", // amber-700 — 5.02:1 на білому
  dark: "#fbbf24", // amber-400 — люмінесцентний на ink
};

/**
 * Status colors as a flat hex map — alias of `statusColors` for inline
 * SVG / canvas / native status-bar call sites that can't consume the
 * Tailwind `text-success` / `bg-danger` utilities (body-highlighter,
 * raw `<path stroke>` attrs, etc.). Same values as `statusColors`;
 * exposed under `statusHex` so web-only code uses one consistent name
 * across `@shared/lib/themeHex`, chart series and mobile status bar.
 */
export const statusHex = {
  success: statusColors.success,
  warning: statusColors.warning,
  danger: statusColors.danger,
  info: statusColors.info,
};

/**
 * Elevation scale — semantic, layered shadows for the entire surface
 * stack. Each level pairs a `light` and `dark` recipe; consumers read
 * the corresponding CSS variable (`--shadow-e0…--shadow-e5`) so the
 * shadow flips automatically when `.dark` is toggled — never use
 * `dark:shadow-*` Tailwind variants (Hard Rule #13).
 *
 * Semantics (level → typical role → matching z-index tier):
 *   e0  flat        no shadow — page background / sections / inputs    z-base
 *   e1  raised      default `Card`, list rows, panels                  z-base
 *   e2  interactive hover lift on cards / buttons / pressables         z-base
 *   e3  overlay     popovers, dropdowns, menus, segmented hover        z-dropdown
 *   e4  modal       Modal panels, Sheets, drawers                      z-modal
 *   e5  toast       Toasts, snackbars, top-most ephemeral surfaces     z-toast
 *
 * Why two themes:
 *   In light mode the shadow is the dominant depth cue (soft warm
 *   umber with a faint inset top highlight to mimic a physical
 *   surface). In dark mode the surface itself can't get darker than
 *   the background, so we lean on a *stronger* shadow + a brighter
 *   inset top edge to read a level up. Same level → same perceived
 *   prominence across themes.
 *
 * Authoring rule:
 *   Always pick the smallest level that conveys the role. Don't reach
 *   for `e4` on a card just because it should "pop"; that's how the
 *   UI started looking flat and amateur — every surface used the same
 *   muddy `shadow-card`. The pairing with z-index tier is intentional:
 *   if you bump elevation, you bump the z-tier too (and vice versa).
 */
export const elevation = {
  e0: {
    light: "none",
    dark: "none",
  },
  e1: {
    light:
      "0 1px 2px rgba(28, 25, 23, 0.04), 0 2px 6px rgba(28, 25, 23, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
    dark: "0 1px 2px rgba(0, 0, 0, 0.30), 0 2px 6px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.03)",
  },
  e2: {
    light:
      "0 1px 3px rgba(28, 25, 23, 0.06), 0 6px 16px rgba(28, 25, 23, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
    dark: "0 2px 4px rgba(0, 0, 0, 0.35), 0 8px 20px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
  },
  e3: {
    light:
      "0 2px 8px rgba(28, 25, 23, 0.08), 0 12px 24px rgba(28, 25, 23, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.85)",
    dark: "0 3px 10px rgba(0, 0, 0, 0.40), 0 14px 30px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
  },
  e4: {
    light:
      "0 4px 16px rgba(28, 25, 23, 0.10), 0 24px 48px rgba(28, 25, 23, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.85)",
    dark: "0 6px 18px rgba(0, 0, 0, 0.45), 0 28px 56px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
  },
  e5: {
    light:
      "0 8px 24px rgba(28, 25, 23, 0.12), 0 32px 64px rgba(28, 25, 23, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.85)",
    dark: "0 10px 28px rgba(0, 0, 0, 0.50), 0 36px 72px rgba(0, 0, 0, 0.70), inset 0 1px 0 rgba(255, 255, 255, 0.07)",
  },
};

/**
 * Z-index tier — semantic stacking levels that must move in lockstep
 * with the elevation scale. Authoring rule: an element at elevation
 * `eN` belongs in the matching `z-*` tier (e0/e1/e2 → base, e3 →
 * dropdown, e4 → modal, e5 → toast). Mismatched pairs are how
 * popovers end up under modals and toasts get hidden by drawers.
 *
 * Numeric values are spaced so future intermediate tiers can be
 * inserted without renumbering. `sticky` sits above `dropdown`
 * because a sticky header should still cover a body-level popover.
 *
 *   z-base       0    — page content, cards, buttons, e0..e2 surfaces
 *   z-dropdown  50    — popovers, tooltips, menus, e3 surfaces
 *   z-sticky   100    — sticky headers, sticky table headers
 *   z-overlay  150    — non-modal overlays, scrims behind a modal
 *   z-modal    200    — Modal, Sheet, drawer (e4 surfaces)
 *   z-toast    300    — Toasts, snackbars (e5 surfaces; always on top)
 */
export const zTier = {
  base: "0",
  dropdown: "50",
  sticky: "100",
  overlay: "150",
  modal: "200",
  toast: "300",
};

/**
 * Chart hex tokens — semantic names for inline-styled chart primitives
 * that accept a raw `"#rrggbb"` string (SVG `fill` / `stroke`, canvas
 * contexts, `style={{ color }}`). Each key maps to exactly one design
 * intent so callers never reach for raw Tailwind hex values.
 *
 *   primary / forecast — default budget trend stroke
 *   limit              — "over budget" marker line (red-500)
 *   neutral            — the "Інше" bucket in category donuts (slate-400)
 *
 * Macro ring colors (kcal / protein / fat / carbs) live here too so the
 * Nutrition dashboard matches the mobile ring colors via a single
 * source of truth.
 */
export const chartHex = {
  limit: statusColors.danger, // #ef4444 — over-budget / limit line (статус, не бренд)
  neutral: inkTheme.text.subtle, // #8a968e — "Інше"/невикористана категорія; була slate-400 (холодна синя нейтраль, чужа теплій ink-системі). Читає `subtle`, а не `muted`: 2026-08-21 нейтральні тири підняли на щабель, і значення сегмента лишилось тим самим — рухати колір діаграми той підйом не мав.
  // Макро-шкала. Раніше — blue-500 / yellow-500 / green-500: жодного з цих
  // hue немає в палітрі Sergeant, і на lime-модулі бар читався як чужий
  // віджет. Шкала переведена на бренд-hue із семантикою:
  //   білки  → cyan  (сила, hue Фізрука)
  //   жири   → rose (щільна енергія, hue Рутини)
  //   вуглеводи → lime (паливо, рідний hue Їжі)
  // Тир -700, а не -600/-500 із пропозиції аудиту: сегменти несуть
  // `text-white`, і -600 не витягує 4.5:1 (cyan-600 3.68:1, lime-600
  // 3.03:1) — це був би прямий Hard Rule #9. Пари зафіксовані в
  // `contrast.test.js`, склад шкали — в `chartHex.contract.test.js`.
  protein: brandColors.cyan[700], // #0e7490 — 5.42:1 з text-white
  fat: brandColors.rose[700], // #ac4c64 — 5.34:1 з text-white
  carbs: brandColors.lime[700], // #567c0f — 4.90:1 з text-white
};
