/**
 * Render tests for `<ExperimentalSection>`.
 *
 * Covers:
 *  - collapsed-by-default header with the "Експериментальне" title;
 *  - expanding reveals one row per entry in the mobile flag registry
 *    (the two experimental flags mirrored from web featureFlags).
 */

import { fireEvent, render } from "@testing-library/react-native";

import { _getMMKVInstance } from "@/lib/storage";

import { ExperimentalSection } from "./ExperimentalSection";

beforeEach(() => {
  _getMMKVInstance().clearAll();
});

describe("ExperimentalSection", () => {
  it("renders the collapsed group header", () => {
    const { getByText, queryByText } = render(<ExperimentalSection />);
    expect(getByText("Експериментальне")).toBeTruthy();
    // Рядки прапорців зʼявляються лише після розгортання. Перевіряємо на
    // `hub_command_palette` — єдиному, що лишився в `EXPERIMENTAL_FLAGS`:
    // `finyk_subscriptions_category` прибрано разом із web, бо тумблер не мав
    // жодного читача (людина вмикала опцію, яка нічого не робить).
    expect(queryByText("Command Palette (Ctrl/⌘+K)")).toBeNull();
  });

  it("expands to show the experimental flag rows", () => {
    const { getByText } = render(<ExperimentalSection />);

    fireEvent.press(getByText("Експериментальне"));

    expect(getByText("Command Palette (Ctrl/⌘+K)")).toBeTruthy();
  });
});
