# Internationalisation (i18n)

> **Last touched:** 2026-09-16 by @claude. **Next review:** 2027-03-16.
> **Status:** Active

Продукт **UA-first**: український каталог — джерело правди для кожного
рядка інтерфейсу, англійська локаль існує як **часткове накладання**
поверх нього (EN-foundation, ініціатива 0010). Runtime-бібліотеки
(`i18next`, `lingui`) немає й не планується: локаль резолвиться власним
хуком, а каталог — це типізовані константи.

## Документи

| Документ                         | Призначення                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| [`readiness.md`](./readiness.md) | Історія фаз 1–4, ESLint rule `no-cyrillic-jsx-literal`, allowlist burndown, стан EN-локалі. |

## Стан на 2026-09-16

- **Каталог модульний.** `apps/web/src/shared/i18n/uk.ts` — агрегатор, що
  спредом збирає `uk.core.ts` (9 груп: `loaders`, `status`, `actions`,
  `errors`, `sync`, `hub`, `experimentalSection`, `onboarding`, `auth`) і
  десять модульних файлів (`uk.finyk.ts`, `uk.fizruk.ts`, `uk.nutrition.ts`,
  `uk.routine.ts`, `uk.privacy.ts`, `uk.pricing.ts`, `uk.crossModuleLink.ts`,
  `uk.sergeant.ts`, `uk.dataDisclosure.ts`, `uk.dataExport.ts`,
  `uk.nutritionTdee.ts`). Разом ~32 групи верхнього рівня і ~1300 ключів.
- **Eager-поверхні імпортують лише `uk.core`.** Повний каталог важить
  ~128 kB сирих і до 2026-09-12 їхав у критичний шлях; тепер
  `AuthContext`, `settingsSectionsCatalog` і ще сім поверхонь беруть
  `@shared/i18n/uk.core`, а тест
  [`uk.core.eagerImports.test.ts`](../../../apps/web/src/shared/i18n/uk.core.eagerImports.test.ts)
  називає файл, який це порушив. Розбір — root
  [`AGENTS.md § Performance budgets`](../../../AGENTS.md#performance-budgets)
  (ратчет eager 280 → 268 kB).
- **Рішення власника 2026-09-16 (аудит дизайн-доків, варіант B): EN
  заморожено як фундамент.** Продукт лишається UA-first; перекладати
  каталог, писати гейт паритету `lint:i18n-parity` чи показувати
  перемикач мови в UI не плануємо, `?lang=en` лишається прихованим
  входом. Що змінюється — ерозія каталогу зупинена: allowlist
  `no-cyrillic-jsx-literal` тримає храповик `cyrillicJsxAllowlist = 300`
  у [`check-ui-canon-ratchet.mjs`](../../../scripts/check-ui-canon-ratchet.mjs)
  (`pnpm lint:ui-canon`, крок `pnpm lint`). Новий UA-рядок іде в
  `@shared/i18n`; дописати файл у allowlist можна, лише прибравши інший.
  Якщо власник колись обере EN як продуктову вимогу, робота буде
  передбачуваною, бо рядки вже в каталозі.
- **EN-локаль є, але часткова.** `en.ts` (~30 груп) плюс `en.pricing.ts` і
  `en.nutritionTdee.ts`; `getMessages(lang)` у `index.ts` накладає EN поверх
  UK (незакриті ключі лишаються українськими). `Locale = "uk" | "en"`,
  вибір — `useLocale.ts`: `?lang=` → `localStorage["sergeant:locale"]` →
  дефолт `uk`. Живих споживачів `useLocale()` — вісім (PricingPage,
  HubReports, кілька екранів Їжі). Механічної перевірки паритету EN ↔ UK
  немає і за рішенням вище не буде, поки EN не стане вимогою (S10-R2 у
  [`tech-debt/frontend.md`](../../work/specs/tech-debt/frontend.md) закрито
  рішенням «заморозити»).
- **ESLint.** `sergeant-design/no-cyrillic-jsx-literal` — `warn` з allowlist
  у `eslint.web.js` (не в `eslint.config.js`); allowlist
  [`apps/web/eslint.i18n-allowlist.json`](../../../apps/web/eslint.i18n-allowlist.json)
  — 300 файлів на 2026-09-16 (round-14 baseline 239; ріст зупинено
  храповиком, див. рішення вище). Burndown-codemod: [`scripts/codemods/i18n-burndown/`](../../../scripts/codemods/i18n-burndown/)
  (README — рівнем вище, у `scripts/codemods/`).

## Cross-links

- Каталог: [`apps/web/src/shared/i18n/`](../../../apps/web/src/shared/i18n/) (`index.ts` — `getMessages`, `SUPPORTED_LOCALES`, `parseLocale`).
- Тон і правила UA-копірайту: [`docs/product/copy/style-guide.uk.md`](../../product/copy/style-guide.uk.md); скіл `sergeant-copy-and-tone`.
- Web deep-dive item #18 (історичний roadmap): [`docs/work/specs/audits/2026-05-03-web-deep-dive/00-overview.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive/2026-05-03-web-deep-dive/00-overview.md).
