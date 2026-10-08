// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { safeReadLS, safeRemoveLS } from "@shared/lib/storage/storage";
import {
  PHOTO_PRIVACY_ACK_KEY,
  PhotoPrivacyNotice,
} from "./PhotoPrivacyNotice";

beforeEach(() => {
  safeRemoveLS(PHOTO_PRIVACY_ACK_KEY);
});

describe("PhotoPrivacyNotice Харчування (обгортка над спільним)", () => {
  it("лишає текст про КБЖВ і ключ sergeant.nutrition.photoPrivacyAck.v1", () => {
    expect(PHOTO_PRIVACY_ACK_KEY).toBe("sergeant.nutrition.photoPrivacyAck.v1");
    render(<PhotoPrivacyNotice blockingAnalysis />);
    expect(screen.getByText(/визначити КБЖВ/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Зрозуміло, аналізувати" }),
    );

    expect(safeReadLS<boolean>(PHOTO_PRIVACY_ACK_KEY, false)).toBe(true);
  });
});
