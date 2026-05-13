import { Button, Card, Label, ThemeSwitcher } from "@shared/components/ui";
import { Input } from "@shared/components/ui/Input";
import { Sec, Group } from "../_shared";

type PreviewVariant = "light" | "dark" | "hc-light" | "hc-dark";

const VARIANTS: ReadonlyArray<{
  variant: PreviewVariant;
  label: string;
  caption: string;
}> = [
  {
    variant: "light",
    label: "Світла",
    caption: "Default — warm ivory + warm-black ink.",
  },
  {
    variant: "dark",
    label: "Темна",
    caption: "Cozy — deep warm charcoal + warm-white ink.",
  },
  {
    variant: "hc-light",
    label: "HC (світла)",
    caption: "AAA — pure black on cream, thicker dividers.",
  },
  {
    variant: "hc-dark",
    label: "HC (темна)",
    caption: "AAA — pure white on charcoal, amber focus ring.",
  },
];

interface PreviewProps {
  variant: PreviewVariant;
  label: string;
  caption: string;
}

function ThemePreviewTile({ variant, label, caption }: PreviewProps) {
  // Scoped CSS-var overrides via `[data-theme-preview="…"]` from
  // `styles/theme.css`. The wrapper uses `bg-bg` + `text-text` which
  // resolve through the local `--c-bg` / `--c-text` overrides so the
  // primitives inside render as if the page used that theme — no global
  // `<html>` class flip needed. (Pure CSS, fully token-based.)
  return (
    <div
      data-theme-preview={variant === "light" ? undefined : variant}
      className="rounded-3xl border border-line bg-bg overflow-hidden"
    >
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-line">
        <Label className="mb-0 text-text">{label}</Label>
        <div className="text-2xs text-subtle font-mono">{variant}</div>
      </div>
      <div className="px-4 py-4 space-y-3">
        <Card variant="default" padding="md" radius="lg">
          <div className="text-style-label text-text">Card</div>
          <p className="text-xs text-muted leading-snug mt-1">
            {caption} Subtle text reads at WCAG-tier contrast against{" "}
            <span className="text-subtle">surface</span>.
          </p>
        </Card>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm">
            Primary
          </Button>
          <Button variant="ghost" size="sm">
            Ghost
          </Button>
          <Button variant="danger" size="sm">
            Danger
          </Button>
        </div>
        <Input
          aria-label={`${label} preview input`}
          placeholder="Введіть значення"
        />
      </div>
    </div>
  );
}

export function ThemingSection() {
  return (
    <Sec id="theming" title="Теми (light / dark / system / HC)">
      <Group label="Контроль" row>
        <div className="flex flex-wrap items-center gap-3">
          <ThemeSwitcher />
          <ThemeSwitcher variant="dropdown" />
        </div>
      </Group>

      <Group label="Прев'ю поверхонь у кожній темі">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {VARIANTS.map((v) => (
            <ThemePreviewTile key={v.variant} {...v} />
          ))}
        </div>
        <p className="mt-3 text-xs text-muted leading-snug">
          Тайли користуються тими ж семантичними токенами, що й застосунок —
          ніяких hex у markup. HC-режим живе у{" "}
          <code className="font-mono text-2xs">html.hc</code> класі та бамп-ить
          контраст до AAA, посилює дільники і ширить focus-ring до{" "}
          <code className="font-mono text-2xs">--ring-width-hc: 3px</code>.
        </p>
      </Group>
    </Sec>
  );
}
