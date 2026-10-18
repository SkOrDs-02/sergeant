/**
 * Юніт-тести `shouldFetchCoachInsight` з `useHubDashboardState.ts`.
 *
 * Аудит PR-A1 (docs/work/specs/audits/2026-09-13-product-full-review.md):
 * `useHubDashboardState` викликав `useCoachInsight()` беззастережно, тож
 * Free-користувач із вимкненим блоком щодня палив 20% денної AI-квоти
 * (5 запитів/добу, ADR-0085) за пораду, яку `HubInsightsBlock` не рендерить
 * взагалі. «Чистий режим» (`calmMode`) прибрано разом зі старою сіткою
 * (`hub-action-axis.md` PR 3). Ця функція — чисте дзеркало умови видимості з `HubDashboard.tsx`
 * (`s.hasRealEntry && showInsights`); тест фіксує, що обидва
 * місця не розійдуться мовчки.
 *
 * **Останній терм додано пізніше, і без нього гейт лікував половину.**
 * Прапорці кажуть лише «блок ЗМОНТОВАНО», а монтується він згорнутим:
 * `HubDashboard` передає `insightsDefaultOpen={false}` навмисно (рішення
 * «Тихо»). Тобто квота горіла в кожного, хто просто відкрив хаб, — уже
 * після того, як знахідку вважали закритою на вебі. Залишок PR-A1.
 */

import { describe, it, expect } from "vitest";
import { shouldFetchCoachInsight } from "./useHubDashboardState";

describe("shouldFetchCoachInsight — гейт AI-квоти коуча (PR-A1)", () => {
  it("дозволяє запит, коли блок видимий І розгорнутий", () => {
    expect(shouldFetchCoachInsight(true, true, true)).toBe(true);
  });

  it("забороняє запит, поки блок згорнутий — саме цей стан і є типовим", () => {
    // Не крайній випадок, а стандартний вхід на хаб: секція монтується
    // згорнутою за рішенням «Тихо», тож без цього терма запит ішов би в
    // кожного користувача при кожному відкритті хаба.
    expect(shouldFetchCoachInsight(true, true, false)).toBe(false);
  });

  it("забороняє запит, коли блок «Порада й тиждень» вимкнено в налаштуваннях дашборда", () => {
    expect(shouldFetchCoachInsight(true, false, true)).toBe(false);
  });

  it("забороняє запит до першого реального запису (FTUX)", () => {
    expect(shouldFetchCoachInsight(false, true, true)).toBe(false);
  });

  it("забороняє запит, коли всі умови проти видимості", () => {
    expect(shouldFetchCoachInsight(false, false, false)).toBe(false);
  });
});
