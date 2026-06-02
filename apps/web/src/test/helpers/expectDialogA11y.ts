/**
 * Shared a11y prop-test assertion for full-viewport dialog surfaces.
 *
 * Ported from the inline `role=dialog + aria-modal + aria-labelledby`
 * checks in `apps/web/src/shared/components/ui/Modal.test.tsx`, so the
 * ad-hoc dialogs cleaned up in pr-plan card E2 can reuse one canonical
 * assertion instead of re-implementing the wiring checks per callsite.
 *
 * Companion to the `sergeant-design/no-bare-fixed-inset-modal` ESLint
 * rule (audit `docs/audits/2026-05-13-web-frontend-ergonomics-roast.md`
 * § F2): the lint rule guards the *static* `fixed inset-0` className /
 * `role`-attribute heuristic; this helper asserts the *runtime* DOM the
 * dialog actually renders.
 *
 * Asserts, on the passed dialog element:
 *   - `role` is one of `dialog` / `alertdialog`.
 *   - `aria-modal="true"` (modal dialogs only; pass
 *     `{ modal: false }` for non-modal `role="dialog"` surfaces).
 *   - the element is labelled — either `aria-label` (non-empty) or
 *     `aria-labelledby` pointing at an in-document element with matching
 *     `id` and non-empty text content.
 *
 * @vitest-environment jsdom
 */
import { expect } from "vitest";

const DIALOG_ROLES = new Set(["dialog", "alertdialog"]);

export interface ExpectDialogA11yOptions {
  /** Require `aria-modal="true"`. Default `true`. */
  modal?: boolean;
}

export function expectDialogA11y(
  element: HTMLElement | null,
  options: ExpectDialogA11yOptions = {},
): void {
  const { modal = true } = options;

  expect(
    element,
    "expectDialogA11y: element was null/undefined",
  ).not.toBeNull();
  const el = element as HTMLElement;

  const role = el.getAttribute("role");
  expect(
    role && DIALOG_ROLES.has(role),
    `expectDialogA11y: role must be one of ${[...DIALOG_ROLES].join(
      " / ",
    )} — got ${role === null ? "null" : `"${role}"`}`,
  ).toBe(true);

  if (modal) {
    expect(
      el.getAttribute("aria-modal"),
      'expectDialogA11y: modal dialog must set aria-modal="true"',
    ).toBe("true");
  }

  const ariaLabel = el.getAttribute("aria-label");
  const labelledBy = el.getAttribute("aria-labelledby");

  if (ariaLabel != null && ariaLabel.trim() !== "") {
    return;
  }

  expect(
    labelledBy,
    "expectDialogA11y: dialog must be labelled via non-empty aria-label or aria-labelledby",
  ).toBeTruthy();

  // `aria-labelledby` may reference multiple space-separated ids; every
  // referenced element must exist in-document with non-empty text.
  const ownerDoc = el.ownerDocument;
  const ids = (labelledBy as string).split(/\s+/).filter(Boolean);
  expect(ids.length > 0, "expectDialogA11y: aria-labelledby had no ids").toBe(
    true,
  );

  for (const id of ids) {
    const labelEl = ownerDoc.getElementById(id);
    expect(
      labelEl,
      `expectDialogA11y: aria-labelledby="${id}" points at a non-existent element`,
    ).not.toBeNull();
    expect(
      (labelEl as HTMLElement).textContent?.trim(),
      `expectDialogA11y: label element #${id} has empty text content`,
    ).toBeTruthy();
  }
}
