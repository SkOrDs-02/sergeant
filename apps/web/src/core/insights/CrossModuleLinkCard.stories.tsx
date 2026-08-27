import type { Meta, StoryObj } from "@storybook/react-vite";
import { CrossModuleLinkCard } from "./CrossModuleLinkCard";

/**
 * `CrossModuleLinkCard` — форма крос-модульного звʼязку (анти-слоп P2).
 * Дві осі + місток, що несе впевненість товщиною й суцільністю ліній, три
 * словесні ступені градації, і окремий «мовчазний» стан, коли даних ще
 * замало. Пороги (`MIN_N`, `NOTABLE_R`) — ті самі, що керують weekly-digest
 * кореляціями в `digestCorrelations.ts`.
 */
const meta: Meta<typeof CrossModuleLinkCard> = {
  title: "Insights / CrossModuleLinkCard",
  component: CrossModuleLinkCard,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768, 1280] },
  },
  tags: ["autodocs"],
  args: {
    poleA: {
      module: "fizruk",
      label: "Фізрук",
      value: "3+",
      unit: "тренування / тиждень",
    },
    poleB: {
      module: "finyk",
      label: "Фінік",
      value: "−18%",
      unit: "витрат на доставку",
    },
    observations: 23,
    strength: 0.62,
  },
};
export default meta;

type Story = StoryObj<typeof CrossModuleLinkCard>;

/**
 * Стабільний звʼязок — товста суцільна лінія, найвищий ступінь.
 *
 * `observations`/`strength` задані явно, а не успадковані від `meta.args`:
 * дефолтні 23/0.62 не дотягують до жодного порога третього ступеня
 * (`STABLE_N` = 30 або `|r|` ≥ `STRONG_R` = 0.7), тож ця сторі малювала б
 * той самий другий ступінь, що й `Repeating`, і третій не мав би сторі
 * взагалі.
 */
export const Stable: Story = {
  args: {
    observations: 34,
    strength: 0.74,
    weeks: 9,
    phrase: "У дні тренувань ти витрачаєш менше",
  },
};

/** «Повторюється» — тонка суцільна лінія, середній ступінь. */
export const Repeating: Story = {
  args: {
    poleA: {
      module: "routine",
      label: "Рутина",
      value: "Ранкова",
      unit: "зарядка виконана",
    },
    poleB: {
      module: "nutrition",
      label: "Харчування",
      value: "+11 г",
      unit: "білка за день",
    },
    observations: 14,
    strength: 0.48,
    weeks: 4,
  },
};

/** «Схоже на закономірність» — пунктирна лінія, щойно за порогом мовчання. */
export const Emerging: Story = {
  args: {
    poleA: {
      module: "routine",
      label: "Рутина",
      value: "Ранкова",
      unit: "зарядка виконана",
    },
    poleB: {
      module: "nutrition",
      label: "Харчування",
      value: "+11 г",
      unit: "білка за день",
    },
    observations: 6,
    strength: 0.44,
    weeks: 2,
  },
};

/** Без переданого `weeks` — метадані чесно обмежуються спостереженнями. */
export const WithoutWeeks: Story = {
  args: {
    observations: 12,
    strength: 0.55,
  },
};

/** Право мовчати — недостатньо спостережень (n < MIN_N). */
export const NotEnoughData: Story = {
  args: {
    observations: 2,
    strength: 0.8,
  },
};

/** Право мовчати — даних достатньо, але звʼязку не видно (|r| < NOTABLE_R). */
export const NoPatternFound: Story = {
  args: {
    observations: 40,
    strength: 0.08,
  },
};
