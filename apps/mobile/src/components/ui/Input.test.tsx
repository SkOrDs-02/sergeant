import { fireEvent, render } from "@testing-library/react-native";
import { Text, View } from "react-native";

import { Input, Textarea } from "./Input";

describe("Input", () => {
  it("renders with the `md` / `default` defaults", () => {
    const { getByTestId } = render(<Input testID="field" />);

    const textInput = getByTestId("field");
    // Type-aware defaults are all undefined for the generic text input,
    // so explicit caller-provided props still win (no silent overrides).
    expect(textInput.props.keyboardType).toBeUndefined();
    expect(textInput.props.secureTextEntry).toBeUndefined();
  });

  it("applies size classes to the wrapper view", () => {
    const { UNSAFE_getAllByType } = render(<Input size="lg" />);
    // [0] is the outer label/group container (always rendered, holds `gap-1`),
    // [1] is the inner sized row that owns h-{n} / px-{n} from `sizes[size]`.
    const wrapper = UNSAFE_getAllByType(View)[1];
    expect(wrapper.props.className).toContain("h-12");
    expect(wrapper.props.className).toContain("px-5");
  });

  it("derives keyboardType, autoComplete, and autoCapitalize from `type`", () => {
    const { getByTestId } = render(<Input testID="email" type="email" />);
    const email = getByTestId("email");
    expect(email.props.keyboardType).toBe("email-address");
    expect(email.props.autoComplete).toBe("email");
    expect(email.props.autoCapitalize).toBe("none");
    expect(email.props.spellCheck).toBe(false);
  });

  it("turns on secureTextEntry for type=password", () => {
    const { getByTestId } = render(<Input testID="password" type="password" />);
    expect(getByTestId("password").props.secureTextEntry).toBe(true);
  });

  it("allows an explicit prop to override the type-derived default", () => {
    const { getByTestId } = render(
      <Input testID="f" type="email" keyboardType="default" />,
    );
    expect(getByTestId("f").props.keyboardType).toBe("default");
  });

  it("sets aria-invalid when `error` is true", () => {
    const { getByTestId } = render(<Input testID="f" error />);
    expect(getByTestId("f").props["aria-invalid"]).toBe(true);
  });

  it("fires onChangeText when the user types", () => {
    const onChangeText = jest.fn();
    const { getByTestId } = render(
      <Input testID="f" onChangeText={onChangeText} />,
    );
    fireEvent.changeText(getByTestId("f"), "hello");
    expect(onChangeText).toHaveBeenCalledWith("hello");
  });

  it("renders leading icon and trailing suffix when provided", () => {
    const { getByText } = render(
      <Input icon={<Text>Icon</Text>} suffix={<Text>Suffix</Text>} />,
    );
    expect(getByText("Icon")).toBeTruthy();
    expect(getByText("Suffix")).toBeTruthy();
  });
});

describe("Textarea", () => {
  it("sets multiline and maps `rows` to numberOfLines", () => {
    const { getByTestId } = render(<Textarea testID="bio" rows={5} />);
    const bio = getByTestId("bio");
    expect(bio.props.multiline).toBe(true);
    expect(bio.props.numberOfLines).toBe(5);
  });

  it("sets aria-invalid on error", () => {
    const { getByTestId } = render(<Textarea testID="bio" error />);
    expect(getByTestId("bio").props["aria-invalid"]).toBe(true);
  });
});
