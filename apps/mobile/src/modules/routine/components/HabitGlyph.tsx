/**
 * Last validated: 2026-08-03
 * Status: Active
 *
 * Мобільний рендерер гліфа звички / категорії — пара до
 * `apps/web/src/modules/routine/components/HabitGlyph.tsx`.
 *
 * Канонічний набір slug-ів і read-time нормалізатор живуть у
 * `@sergeant/routine-domain` (`glyphs.ts`), спільні для обох платформ. Тут
 * лише мапа slug → компонент `lucide-react-native` і UA-підписи.
 *
 * AI-NOTE: `ROUTINE_GLYPH_ICONS` мусить покривати ВЕСЬ `ROUTINE_GLYPHS` —
 * `Record<RoutineGlyph, …>` змушує компілятор це перевірити, тож новий
 * доменний slug не доїде до рантайму без іконки.
 */
import {
  Activity,
  Award,
  Bell,
  BookOpen,
  Brain,
  Briefcase,
  Camera,
  CalendarCheck,
  Check,
  Clock,
  Coffee,
  Dumbbell,
  Droplet,
  Egg,
  FileText,
  Flame,
  Footprints,
  Heart,
  House,
  Leaf,
  Lightbulb,
  MessageCircle,
  Monitor,
  Moon,
  Package,
  PenLine,
  PiggyBank,
  Scale,
  Shield,
  ShoppingCart,
  Sparkles,
  Sun,
  Target,
  Truck,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react-native";
import { resolveHabitGlyph, type RoutineGlyph } from "@sergeant/routine-domain";

export const ROUTINE_GLYPH_ICONS: Record<RoutineGlyph, LucideIcon> = {
  check: Check,
  target: Target,
  flame: Flame,
  award: Award,
  sparkles: Sparkles,
  lightbulb: Lightbulb,
  droplet: Droplet,
  run: Footprints,
  dumbbell: Dumbbell,
  activity: Activity,
  heart: Heart,
  scale: Scale,
  utensils: UtensilsCrossed,
  egg: Egg,
  coffee: Coffee,
  leaf: Leaf,
  "shopping-cart": ShoppingCart,
  package: Package,
  brain: Brain,
  "book-open": BookOpen,
  pen: PenLine,
  monitor: Monitor,
  camera: Camera,
  "file-text": FileText,
  clock: Clock,
  bell: Bell,
  "calendar-check": CalendarCheck,
  moon: Moon,
  sun: Sun,
  home: House,
  briefcase: Briefcase,
  truck: Truck,
  "piggy-bank": PiggyBank,
  shield: Shield,
  tool: Wrench,
  "message-circle": MessageCircle,
};

export const ROUTINE_GLYPH_LABELS: Record<RoutineGlyph, string> = {
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

export function routineGlyphLabel(glyph: RoutineGlyph): string {
  return ROUTINE_GLYPH_LABELS[glyph];
}

export interface HabitGlyphProps {
  /** Сире значення з даних (slug або легасі-emoji). */
  value: string | null | undefined;
  size?: number;
  color?: string;
  testID?: string;
}

export function HabitGlyph({
  value,
  size = 16,
  color = "#57534e",
  testID,
}: HabitGlyphProps) {
  const glyph = resolveHabitGlyph(value);
  const IconCmp = ROUTINE_GLYPH_ICONS[glyph];
  return <IconCmp size={size} color={color} testID={testID} />;
}
