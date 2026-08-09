/**
 * Last validated: 2026-08-08
 * Status: Active
 *
 * V-7 audit finding (2026-08-08, `docs/90-work/audits/2026-08-08-profile-
 * settings-deep-audit.md`): `SETTINGS_SECTIONS_CATALOG`'s `title` feeds the
 * ⌘K palette, but three sections drew their OWN `<SettingsGroup
 * title="…">` from a hardcoded string that nothing compared against the
 * catalog — "Нагадування" (⌘K) vs "Сповіщення" (page), "AI-дайджести" vs
 * "AI Звіт тижня", "Експериментальні" vs "Додаткові можливості" all
 * drifted apart silently. The fix (`settingsSectionsCatalog.ts` →
 * `settingsSectionTitle(id)`) makes the three sections above READ the
 * catalog instead of re-typing the string, which removes the drift by
 * construction for THOSE three — this file pins that with a real render
 * assertion so a future revert (hardcoding the title again) fails loudly.
 *
 * The other 11 sections already matched by inspection (see PR description
 * / agent report) but had no regression guard either — `describe("full
 * catalog — static source parity")` below closes that gap for all 14
 * without paying the cost of mounting Finyk/Fizruk/Nutrition/Routine/
 * Privacy (each pulls in module-scoped hooks — bank sync, workout plans,
 * PIN/biometric flows — that are out of this fix's scope and, as of this
 * writing, under concurrent edit by other agents per the audit's
 * file-ownership split). It reads each section's OWN source text at test
 * run time (not a hand-copied string) and, for the three
 * message-catalog-driven sections, resolves the SAME `messages.*` path the
 * component reads — so it still catches drift on either side, just without
 * a DOM render.
 */
/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { messages } from "@shared/i18n/uk";
import { renderSettingsSection } from "../../test/helpers/collapsibleSection";
import {
  SETTINGS_SECTIONS_CATALOG,
  settingsSectionTitle,
} from "../hub/settingsSectionsCatalog";

const HERE = dirname(fileURLToPath(import.meta.url));

function catalogTitle(id: string): string {
  const section = SETTINGS_SECTIONS_CATALOG.find((s) => s.id === id);
  if (!section) throw new Error(`no catalog entry for id "${id}"`);
  return section.title;
}

// ---------------------------------------------------------------------
// Render assertions for the three sections this fix actually touches.
// Mocks below mirror the existing per-section test files
// (`NotificationsSection.test.tsx`) — copied rather than imported so this
// file stays a self-contained regression guard for the title contract,
// independent of what those other test files decide to mock later.
// ---------------------------------------------------------------------
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ warning: vi.fn() }),
}));
vi.mock("@shared/hooks/useModuleReminder", () => ({
  requestNotificationPermission: vi.fn(),
}));
vi.mock("../../modules/routine/hooks/useRoutineState", () => ({
  useRoutineState: () => ({
    routine: { prefs: { routineRemindersEnabled: false } },
    updatePref: vi.fn(),
  }),
}));
vi.mock("../../modules/fizruk/hooks/useMonthlyPlan", () => ({
  useMonthlyPlan: () => ({
    reminderEnabled: false,
    reminderHour: 9,
    reminderMinute: 0,
    setReminderEnabled: vi.fn(),
    setReminder: vi.fn(),
  }),
}));
vi.mock("../../modules/nutrition/lib/nutritionStorage", () => ({
  loadNutritionPrefs: () => ({ reminderEnabled: false }),
  persistNutritionPrefs: vi.fn(),
  NUTRITION_PREFS_KEY: "nutrition_prefs_v1", // gitleaks:allow — test mock of a storage-key constant, not a secret
}));
vi.mock("../components/PushNotificationToggle", () => ({
  PushNotificationToggle: () => <div data-testid="push-toggle" />,
}));
vi.mock("@shared/hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({ subscribed: false }),
}));
// AIDigestSection has no dedicated test file today — `useWeeklyDigest`
// itself pulls in the finyk/fizruk/nutrition/routine SQLite readers, well
// beyond what a title-parity check needs. Mocked to the minimal shape the
// component reads (`digest`, `weekRange`).
vi.mock("../insights/useWeeklyDigest", () => ({
  useWeeklyDigest: () => ({ digest: null, weekRange: "1–7 січня" }),
}));

import { NotificationsSection } from "./NotificationsSection";
import { AIDigestSection } from "./AIDigestSection";
import { ExperimentalSection } from "./ExperimentalSection";

describe("V-7: fixed sections render exactly the catalog title", () => {
  it("NotificationsSection heading matches settingsSectionTitle('notifications')", () => {
    renderSettingsSection(<NotificationsSection />);
    const expected = settingsSectionTitle("notifications");
    const heading = screen.getByText(expected);
    expect(heading.closest("h2")).not.toBeNull();
  });

  it("AIDigestSection heading matches settingsSectionTitle('ai')", () => {
    renderSettingsSection(<AIDigestSection />);
    const expected = settingsSectionTitle("ai");
    const heading = screen.getByText(expected);
    expect(heading.closest("h2")).not.toBeNull();
  });

  it("ExperimentalSection heading matches settingsSectionTitle('experimental')", () => {
    renderSettingsSection(<ExperimentalSection />);
    const expected = settingsSectionTitle("experimental");
    const heading = screen.getByText(expected);
    expect(heading.closest("h2")).not.toBeNull();
  });

  // `messages.experimentalSection.title` більше НЕ рендериться секцією —
  // заголовок іде з каталогу. Але значення лишили в i18n як дзеркало, і
  // саме дзеркало без читача — це нова точка розходження, тобто рівно та
  // вада, яку закриває V-7. Досі воно трималось лише випадково:
  // `ExperimentalSection.test.tsx` шукає тригер через `getByText(COPY.title)`,
  // тож розходження впало б там із невиразною помилкою «текст не знайдено».
  // Пінимо рівність явно, щоб фейл називав причину.
  it("i18n mirror `messages.experimentalSection.title` дорівнює каталогу", () => {
    expect(messages.experimentalSection.title).toBe(
      settingsSectionTitle("experimental"),
    );
  });
});

// ---------------------------------------------------------------------
// Static source-parity for the full 14-section catalog. Not a render test
// (see file header) — reads each section's `<SettingsGroup title=…>` prop
// straight out of its source file at test run time, then compares it (or,
// for the three message-driven sections, its RESOLVED value) against the
// catalog. Excludes notifications/ai/experimental, already covered above
// by an actual DOM render.
// ---------------------------------------------------------------------
function extractSettingsGroupTitleSource(absPath: string): string {
  const src = readFileSync(absPath, "utf8");
  const match =
    /<SettingsGroup\b[\s\S]*?\btitle=(?:"([^"]*)"|\{([^}]*)\})/.exec(src);
  if (!match) {
    throw new Error(`could not find <SettingsGroup title=…> in ${absPath}`);
  }
  const literal = match[1];
  const expression = match[2];
  return literal !== undefined ? literal : (expression ?? "").trim();
}

interface StaticCase {
  id: string;
  file: string;
  /** Present only when the source's title prop is a `{expression}`, not a quoted literal. */
  expressionValue?: string;
}

const STATIC_CASES: readonly StaticCase[] = [
  { id: "dashboard", file: join(HERE, "DashboardSection.tsx") },
  { id: "plan", file: join(HERE, "PlanSection.tsx") },
  {
    id: "capabilities",
    file: join(HERE, "CapabilitiesSection.tsx"),
    expressionValue: messages.onboarding.capabilitiesGroupTitle,
  },
  {
    id: "feedback",
    file: join(HERE, "..", "feedback", "FeedbackSection.tsx"),
    expressionValue: messages.feedback.settingsTitle,
  },
  { id: "routine", file: join(HERE, "RoutineSection.tsx") },
  { id: "fizruk", file: join(HERE, "FizrukSection.tsx") },
  { id: "finyk", file: join(HERE, "FinykSection.tsx") },
  { id: "nutrition", file: join(HERE, "NutritionSection.tsx") },
  {
    id: "privacy",
    file: join(HERE, "PrivacySection.tsx"),
    expressionValue: messages.privacy.lock.sectionTitle,
  },
  { id: "pwa", file: join(HERE, "PWASection.tsx") },
  { id: "dataExport", file: join(HERE, "DataExportSection.tsx") },
];

describe("V-7: full catalog — static source parity (14 sections, no render)", () => {
  it.each(STATIC_CASES)(
    "$id: source title matches SETTINGS_SECTIONS_CATALOG",
    ({ id, file, expressionValue }) => {
      const sourceValue = extractSettingsGroupTitleSource(file);
      const rendered = expressionValue ?? sourceValue;
      expect(rendered).toBe(catalogTitle(id));
    },
  );

  it("covers every catalog id except the three render-tested above", () => {
    const renderTested = new Set(["notifications", "ai", "experimental"]);
    const catalogIds = SETTINGS_SECTIONS_CATALOG.map((s) => s.id).filter(
      (id) => !renderTested.has(id),
    );
    const staticIds = STATIC_CASES.map((c) => c.id);
    expect(new Set(staticIds)).toEqual(new Set(catalogIds));
  });
});
