import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Switch, type SwitchProps } from "./Switch";
import { ScreenReaderAnnouncerProvider } from "./ScreenReaderAnnouncer";

/**
 * `Switch` — iOS-style pill toggle. 44×26 px трек відповідає 44 px
 * мінімум-touch-target. Усередині — прихований `<input type="checkbox">`
 * для form-семантики й a11y; thumb рухається 200 ms spring-transition.
 *
 * Зміна стану викликає `hapticTap()` (через iOS/Android adapter) і шле
 * `aria-live` повідомлення `"{label} увімкнено / вимкнено"` для
 * screen-reader-ів. Кастомний текст можна задати через `announceText`.
 *
 * Очікує бути всередині `<label>`, що вже надає видимий текст
 * (наприклад, `ToggleRow`). Storybook-обгортка `ScreenReaderAnnouncerProvider`
 * потрібна, бо `useAnnounce()` падає без contexts.
 */
const meta: Meta<typeof Switch> = {
  title: "UI / Switch",
  component: Switch,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <ScreenReaderAnnouncerProvider>
        <Story />
      </ScreenReaderAnnouncerProvider>
    ),
  ],
  argTypes: {
    checked: { control: "boolean" },
    disabled: { control: "boolean" },
    label: { control: "text" },
  },
  args: {
    checked: false,
    label: "Сповіщення",
  },
};
export default meta;

type Story = StoryObj<typeof Switch>;

function ControlledDemo({
  initial,
  ...rest
}: Omit<SwitchProps, "checked" | "onChange"> & { initial: boolean }) {
  const [on, setOn] = useState(initial);
  return <Switch {...rest} checked={on} onChange={setOn} />;
}

/** Default — controlled через `useState`, label вже всередині `<label>`. */
export const Default: Story = {
  render: (args) => <ControlledDemo {...args} initial={!!args.checked} />,
};

export const On: Story = {
  args: { checked: true },
  render: (args) => <ControlledDemo {...args} initial={!!args.checked} />,
};

export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => <ControlledDemo {...args} initial={!!args.checked} />,
};

export const DisabledOn: Story = {
  args: { checked: true, disabled: true },
  render: (args) => <ControlledDemo {...args} initial={!!args.checked} />,
};

/** Без label — лише трек, для compact-density форм/кард-row. */
export const NoLabel: Story = {
  args: { label: undefined },
  render: (args) => <ControlledDemo {...args} initial={!!args.checked} />,
};

function SettingsListDemo() {
  const [pushOn, setPushOn] = useState(true);
  const [emailOn, setEmailOn] = useState(false);
  const [haptics, setHaptics] = useState(true);
  return (
    <div className="flex flex-col gap-3 w-72 rounded-2xl border border-line bg-panel p-4">
      <Switch checked={pushOn} onChange={setPushOn} label="Push-сповіщення" />
      <Switch checked={emailOn} onChange={setEmailOn} label="Email-дайджест" />
      <Switch
        checked={haptics}
        onChange={setHaptics}
        label="Тактильний відгук"
      />
    </div>
  );
}

/** Кілька свитчів у settings-row patternі. */
export const SettingsList: Story = {
  render: () => <SettingsListDemo />,
};
