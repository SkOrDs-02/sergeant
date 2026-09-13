/**
 * Юніт-тести `shouldFetchCoachInsight` з `useHubDashboardState.ts`.
 *
 * Аудит PR-A1 (docs/work/specs/audits/2026-09-13-product-full-review.md):
 * `useHubDashboardState` викликав `useCoachInsight()` беззастережно, тож
 * Free-користувач у «Чистому режимі» щодня палив 20% денної AI-квоти
 * (5 запитів/добу, ADR-0085) за пораду, яку `HubInsightsBlock` не рендерить
 * взагалі. Ця функція — чисте дзеркало умови видимості з `HubDashboard.tsx`
 * (`s.hasRealEntry && !calmMode && showInsights`); тест фіксує, що обидва
 * місця не розійдуться мовчки.
 */

import { describe, it, expect } from "vitest";
import { shouldFetchCoachInsight } from "./useHubDashboardState";

describe("shouldFetchCoachInsight — гейт AI-квоти коуча (PR-A1)", () => {
  it("дозволяє запит, коли блок видимий: є перший запис, не Чистий режим, інсайти увімкнено", () => {
    expect(shouldFetchCoachInsight(true, false, true)).toBe(true);
  });

  it("забороняє запит у Чистому режимі, навіть якщо решта умов true", () => {
    expect(shouldFetchCoachInsight(true, true, true)).toBe(false);
  });

  it("забороняє запит, коли секцію «Інсайти» вимкнено в налаштуваннях дашборда", () => {
    expect(shouldFetchCoachInsight(true, false, false)).toBe(false);
  });

  it("забороняє запит до першого реального запису (FTUX)", () => {
    expect(shouldFetchCoachInsight(false, false, true)).toBe(false);
  });

  it("забороняє запит, коли всі три умови проти видимості", () => {
    expect(shouldFetchCoachInsight(false, true, false)).toBe(false);
  });
});
