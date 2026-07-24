/**
 * Finyk mobile module — page registry and shared icon config.
 *
 * Keeps the list of Finyk sub-pages in one place so that `FinykNavGrid`,
 * the Stack layout (`app/(tabs)/finyk/_layout.tsx`) and future nav
 * surfaces (bottom-sheet menu, quick actions) stay in lock-step with a
 * single source of truth.
 *
 * The `id`s match the expo-router route names under `app/(tabs)/finyk/*`
 * (with `"overview"` mapped to the `index` route).
 *
 * This file is DOM-free — it is safe to import from tests and from the
 * future `@sergeant/finyk-domain` package if we ever lift the registry
 * out of the mobile app.
 */
import {
  Home,
  CreditCard,
  Target,
  BarChart3,
  Briefcase,
  type LucideIcon,
} from "lucide-react-native";

export type FinykPageId =
  | "overview"
  | "transactions"
  | "budgets"
  | "analytics"
  | "assets";

export interface FinykPageDef {
  id: FinykPageId;
  /** Ukrainian label shown in the native stack header and nav grid. */
  label: string;
  /** Short sub-title for nav-grid cards. */
  description: string;
  /** Lucide icon component for the nav grid. */
  Icon: LucideIcon;
  /** expo-router path relative to the Finyk tab root. */
  href: string;
}

export const FINYK_PAGES: readonly FinykPageDef[] = [
  {
    id: "overview",
    label: "Огляд",
    description: "Баланс, витрати місяця, тренди",
    Icon: Home,
    href: "/finyk",
  },
  {
    id: "transactions",
    label: "Операції",
    description: "Всі транзакції з пошуком та фільтрами",
    Icon: CreditCard,
    href: "/finyk/transactions",
  },
  {
    id: "budgets",
    label: "Планування",
    description: "Бюджети, ліміти, цілі",
    Icon: Target,
    href: "/finyk/budgets",
  },
  {
    id: "analytics",
    label: "Аналітика",
    description: "Розбивка за категоріями та мерчантами",
    Icon: BarChart3,
    href: "/finyk/analytics",
  },
  {
    id: "assets",
    label: "Активи",
    description: "Рахунки, підписки, борги",
    Icon: Briefcase,
    href: "/finyk/assets",
  },
] as const;

/**
 * Page ids in their canonical order — re-exported as a readonly
 * tuple for exhaustive-switch helpers in tests / selectors.
 */
export const FINYK_PAGE_IDS = FINYK_PAGES.map((p) => p.id) as ReadonlyArray<
  FinykPageDef["id"]
>;
