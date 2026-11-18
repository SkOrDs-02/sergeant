/** @vitest-environment jsdom */
/**
 * Сітка рядків підходу (зйомка зібраного застосунку 2026-11-18,
 * `fiz-program-start-2`): рядок із кошиком мав поля вужчі за сусідні.
 *
 * Корінь: на coarse-вказівнику страхувальне правило `styles/mobile.css`
 * піднімає кожну `<button>` до 44 px завширшки, тож кошик (`w-9`) ставав
 * 44 px, а порожня заглушка в інших рядках лишалась 36 px. Різниця в 8 px
 * забиралась із `flex-1` полів. Те саме з колонкою RPE у заголовку. jsdom
 * медіа-запитів не рахує, тож тест фіксує контракт розмітки: кожен
 * хвостовий слот (кошик чи заглушка, RPE у заголовку) несе явну coarse-
 * ширину 44 px, рівну тій, яку правило дасть кнопці.
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ExerciseMeasure } from "@sergeant/fizruk-domain/domain";

import { WorkoutSetColumnHeader, WorkoutSetRow } from "./WorkoutSetRow";

const COARSE_44 = "pointer-coarse:w-11";

function renderRows(measure: ExerciseMeasure) {
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
          isReadOnly={false}
          isCurrent={i === 0}
          isLast={i === 2}
          onChangeWeight={vi.fn()}
          onChangeReps={vi.fn()}
          onChangeDuration={vi.fn()}
          onChangeDistance={vi.fn()}
          rpe={null}
          onChangeRpe={vi.fn()}
          onApplyGhost={vi.fn()}
          onCheckTap={vi.fn()}
          onDelete={vi.fn()}
        />
      ))}
    </div>,
  );
}

describe("WorkoutSetRow · сітка колонок", () => {
  it.each<ExerciseMeasure>(["weight_reps", "time", "distance_time"])(
    "%s: слот кошика однаковий у кожному рядку і в заголовку, з кошиком чи без",
    (measure) => {
      const { container } = renderRows(measure);
      const trash = container.querySelectorAll('[data-set-slot="trash"]');
      // Заголовок + три рядки; кнопка видалення лише в останньому.
      expect(trash).toHaveLength(4);
      expect(
        Array.from(trash).filter((el) => el.tagName === "BUTTON"),
      ).toHaveLength(1);
      const widths = new Set(
        Array.from(trash).map((el) =>
          el.className
            .split(/\s+/)
            .filter((c) => /^(pointer-coarse:)?w-/.test(c))
            .join(" "),
        ),
      );
      expect(widths.size).toBe(1);
      expect([...widths][0]).toContain(COARSE_44);
    },
  );

  it("колонка RPE у заголовку на coarse така сама, як тригер у рядку", () => {
    const { container } = renderRows("weight_reps");
    const headerRpe = container.querySelector('[data-set-slot="rpe"]');
    expect(headerRpe?.className).toContain(COARSE_44);
  });
});
