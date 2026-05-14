import {
  CodeBlock,
  DoDont,
  Group,
  RuleBadges,
  Sec,
} from "../_shared/primitives";

const SAMPLE_USAGE = `// Stacked padding — Tailwind scale only
<Card padding="md" radius="lg">…</Card>

// Layout gap — same scale, sym across breakpoints
<div className="flex flex-col gap-4 sm:gap-6">…</div>`;

interface ScaleRow {
  label: string;
  value: string;
  px: string;
}

const SPACING_SCALE: readonly ScaleRow[] = [
  { label: "0.5", value: "p-0.5", px: "2px" },
  { label: "1", value: "p-1", px: "4px" },
  { label: "2", value: "p-2", px: "8px" },
  { label: "3", value: "p-3", px: "12px" },
  { label: "4", value: "p-4", px: "16px" },
  { label: "5", value: "p-5", px: "20px" },
  { label: "6", value: "p-6", px: "24px" },
  { label: "8", value: "p-8", px: "32px" },
  { label: "10", value: "p-10", px: "40px" },
  { label: "12", value: "p-12", px: "48px" },
];

const SPACING_BARS = [
  { cls: "w-1 h-4", label: "1 · 4px" },
  { cls: "w-2 h-4", label: "2 · 8px" },
  { cls: "w-3 h-4", label: "3 · 12px" },
  { cls: "w-4 h-4", label: "4 · 16px" },
  { cls: "w-6 h-4", label: "6 · 24px" },
  { cls: "w-8 h-4", label: "8 · 32px" },
  { cls: "w-12 h-4", label: "12 · 48px" },
  { cls: "w-16 h-4", label: "16 · 64px" },
];

const RADII: readonly { cls: string; spec: string }[] = [
  { cls: "rounded", spec: "4px · helper, badge dot" },
  { cls: "rounded-md", spec: "6px · marker chip" },
  { cls: "rounded-xl", spec: "12px · control, input, button" },
  { cls: "rounded-2xl", spec: "16px · card body" },
  { cls: "rounded-3xl", spec: "24px · hero, sheet" },
  { cls: "rounded-full", spec: "999px · avatar, switch" },
];

export function SpacingSection() {
  return (
    <Sec
      id="spacing"
      title="Spacing та радіуси"
      intro={
        <>
          Tailwind 4-pt base scale (0.5 = 2px → 16 = 64px). Не вигадуй{" "}
          <code>p-[14px]</code> — використовуй найближче значення зі шкали.
          Радіуси відповідають size-driven rhythm: <code>rounded-xl</code> для
          controls, <code>rounded-2xl</code> для cards, <code>rounded-3xl</code>{" "}
          для hero/sheet.
        </>
      }
    >
      <Group label="Канонічна spacing-шкала">
        <div className="space-y-1.5">
          {SPACING_SCALE.map((row) => (
            <div key={row.label} className="flex items-center gap-3 text-xs">
              <span className="w-8 text-2xs text-subtle font-mono">
                {row.label}
              </span>
              <code className="text-muted">{row.value}</code>
              <span className="text-subtle font-mono w-16 text-right">
                {row.px}
              </span>
            </div>
          ))}
        </div>
      </Group>

      <Group label="Bar-візуалізація">
        <div className="space-y-2">
          {SPACING_BARS.map((bar) => (
            <div key={bar.label} className="flex items-center gap-3">
              <div className={`${bar.cls} bg-accent rounded-md`} />
              <span className="text-2xs font-mono text-subtle">
                {bar.label}
              </span>
            </div>
          ))}
        </div>
      </Group>

      <Group label="Border-radius — size-driven шкала">
        <div className="flex flex-wrap gap-4">
          {RADII.map((r) => (
            <div key={r.cls} className="flex flex-col items-center gap-1.5">
              <div
                className={`${r.cls} w-16 h-16 bg-panelHi border border-line shadow-soft`}
              />
              <span className="text-2xs font-mono text-subtle">{r.cls}</span>
              <span className="text-2xs text-subtle text-center w-32">
                {r.spec}
              </span>
            </div>
          ))}
        </div>
      </Group>

      <Group label="Контейнерна стек-шкала">
        <div className="space-y-3 text-xs text-muted">
          <p>
            <code>space-y-2</code> · 8px — щільні списки, форми
          </p>
          <p>
            <code>space-y-4</code> · 16px — група елементів, default vertical
            rhythm
          </p>
          <p>
            <code>space-y-6</code> · 24px — section spacing на mobile
          </p>
          <p>
            <code>space-y-10 / 12</code> · 40 / 48px — section spacing на
            desktop
          </p>
        </div>
      </Group>

      <Group label="Приклад використання">
        <CodeBlock>{SAMPLE_USAGE}</CodeBlock>
      </Group>

      <Group label="Do / Don't">
        <DoDont
          rows={[
            {
              label: "Padding",
              good: <code>p-4</code>,
              bad: <code>p-[15px]</code>,
            },
            {
              label: "Layout gap",
              good: <code>gap-3</code>,
              bad: <code>style=&#123;&#123; gap: 13 &#125;&#125;</code>,
            },
            {
              label: "Control radius",
              good: <code>rounded-xl</code>,
              bad: <code>rounded-lg</code>,
            },
            {
              label: "Card radius",
              good: <code>rounded-2xl</code>,
              bad: <code>rounded-[18px]</code>,
            },
          ]}
        />
      </Group>

      <RuleBadges
        hardRules={[
          { label: "HR #18", hint: "Module-size discipline (max-lines: 600)" },
        ]}
        lintRules={[
          {
            label: "no-rounded-lg",
            hint: "Use rounded-md/xl/2xl tiers — never the 8px in-between",
          },
        ]}
      />
    </Sec>
  );
}
