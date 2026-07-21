// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BackfillProgressPill } from "./BackfillProgressPill";
import backfillMeta, {
  Completed,
  Failed,
  Idle,
  Running,
  TransientCompleted,
} from "./BackfillProgressPill.stories";
import debtMeta, {
  Default as DebtDefault,
  DueToday,
  HiddenBalance,
  Overdue,
  PaidOff,
  Receivable,
  WithDeleteAction,
  WithLinkAction,
} from "./DebtCard.stories";

type BackfillProgressPillProps = ComponentProps<typeof BackfillProgressPill>;

function renderPill(args: BackfillProgressPillProps) {
  return render(<BackfillProgressPill {...args} />);
}

describe("BackfillProgressPill", () => {
  it("renders running progress with counters and an exact progressbar width", () => {
    renderPill(Running.args as BackfillProgressPillProps);

    expect(screen.getByRole("status")).toHaveAccessibleName(
      /Завантаження виписки · 2\/5 рах\./,
    );
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "40");
    expect(progressbar.firstElementChild).toHaveStyle({ width: "40%" });
    expect(screen.getByText("1 240 тр.")).toBeInTheDocument();
  });

  it("renders completed and failed terminal states without a progressbar", () => {
    const { rerender } = renderPill(
      Completed.args as BackfillProgressPillProps,
    );

    expect(screen.getByText("Завершено")).toBeInTheDocument();
    expect(screen.getByText("3 120 транзакцій")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    rerender(
      <BackfillProgressPill {...(Failed.args as BackfillProgressPillProps)} />,
    );

    expect(screen.getByText("Помилка backfill")).toBeInTheDocument();
    expect(
      screen.getByText("Mono API: 429 Too Many Requests"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("hides idle and transient completed snapshots", () => {
    const { container, rerender } = renderPill(
      Idle.args as BackfillProgressPillProps,
    );

    expect(container).toBeEmptyDOMElement();

    rerender(
      <BackfillProgressPill
        {...(TransientCompleted.args as BackfillProgressPillProps)}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps Storybook scenarios wired to the intended components", () => {
    expect(backfillMeta.title).toBe("Finyk / BackfillProgressPill");
    expect(backfillMeta.component).toBe(BackfillProgressPill);
    expect(Running.args?.progress?.status).toBe("running");
    expect(Completed.args?.progress?.status).toBe("completed");
    expect(Failed.args?.progress?.lastError).toContain("429");
  });
});

describe("DebtCard stories", () => {
  it("documents the story variants counted in Finyk coverage", () => {
    expect(debtMeta.title).toBe("Finyk / DebtCard");
    expect(debtMeta.args).toMatchObject({
      name: "Кредит у мами",
      remaining: 3500,
      showBalance: true,
    });
    expect(DebtDefault.args).toBeUndefined();
    expect(PaidOff.args).toMatchObject({ remaining: 0, total: 1200 });
    expect(Receivable.args).toMatchObject({ isReceivable: true });
    expect(Overdue.args).toMatchObject({ dueDate: "2026-04-20" });
    expect(DueToday.args?.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(HiddenBalance.args).toMatchObject({ showBalance: false });

    WithLinkAction.args?.onLink?.();
    WithDeleteAction.args?.onDelete?.();
    expect(WithLinkAction.args).toMatchObject({ linkedCount: 3 });
  });
});
