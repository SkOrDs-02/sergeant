/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { createRef, type ReactElement } from "react";
import { afterEach } from "vitest";
import { Button } from "./Button";

afterEach(cleanup);

/**
 * Smoke-level contract tests for the DS Button primitive. These lock the
 * publicly visible behaviour (disabled ⇄ loading, sr-only loading label,
 * forwardRef, type="button" default) so future refactors don't silently
 * regress consumers that rely on them.
 */
describe("Button", () => {
  it("renders children and defaults to type='button' (not 'submit')", () => {
    const { getByRole } = render(<Button>Зберегти</Button>);
    const btn = getByRole("button") as HTMLButtonElement;
    expect(btn.textContent).toBe("Зберегти");
    expect(btn.type).toBe("button");
  });

  it("is disabled and aria-busy when loading=true, even without disabled prop", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <Button loading onClick={onClick}>
        Зберегти
      </Button>,
    );
    const btn = getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("exposes an sr-only 'Завантаження…' label while loading", () => {
    const { getByText } = render(<Button loading>Зберегти</Button>);
    const sr = getByText("Завантаження…");
    expect(sr.className).toContain("sr-only");
  });

  it("forwards ref to the native <button> element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ok</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.textContent).toBe("Ok");
  });

  it("solid = чорнило на сторінці (мова H), темна перевертається токенами", () => {
    const { getByRole } = render(<Button variant="solid">Go</Button>);
    const cls = getByRole("button").className;
    expect(cls).toContain("bg-text");
    expect(cls).toContain("text-bg");
    expect(cls).not.toContain("dark:");
  });

  it.each(["xs", "sm", "md", "lg", "xl"] as const)(
    "%s: радіус 8 px, без тіні, масштабу й glow",
    (size) => {
      const { getByRole } = render(
        <Button size={size} variant="solid" tone="finyk">
          Go
        </Button>,
      );
      const cls = getByRole("button").className;
      expect(cls).toContain("rounded-lg");
      expect(cls).not.toMatch(/rounded-(xl|2xl)|scale|shadow|glow/);
    },
  );

  it.each([
    // finyk's registered `teal` scale tops out at 900 (no 950 tier), so
    // hover and active share the same darkest step (2026-07 emerald→teal).
    ["finyk", "hover:bg-teal-900", "active:bg-teal-900"],
    // fizruk's registered `cyan` scale tops out at 900 (no 950 tier), so
    // hover and active share the same darkest step.
    ["fizruk", "hover:bg-cyan-900", "active:bg-cyan-900"],
    ["routine", "hover:bg-rose-800", "active:bg-rose-900"],
    // nutrition's `-strong` is lime-800 already, so hover only goes to lime-900.
    ["nutrition", "hover:bg-lime-900", null],
  ] as const)(
    "solid/%s darkens monotonically from -strong (no inverted hover)",
    (tone, hoverCls, activeCls) => {
      const { getByRole } = render(
        <Button variant="solid" tone={tone}>
          Go
        </Button>,
      );
      const cls = getByRole("button").className;
      expect(cls).toContain(`bg-${tone}-strong`);
      expect(cls).toContain(hoverCls);
      if (activeCls) expect(cls).toContain(activeCls);
      // The pre-fix tokens (`*-hover` = -600 step) would lighten the button
      // on hover relative to a -strong (700+) base.
      expect(cls).not.toContain(`hover:bg-${tone}-hover`);
    },
  );

  it("applies size classes distinctly for md vs xs", () => {
    const { getByRole, rerender } = render(<Button size="xs">X</Button>);
    expect(getByRole("button").className).toMatch(/\bh-8\b/);
    rerender(<Button size="md">X</Button>);
    expect(getByRole("button").className).toMatch(/\bh-11\b/);
  });

  it("uses iconSizes (square) when iconOnly=true", () => {
    const { getByRole } = render(
      <Button iconOnly size="md" aria-label="close">
        ✕
      </Button>,
    );
    const cls = getByRole("button").className;
    // h-11 w-11 rather than h-11 px-5
    expect(cls).toMatch(/\bh-11\b/);
    expect(cls).toMatch(/\bw-11\b/);
  });

  it("solid/{module}: темна - тир 400 під чорнилом сторінки, без тіні", () => {
    const { getByRole } = render(
      <Button variant="solid" tone="routine">
        Go
      </Button>,
    );
    const cls = getByRole("button").className;
    expect(cls).toContain("dark:bg-routine");
    expect(cls).toContain("dark:text-bg");
    expect(cls).not.toMatch(/shadow/);
  });

  describe("orthogonal variant × tone API", () => {
    it("solid/neutral renders the ink primary", () => {
      const { getByRole } = render(
        <Button variant="solid" tone="neutral">
          Go
        </Button>,
      );
      expect(getByRole("button").className).toContain("bg-text");
    });

    it("solid/danger renders the destructive treatment", () => {
      const { getByRole } = render(
        <Button variant="solid" tone="danger">
          Delete
        </Button>,
      );
      expect(getByRole("button").className).toContain("bg-danger-strong");
    });

    it("soft/danger renders the inline danger chip (not solid)", () => {
      const { getByRole } = render(
        <Button variant="soft" tone="danger">
          Remove
        </Button>,
      );
      const cls = getByRole("button").className;
      expect(cls).toContain("bg-danger-soft");
      expect(cls).not.toContain("bg-danger-strong");
      // У темній темі `--c-danger-soft` суцільний red-800; кнопка мусить
      // перебити його прозорою заливкою, інакше «soft» стає солідом.
      expect(cls).toContain("dark:bg-danger/15");
    });

    it("outline/neutral renders the secondary outline button", () => {
      const { getByRole } = render(
        <Button variant="outline" tone="neutral">
          Back
        </Button>,
      );
      const cls = getByRole("button").className;
      expect(cls).toContain("border-border-strong");
      expect(cls).toContain("bg-transparent");
    });

    it("outline/danger keeps risk visible without a filled button", () => {
      const { getByRole } = render(
        <Button variant="outline" tone="danger">
          Відʼєднати
        </Button>,
      );
      const cls = getByRole("button").className;
      expect(cls).toContain("text-danger-strong");
      expect(cls).toContain("border-border-strong");
      expect(cls).toContain("bg-transparent");
      expect(cls).not.toContain("bg-danger-soft");
    });

    it("solid/ink renders the inverted ink primary", () => {
      const { getByRole } = render(
        <Button variant="solid" tone="ink">
          Ink
        </Button>,
      );
      expect(getByRole("button").className).toContain("bg-ink-strong");
    });

    it("unsupported (variant, tone) cell keeps the emphasis and drops the tone", () => {
      // outline + a module tone has no dedicated cell → neutral outline,
      // never a solid fill: the emphasis is the caller's intent, the tone
      // is only colour.
      const { getByRole } = render(
        <Button variant="outline" tone="nutrition">
          X
        </Button>,
      );
      const cls = getByRole("button").className;
      expect(cls).toContain("border-border-strong");
      expect(cls).not.toContain("bg-brand-strong");
    });

    it("ghost is tone-agnostic (same treatment regardless of tone)", () => {
      const { getByRole, rerender } = render(
        <Button variant="ghost" tone="neutral">
          A
        </Button>,
      );
      expect(getByRole("button").className).toContain("bg-transparent");
      rerender(
        <Button variant="ghost" tone="finyk">
          A
        </Button>,
      );
      expect(getByRole("button").className).toContain("bg-transparent");
    });

    it("text = тихий рівень: чорнило 15 / 600, без рамки й заливки, зона 44 px", () => {
      const { getByRole } = render(
        <Button variant="text">Показати всі</Button>,
      );
      const cls = getByRole("button").className;
      expect(cls).toContain("text-text");
      expect(cls).toContain("text-style-body");
      expect(cls).toContain("font-semibold");
      expect(cls).toContain("min-h-[44px]");
      expect(cls).toContain("min-w-[44px]");
      expect(cls).toContain("hover:bg-panel");
      expect(cls).not.toMatch(/(^|\s)border(\s|$)/);
      expect(cls).not.toContain("bg-text");
      // Шкала `sizes` не протікає: інакше `md` додав би h-11 і px-5.
      expect(cls).not.toContain("h-11");
      expect(cls).not.toContain("px-5");
    });

    it("text лишається чорнилом з будь-яким тоном", () => {
      const { getByRole, rerender } = render(
        <Button variant="text" tone="finyk">
          A
        </Button>,
      );
      const base = getByRole("button").className;
      expect(base).toContain("text-text");
      expect(base).not.toContain("finyk");
      rerender(
        <Button variant="text" tone="routine">
          A
        </Button>,
      );
      expect(getByRole("button").className).toBe(base);
    });
  });

  describe("легасі-API знято (дедлайн 2026-12-01)", () => {
    // Плоскі варіанти (`primary`, `finyk-soft`, …) і проп `module` знято
    // 2026-11-22. `@ts-expect-error` тримає тип: якщо аліас повернуть у
    // `ButtonVariant` чи `module` у `ButtonProps`, директива стане зайвою і
    // впаде typecheck. Рантайм-перевірки тримають резолвер: колір дає лише
    // `tone`, а рядок поза типом падає в дефолтний `solid`, а не в легасі-
    // клітинку і не в краш рендера.
    const clsOf = (ui: ReactElement) => {
      const { getByRole, unmount } = render(ui);
      const cls = getByRole("button").className;
      unmount();
      return cls;
    };

    it("дефолт без пропів = solid / neutral", () => {
      expect(clsOf(<Button>X</Button>)).toBe(
        clsOf(
          <Button variant="solid" tone="neutral">
            X
          </Button>,
        ),
      );
    });

    it.each(["finyk", "finyk-soft", "destructive", "primary-ink"] as const)(
      "легасі-рядок variant='%s' більше не фарбує кнопку",
      (legacy) => {
        const cls = clsOf(
          <Button
            // @ts-expect-error — плоских аліасів у `ButtonVariant` немає.
            variant={legacy}
          >
            X
          </Button>,
        );
        expect(cls).toBe(clsOf(<Button>X</Button>));
      },
    );

    it("проп `module` більше не підміняє тон", () => {
      const cls = clsOf(
        <Button
          // @ts-expect-error — `module` знято з `ButtonProps`, канон `tone`.
          module="finyk"
          variant="solid"
        >
          X
        </Button>,
      );
      expect(cls).not.toContain("finyk");
      expect(cls).toContain("bg-text");
    });
  });
});
