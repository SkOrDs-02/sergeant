import type { Preview } from "@storybook/react-vite";

// Tailwind v4 entry — same chain that `apps/web` imports in `main.tsx`.
// Loads tokens, base resets, animations, and utility classes used by stories.
import "../src/index.css";
import { ToastProvider } from "../src/shared/hooks/useToast";
import { ToastContainer } from "../src/shared/components/ui/Toast";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: "panel",
      values: [
        { name: "panel", value: "var(--color-bg, #f8fafc)" },
        { name: "white", value: "#ffffff" },
        { name: "dark", value: "#0f172a" },
      ],
    },
  },
  decorators: [
    // Global ToastProvider + container — `Toast.stories.tsx` тригерить toasts
    // через `useToast()`, інші stories ігнорують контекст. ToastContainer
    // повертає `null`, поки немає активних toasts, тож decorator-tax — нульовий.
    (Story) => (
      <ToastProvider>
        <Story />
        <ToastContainer />
      </ToastProvider>
    ),
  ],
};

export default preview;
