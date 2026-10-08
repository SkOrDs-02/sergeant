// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeReadLS, safeRemoveLS } from "@shared/lib/storage/storage";
import { PhotoPrivacyNotice } from "./PhotoPrivacyNotice";

const KEY = "sergeant.test.photoPrivacyAck.v1";

beforeEach(() => {
  safeRemoveLS(KEY);
});

describe("PhotoPrivacyNotice (спільний)", () => {
  it("показує переданий текст і пише ack лише у переданий ключ", () => {
    const onAck = vi.fn();
    render(
      <PhotoPrivacyNotice
        ackKey={KEY}
        text="Текст про чек"
        tone="finyk"
        onAck={onAck}
      />,
    );
    expect(screen.getByText("Текст про чек")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Зрозуміло" }));

    expect(onAck).toHaveBeenCalledTimes(1);
    expect(safeReadLS<boolean>(KEY, false)).toBe(true);
    expect(
      safeReadLS("sergeant.nutrition.photoPrivacyAck.v1", null),
    ).toBeNull();
    expect(screen.queryByText("Текст про чек")).not.toBeInTheDocument();
  });

  it("з уже наявним ack нічого не рендерить", () => {
    render(<PhotoPrivacyNotice ackKey={KEY} text="Текст" tone="finyk" />);
    fireEvent.click(screen.getByRole("button", { name: "Зрозуміло" }));
    const { container } = render(
      <PhotoPrivacyNotice ackKey={KEY} text="Текст" tone="finyk" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
