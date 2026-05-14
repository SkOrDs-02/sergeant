import { Card } from "@shared/components/ui";
import {
  CodeBlock,
  DoDont,
  Group,
  RuleBadges,
  Sec,
} from "../_shared/primitives";

const SAMPLE_USAGE = `// Сontrol → Card → Hero — elevation rhythm
<Card variant="elevated" padding="md" radius="xl">…</Card>

// Z-layer scale: sticky < dropdown < modal < toast
<div className="z-100 sticky top-0">…</div>`;

interface ShadowRow {
  cls: string;
  spec: string;
  use: string;
}

const SHADOWS: readonly ShadowRow[] = [
  { cls: "shadow-soft", spec: "0 1px 2px / 0.06", use: "Default cards" },
  {
    cls: "shadow-card",
    spec: "0 4px 10px / 0.08",
    use: "Resting card on bg-bg",
  },
  {
    cls: "shadow-float",
    spec: "0 10px 24px / 0.12",
    use: "Hover/elevated card",
  },
];

const Z_LAYERS = [
  { cls: "z-0", role: "Default in-flow" },
  { cls: "z-10", role: "Card hover, micro-interactions" },
  { cls: "z-50", role: "Sticky headers, tooltips" },
  { cls: "z-100", role: "Sticky app header (showcase top bar)" },
  { cls: "z-modal", role: "Modal / Sheet overlay" },
  { cls: "z-toast", role: "Toast (renders over modals)" },
];

const CARD_VARIANTS = [
  "default",
  "interactive",
  "flat",
  "elevated",
  "ghost",
] as const;

export function ElevationSection() {
  return (
    <Sec
      id="elevation"
      title="Elevation"
      intro={
        <>
          Три рівні тіней — sticky{" "}
          <code>shadow-soft → shadow-card → shadow-float</code>. Висота не
          передає «значущість», вона передає «тут активне взаємодіє». Не
          використовуй <code>shadow-2xl</code> або сирі drop-shadow
          CSS-значення.
        </>
      }
    >
      <Group label="Shadow tokens">
        <div className="flex flex-wrap gap-4">
          {SHADOWS.map((s) => (
            <div key={s.cls} className="flex flex-col items-center gap-2">
              <div
                className={`${s.cls} bg-panel rounded-2xl border border-line w-40 h-20 flex items-center justify-center text-2xs font-mono text-muted`}
              >
                {s.cls}
              </div>
              <span className="text-2xs text-subtle font-mono">{s.spec}</span>
              <span className="text-2xs text-subtle text-center">{s.use}</span>
            </div>
          ))}
        </div>
      </Group>

      <Group label="Card prominence — варіанти">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {CARD_VARIANTS.map((variant) => (
            <Card key={variant} variant={variant} padding="md" radius="xl">
              <div className="text-xs font-semibold text-text">{variant}</div>
              <div className="text-2xs text-muted mt-1">
                variant=&quot;{variant}&quot;
              </div>
            </Card>
          ))}
        </div>
      </Group>

      <Group label="Module hero (prominence='hero')">
        <div className="grid grid-cols-2 gap-4">
          {(["finyk", "fizruk", "routine", "nutrition"] as const).map(
            (module) => (
              <Card key={module} module={module} prominence="hero" padding="lg">
                <div className="text-sm font-bold">{module}</div>
                <div className="text-2xs text-muted mt-1">
                  module=&quot;{module}&quot; prominence=&quot;hero&quot;
                </div>
              </Card>
            ),
          )}
        </div>
      </Group>

      <Group label="Z-layer шкала">
        <div className="space-y-1.5">
          {Z_LAYERS.map((z) => (
            <div key={z.cls} className="flex items-center gap-3 text-xs">
              <code className="text-text w-20">{z.cls}</code>
              <span className="text-muted">{z.role}</span>
            </div>
          ))}
        </div>
      </Group>

      <Group label="Приклад використання">
        <CodeBlock>{SAMPLE_USAGE}</CodeBlock>
      </Group>

      <Group label="Do / Don't">
        <DoDont
          rows={[
            {
              label: "Resting card",
              good: <code>shadow-card</code>,
              bad: <code>shadow-md</code>,
            },
            {
              label: "Hover lift",
              good: <code>hover:shadow-float</code>,
              bad: <code>hover:scale-110</code>,
            },
            {
              label: "Z-layer",
              good: <code>z-modal</code>,
              bad: <code>z-[9999]</code>,
            },
            {
              label: "Hero card",
              good: <code>prominence=&quot;hero&quot;</code>,
              bad: (
                <code>
                  className=&quot;bg-finyk text-white shadow-2xl&quot;
                </code>
              ),
            },
          ]}
        />
      </Group>

      <RuleBadges
        hardRules={[
          { label: "HR #11", hint: "No hex in className" },
          { label: "HR #18", hint: "Module-size discipline" },
        ]}
        lintRules={[
          { label: "no-rounded-lg" },
          { label: "no-low-contrast-text-on-fill" },
        ]}
      />
    </Sec>
  );
}
