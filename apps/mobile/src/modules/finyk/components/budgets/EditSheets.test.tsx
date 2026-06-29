import { fireEvent, render } from "@testing-library/react-native";

import type { GoalBudget, LimitBudget } from "@sergeant/finyk-domain/domain";

import { GoalEditSheet } from "./GoalEditSheet";
import { LimitEditSheet } from "./LimitEditSheet";
import { SubscriptionEditSheet } from "./SubscriptionEditSheet";
import type { Subscription } from "@/modules/finyk/lib/budgetsStore";

jest.mock("@/components/ui/Sheet", () => ({
  Sheet: ({
    open,
    title,
    children,
    footer,
  }: {
    open: boolean;
    title: string;
    children?: React.ReactNode;
    footer?: React.ReactNode;
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
            children,
            footer,
          );
        })()
      : null,
}));

const limitBudget: LimitBudget = {
  id: "limit-food",
  type: "limit",
  categoryId: "food",
  limit: 1200,
};

const goalBudget: GoalBudget = {
  id: "goal-car",
  type: "goal",
  name: "Car",
  targetAmount: 100000,
  savedAmount: 25000,
};

const subscription: Subscription = {
  id: "sub-netflix",
  name: "Netflix",
  emoji: "N",
  keyword: "netflix",
  billingDay: 10,
  currency: "UAH",
  monthlyCost: 299,
};

describe("Finyk budget edit sheets", () => {
  it("submits and deletes limit budgets", () => {
    const onSubmit = jest.fn();
    const onDelete = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = render(
      <LimitEditSheet
        open
        budget={limitBudget}
        categoryLabel="Food"
        onSubmit={onSubmit}
        onDelete={onDelete}
        onClose={onClose}
        testID="limit-edit"
      />,
    );

    fireEvent.changeText(getByTestId("limit-edit-amount"), "1500");
    fireEvent.press(getByTestId("limit-edit-submit"));

    expect(onSubmit).toHaveBeenCalledWith({ ...limitBudget, limit: 1500 });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId("limit-edit-delete"));
    expect(onDelete).toHaveBeenCalledWith("limit-food");
  });

  it("submits and deletes goal budgets", () => {
    const onSubmit = jest.fn();
    const onDelete = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = render(
      <GoalEditSheet
        open
        budget={goalBudget}
        onSubmit={onSubmit}
        onDelete={onDelete}
        onClose={onClose}
        testID="goal-edit"
      />,
    );

    fireEvent.changeText(getByTestId("goal-edit-target"), "120000");
    fireEvent.changeText(getByTestId("goal-edit-saved"), "30000");
    fireEvent.press(getByTestId("goal-edit-submit"));

    expect(onSubmit).toHaveBeenCalledWith({
      ...goalBudget,
      targetAmount: 120000,
      savedAmount: 30000,
      targetDate: undefined,
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId("goal-edit-delete"));
    expect(onDelete).toHaveBeenCalledWith("goal-car");
  });

  it("submits and deletes subscriptions", () => {
    const onSubmit = jest.fn();
    const onDelete = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = render(
      <SubscriptionEditSheet
        open
        subscription={subscription}
        onSubmit={onSubmit}
        onDelete={onDelete}
        onClose={onClose}
        testID="subscription-edit"
      />,
    );

    fireEvent.changeText(getByTestId("subscription-edit-name"), "Spotify");
    fireEvent.changeText(getByTestId("subscription-edit-day"), "15");
    fireEvent.press(getByTestId("subscription-edit-submit"));

    expect(onSubmit).toHaveBeenCalledWith({
      ...subscription,
      name: "Spotify",
      billingDay: 15,
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId("subscription-edit-delete"));
    expect(onDelete).toHaveBeenCalledWith("sub-netflix");
  });
});
