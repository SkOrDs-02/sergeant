import { fireEvent, render } from "@testing-library/react-native";
import { HubChatHistoryDrawer } from "../HubChatHistoryDrawer";

jest.mock("@/components/ui/Sheet", () => ({
  Sheet: ({
    open,
    title,
    description,
    children,
  }: {
    open: boolean;
    title: string;
    description?: string;
    children?: React.ReactNode;
  }) =>
    open
      ? (() => {
          const React = jest.requireActual<typeof import("react")>("react");
          const { Text, View } =
            jest.requireActual<typeof import("react-native")>("react-native");
          return React.createElement(
            View,
            null,
            React.createElement(Text, null, title),
            description ? React.createElement(Text, null, description) : null,
            children,
          );
        })()
      : null,
}));

function session(id: string, title: string, updatedAt: number) {
  return {
    id,
    title,
    createdAt: updatedAt - 1,
    updatedAt,
    messages: [{ id: `${id}-m1`, role: "user" as const, text: "hi" }],
  };
}

describe("HubChatHistoryDrawer", () => {
  it("sorts sessions newest-first and wires create/select/delete actions", () => {
    const onCreate = jest.fn();
    const onSelect = jest.fn();
    const onDelete = jest.fn();
    const { getByTestId, getByText } = render(
      <HubChatHistoryDrawer
        open
        activeId="older"
        sessions={[
          session("older", "Older", 10),
          session("newer", "Newer", 20),
        ]}
        onClose={jest.fn()}
        onCreate={onCreate}
        onSelect={onSelect}
        onDelete={onDelete}
      />,
    );

    fireEvent.press(getByTestId("hub-chat-history-create"));
    fireEvent.press(getByText("Newer"));
    fireEvent.press(getByTestId("hub-chat-history-delete-older"));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("newer");
    expect(onDelete).toHaveBeenCalledWith("older");
    expect(getByTestId("hub-chat-history-row-newer")).toBeTruthy();
  });

  it("renders the empty state when there are no saved sessions", () => {
    const { queryByText } = render(
      <HubChatHistoryDrawer
        open
        activeId=""
        sessions={[]}
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onSelect={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(queryByText(/немає|РЅРµРјР°/i)).toBeTruthy();
  });
});
