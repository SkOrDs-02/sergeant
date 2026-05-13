import type { Meta, StoryObj } from "@storybook/react-vite";
import { Prose } from "./Prose";

/**
 * `Prose` — обгортка для rich-text-контенту (markdown-render, статті,
 * onboarding-кроки, in-app-документація). Застосовує семантичну шкалу
 * `.text-style-*` (fluid clamp, 12px floor — Hard Rule #16) до всіх
 * native HTML-тегів, тримає вимірення ≤70ch через токен
 * `--max-line-length` і пропонує `default` / `compact` варіанти ритму.
 */
const meta: Meta<typeof Prose> = {
  title: "UI / Prose",
  component: Prose,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "radio",
      options: ["default", "compact"],
    },
  },
  args: {
    variant: "default",
  },
};
export default meta;

type Story = StoryObj<typeof Prose>;

const SAMPLE = (
  <>
    <h2>Заголовок розділу</h2>
    <p>
      Усі типографічні рішення живуть у семантичній шкалі{" "}
      <code>.text-style-*</code>. Цей блок рендерить сирий HTML — без додаткової
      розмітки — і однаково охайно читається на 320 px, 768 px і 1440 px завдяки{" "}
      <code>clamp()</code> розмірам і кепу <code>--max-line-length: 70ch</code>.
    </p>
    <h3>Підзаголовок</h3>
    <p>
      Списки, цитати та посилання отримують узгоджені вертикальні ритми. Ось{" "}
      <a href="#prose">внутрішнє посилання</a>, що використовує{" "}
      <code>text-accent</code> + <code>focus-visible</code> кільце для
      клавіатурної доступності.
    </p>
    <ul>
      <li>12px floor — Hard Rule #16, ніщо менше за caption.</li>
      <li>OpenType: kerning, common ligatures, ss01 alternates.</li>
      <li>
        <code>.tnum</code> вмикає tabular-nums для числових колонок.
      </li>
    </ul>
    <blockquote>
      «Дизайн не про те, як це виглядає. Це про те, як це працює.» — Steve Jobs
    </blockquote>
  </>
);

export const Default: Story = {
  args: { children: SAMPLE },
};

export const Compact: Story = {
  args: { variant: "compact", children: SAMPLE },
};

export const WithTable: Story = {
  args: {
    children: (
      <>
        <h3>Розклад тренувань</h3>
        <p>Таблиця з tabular-nums у числовій колонці:</p>
        <table>
          <thead>
            <tr>
              <th>День</th>
              <th>Підходи</th>
              <th>Хв</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Понеділок</td>
              <td className="tnum text-right">4 × 12</td>
              <td className="tnum text-right">48</td>
            </tr>
            <tr>
              <td>Середа</td>
              <td className="tnum text-right">5 × 10</td>
              <td className="tnum text-right">55</td>
            </tr>
            <tr>
              <td>П&apos;ятниця</td>
              <td className="tnum text-right">3 × 15</td>
              <td className="tnum text-right">40</td>
            </tr>
          </tbody>
        </table>
      </>
    ),
  },
};
