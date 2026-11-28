// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { messages } from "@shared/i18n/uk";
import { DestructiveConfirmModal } from "./DestructiveConfirmModal";

const noop = () => {};
const confirmLabel = messages.hub.destructiveConfirm.confirm;

function confirmButtonClass(name: string): string {
  render(
    <DestructiveConfirmModal
      items={[{ name }]}
      onConfirm={noop}
      onCancel={noop}
    />,
  );
  return screen.getByRole("button", { name: confirmLabel }).className;
}

describe("DestructiveConfirmModal — тон кнопки підтвердження", () => {
  it("видалення і створення мають різний тон кнопки", () => {
    const deletion = confirmButtonClass("delete_transaction");
    cleanup();
    const creation = confirmButtonClass("create_transaction");
    expect(deletion).not.toBe(creation);
    expect(deletion).toMatch(/danger/);
    expect(creation).not.toMatch(/danger/);
  });
});
