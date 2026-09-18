import { render } from "@testing-library/react-native";
import { Text } from "react-native";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./Card";

describe("Card", () => {
  it("renders children inside the default container", () => {
    const { getByText } = render(
      <Card>
        <Text>hello</Text>
      </Card>,
    );

    expect(getByText("hello")).toBeTruthy();
  });

  it("applies the requested variant's container classes", () => {
    const { getByTestId } = render(
      <Card testID="finyk-card" variant="finyk">
        <Text>branded</Text>
      </Card>,
    );

    const root = getByTestId("finyk-card");
    // Module-branded variants bake rounded-3xl + bg-finyk into the class list.
    expect(root.props.className).toContain("bg-finyk");
    expect(root.props.className).toContain("rounded-3xl");
  });

  it("honours the radius prop for core variants", () => {
    const { getByTestId } = render(
      <Card testID="card" radius="lg">
        <Text>radius</Text>
      </Card>,
    );

    expect(getByTestId("card").props.className).toContain("rounded-2xl");
  });

  it("maps padding prop to the correct spacing class", () => {
    const { getByTestId } = render(
      <Card testID="card" padding="lg">
        <Text>pad</Text>
      </Card>,
    );

    expect(getByTestId("card").props.className).toContain("p-5");
  });

  it("renders composite sub-components", () => {
    const { getByText } = render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
        </CardHeader>
        <CardDescription>Subtitle</CardDescription>
        <CardContent>
          <Text>Body</Text>
        </CardContent>
        <CardFooter>
          <Text>Footer</Text>
        </CardFooter>
      </Card>,
    );

    expect(getByText("Title")).toBeTruthy();
    expect(getByText("Subtitle")).toBeTruthy();
    expect(getByText("Body")).toBeTruthy();
    expect(getByText("Footer")).toBeTruthy();
  });
});
