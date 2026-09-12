/**
 * Status: Active
 *
 * Гейт на те, щоб UA-каталог не повернувся на критичний шлях.
 *
 * AI-CONTEXT (2026-09-12): до поділу eager-бандл був 286.7 kB при ліміті
 * 280, і 128.4 з 147.1 kB сирих джерел чанку `cn` — це був каталог. Після
 * переводу дев'яти eager-поверхонь на `uk.core` число впало до 260.8 kB, а
 * `uk.ts`, `en.ts` та `index.ts` пішли з preload-графа зовсім.
 *
 * AI-DANGER: справжній гейт тут — `scripts/ci/check-eager-bundle.mjs`, бо
 * лише він міряє ФАКТ. Цей тест — ранній сигнал: він падає на етапі юнітів,
 * а не після повного білда, і називає точне місце. Але він бачить лише
 * перелічені нижче файли, тож САМ СОБОЮ повноти не дає: додаєш нову
 * eager-поверхню з копією — додай її і сюди.
 *
 * Чому список, а не автоматичний скан: «eager» визначається графом збірки,
 * якого в юніт-тесті немає. Спроба вгадати його статично дала б рівно ту
 * фальшиву впевненість, проти якої цей файл і стоїть.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Поверхні, які рендеряться до першого роуту (тост, лоадер, помилка роуту,
 * замок, онбординг-бейдж, оверлей чату, каталог секцій налаштувань,
 * міграція анонімних даних, auth-контекст).
 */
const EAGER_SURFACES = [
  "../../core/app/PageLoader.tsx",
  "../../core/app/RouteErrorElement.tsx",
  "../../core/auth/AuthContext.tsx",
  "../../core/durability/AnonymousDataMigrationProvider.tsx",
  "../../core/hub/HubChatOverlay.tsx",
  "../../core/hub/settingsSectionsCatalog.ts",
  "../../core/onboarding/DemoModeBadge.tsx",
  "../../core/security/AppLock.tsx",
  "../components/ui/Toast.tsx",
] as const;

const read = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

/**
 * Повний каталог — це `@shared/i18n/uk` (зшиває десять модульних файлів) і
 * `@shared/i18n` (додає ще й en-копію). Обидва шляхи бувають і відносними:
 * саме на відносному `../../shared/i18n/uk` в `AuthContext.tsx` і трималось
 * останнє eager-ребро, уже після того як вісім інших поверхонь перевели.
 */
const FULL_CATALOGUE =
  /from\s+["'](?:@shared\/i18n|(?:\.{1,2}\/)+shared\/i18n)(?:\/uk)?["']/;

describe("UA-каталог не повертається на критичний шлях", () => {
  it.each(EAGER_SURFACES)("%s не імпортує повний каталог", (rel) => {
    expect(read(rel)).not.toMatch(FULL_CATALOGUE);
  });

  it("регекс ловить обидві форми — інакше гейт мовчатиме", () => {
    // Без цього тесту помилка в самому регексі зробила б усі перевірки
    // вище зеленими незалежно від коду. Саме так і виглядає мовчазний гейт.
    expect(`import { messages } from "@shared/i18n/uk";`).toMatch(
      FULL_CATALOGUE,
    );
    expect(`import { messages } from "@shared/i18n";`).toMatch(FULL_CATALOGUE);
    expect(`import { messages } from "../../shared/i18n/uk";`).toMatch(
      FULL_CATALOGUE,
    );
    // А вузькі шляхи — не ловить.
    expect(`import { coreMessages } from "@shared/i18n/uk.core";`).not.toMatch(
      FULL_CATALOGUE,
    );
    expect(
      `import { privacyMessages } from "@shared/i18n/uk.privacy";`,
    ).not.toMatch(FULL_CATALOGUE);
  });
});

describe("ядро лишається ядром", () => {
  it("`uk.core.ts` не тягне модульних каталогів", () => {
    // Ядро мусить бути листком. Один імпорт `./uk.fizruk` звідси повернув
    // би 29 kB на критичний шлях, і жоден тест вище цього не побачив би.
    const core = read("./uk.core.ts");
    expect(core).not.toMatch(/from\s+["']\.\/uk\.[a-z]/i);
    expect(core).not.toMatch(/from\s+["']\.\/(uk|en|index)["']/);
  });

  it("`uk.ts` розкладає ядро назад, а не дублює його", () => {
    // Інакше `messages.actions` і `coreMessages.actions` розійшлися б —
    // рівно той дрейф двох копій, який репозиторій уже ловив на тирах.
    const uk = read("./uk.ts");
    expect(uk).toContain('from "./uk.core"');
    expect(uk).toContain("...coreMessages,");
  });
});
