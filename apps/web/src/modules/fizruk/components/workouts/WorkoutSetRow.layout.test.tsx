/** @vitest-environment jsdom */
/**
 * Сітка рядків підходу.
 *
 * Історія: на coarse-вказівнику страхувальне правило `styles/mobile.css`
 * піднімає кожну `<button>` до 44 px, тож кошик в останньому рядку (`w-9`)
 * ставав ширшим за заглушку в інших і зсував поля (зйомка 2026-11-18,
 * `fiz-program-start-2`). Рішення founder-а 2026-11-18: кошик виходить із
 * рядка взагалі (дія «Видалити підхід» під рядками, `WorkoutItemCard`), а
 * звільнене місце віддано полям. jsdom медіа-запитів не рахує, тож тест
 * фіксує контракт розмітки: у рядку немає кошика, хвостові слоти (RPE і ✓)
 * однакові в усіх рядках і в шапці.
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  EXERCISE_MEASURES,
  type ExerciseMeasure,
} from "@sergeant/fizruk-domain/domain";

import { WorkoutSetColumnHeader, WorkoutSetRow } from "./WorkoutSetRow";

const COARSE_44 = "pointer-coarse:w-11";

function renderRows(measure: ExerciseMeasure, isReadOnly = false) {
  return render(
    <div>
      <WorkoutSetColumnHeader measure={measure} />
      {[0, 1, 2].map((i) => (
        <WorkoutSetRow
          key={i}
          index={i}
          set={{ weightKg: 0, reps: 0 }}
          ghost={null}
          measure={measure}
          isReadOnly={isReadOnly}
          isCurrent={i === 0}
          onChangeWeight={vi.fn()}
          onChangeReps={vi.fn()}
          onChangeDuration={vi.fn()}
          onChangeDistance={vi.fn()}
          rpe={null}
          onChangeRpe={vi.fn()}
          onApplyGhost={vi.fn()}
          onCheckTap={vi.fn()}
        />
      ))}
    </div>,
  );
}

function widthOf(el: Element): string {
  return el.className
    .split(/\s+/)
    .filter((c) => /^(pointer-coarse:)?(min-)?w-/.test(c))
    .sort()
    .join(" ");
}

describe("WorkoutSetRow · сітка колонок", () => {
  it.each(
    EXERCISE_MEASURES.flatMap((m) => [
      [m, false],
      [m, true],
    ]) as Array<[ExerciseMeasure, boolean]>,
  )(
    "%s (лише читання: %s): кошика в рядку немає, хвостові слоти однакові",
    (measure, ro) => {
      const { container } = renderRows(measure, ro);
      expect(container.querySelector('[data-set-slot="trash"]')).toBeNull();
      expect(
        container.querySelector('button[aria-label^="Видалити підхід"]'),
      ).toBeNull();
      const rows = Array.from(container.querySelectorAll("[data-set-row]"));
      const header = container.querySelector("[data-set-header]");
      expect(rows).toHaveLength(3);
      for (const slot of ["rpe", "check"]) {
        const els = [header, ...rows].map((r) =>
          r?.querySelector(`[data-set-slot="${slot}"]`),
        );
        els.forEach((el) => expect(el).not.toBeNull());
        const widths = new Set(els.map((el) => widthOf(el!)));
        expect(widths.size).toBe(1);
        expect([...widths][0]).toContain(slot === "rpe" ? COARSE_44 : "w-11");
      }
      // Кількість колонок поля однакова в шапці й рядках.
      const grow = (el: Element | null) =>
        Array.from(el!.children).filter((c) =>
          c.className.split(/\s+/).includes("flex-1"),
        ).length;
      rows.forEach((r) => expect(grow(r)).toBe(grow(header)));
    },
  );

  it.each<ExerciseMeasure>(["time", "reps"])(
    "%s: єдине поле бере всю ширину полів, без порожньої заглушки",
    (measure) => {
      const { container } = renderRows(measure);
      const row = container.querySelector("[data-set-row]");
      const header = container.querySelector("[data-set-header]");
      for (const el of [row, header]) {
        const grow = Array.from(el!.children).filter((c) =>
          c.className.split(/\s+/).includes("flex-1"),
        );
        expect(grow).toHaveLength(1);
      }
    },
  );
});
