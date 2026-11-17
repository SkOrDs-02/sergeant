// @vitest-environment jsdom
/**
 * @status Active
 *
 * Докована панель сесії публікує свою смугу в `--sgt-session-dock-inset`,
 * щоб трей тостів ставав над «+ Вправа», а не на неї (E2E
 * `fizruk-active-workout`, тост «готовий до роботи офлайн» під курсором).
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SESSION_DOCK_INSET_VAR } from "@shared/hooks/useBottomInsetVar";
import { SessionDock } from "./SessionDock";

describe("SessionDock", () => {
  it("публікує смугу панелі, поки змонтована, і знімає після", () => {
    const root = document.documentElement;
    expect(root.style.getPropertyValue(SESSION_DOCK_INSET_VAR)).toBe("");

    const { unmount } = render(
      <SessionDock
        restTimer={null}
        onSkipRest={() => {}}
        onAdjustRest={() => {}}
      >
        <button type="button">Вправа</button>
      </SessionDock>,
    );
    expect(root.style.getPropertyValue(SESSION_DOCK_INSET_VAR)).toMatch(
      /^\d+px$/,
    );

    unmount();
    expect(root.style.getPropertyValue(SESSION_DOCK_INSET_VAR)).toBe("");
  });
});
