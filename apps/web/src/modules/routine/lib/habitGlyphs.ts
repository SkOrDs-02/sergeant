/**
 * Last validated: 2026-08-03
 * Status: Active
 *
 * Web-бік реєстру гліфів Рутини: slug → іконка дизайн-системи + UA-підпис
 * для a11y і для пікера.
 *
 * Канонічний список slug-ів живе в `@sergeant/routine-domain` (`glyphs.ts`),
 * бо його читають і нормалізатори стану, і `apps/mobile`. Тут лише те, що
 * має сенс тільки у вебі: `IconName`-типізація і людські підписи.
 *
 * AI-NOTE: `satisfies readonly IconName[]` нижче — це і є гарантія, що
 * жоден slug не розʼїхався з атласом іконок. Якщо додаєш slug у доменний
 * `ROUTINE_GLYPHS`, компілятор змусить дописати іконку й підпис тут.
 */
import { ROUTINE_GLYPHS, type RoutineGlyph } from "@sergeant/routine-domain";
import type { IconName } from "@shared/components/ui/Icon";

// Компайл-тайм міст: кожен доменний slug мусить бути валідним `IconName`.
// Значення не використовується — важлива сама перевірка типу.
const _GLYPHS_ARE_ICONS = ROUTINE_GLYPHS satisfies readonly IconName[];
void _GLYPHS_ARE_ICONS;

/** UA-підписи гліфів — `aria-label` у пікері й `title` в списках. */
export const ROUTINE_GLYPH_LABELS: Readonly<Record<RoutineGlyph, string>> = {
  check: "Позначка",
  target: "Ціль",
  flame: "Вогонь",
  award: "Нагорода",
  sparkles: "Іскри",
  lightbulb: "Ідея",
  droplet: "Вода",
  run: "Біг",
  dumbbell: "Тренування",
  activity: "Активність",
  heart: "Здоровʼя",
  scale: "Вага",
  utensils: "Їжа",
  egg: "Білок",
  coffee: "Кава",
  leaf: "Спокій",
  "shopping-cart": "Покупки",
  package: "Посилка",
  brain: "Мозок",
  "book-open": "Читання",
  pen: "Письмо",
  monitor: "Екран",
  camera: "Фото",
  "file-text": "Документ",
  clock: "Час",
  bell: "Нагадування",
  "calendar-check": "Календар",
  moon: "Сон",
  sun: "Ранок",
  home: "Дім",
  briefcase: "Робота",
  truck: "Дорога",
  "piggy-bank": "Гроші",
  shield: "Захист",
  tool: "Побут",
  "message-circle": "Спілкування",
};

/** Людський підпис гліфа; невідомий slug віддає нейтральне «Іконка». */
export function routineGlyphLabel(glyph: RoutineGlyph): string {
  return ROUTINE_GLYPH_LABELS[glyph] ?? "Іконка";
}

export { ROUTINE_GLYPHS };
export type { RoutineGlyph };
