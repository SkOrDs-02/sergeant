import {
  CodeBlock,
  DoDont,
  Group,
  RuleBadges,
  Sec,
  Swatch,
} from "../_shared/primitives";

const SAMPLE_USAGE = `// Tokens — light / dark / hc cascade for free
<div className="bg-panel text-text border border-line">…</div>

// Saturated brand fill behind text-white needs the -strong companion
<button className="bg-accent-strong text-white">Submit</button>`;

export function ColorsSection() {
  return (
    <Sec
      id="colors"
      title="Кольори та токени"
      intro={
        <>
          Семантичні токени з <code>:root</code> та <code>.dark</code>. Hex у
          класах заборонено — це гейтить <code>check-design-conventions</code>.
          Парні light/dark literal, opacity-шкала і <code>-strong</code>{" "}
          компаньйон під <code>text-white</code> лишаються обовʼязковими, але
          review-only (ADR-0081).
        </>
      }
    >
      <Group label="Semantic — поверхні">
        <div className="flex flex-wrap gap-4">
          <Swatch label="bg-bg" className="bg-bg" />
          <Swatch label="bg-panel" className="bg-panel" />
          <Swatch label="bg-panelHi" className="bg-panelHi" />
          <Swatch label="bg-line" className="bg-line" />
        </div>
      </Group>

      <Group label="Semantic — текст">
        <div className="flex gap-8 items-baseline">
          <div className="flex flex-col gap-1.5">
            <span className="text-style-body font-semibold text-text">
              text-text
            </span>
            <span className="text-style-body text-muted">text-muted</span>
            <span className="text-style-body text-subtle">text-subtle</span>
          </div>
        </div>
      </Group>

      <Group label="Brand & status">
        <div className="flex flex-wrap gap-4">
          <Swatch label="accent" className="bg-accent" />
          <Swatch label="success" className="bg-success" />
          <Swatch label="warning" className="bg-warning" />
          <Swatch label="danger" className="bg-danger" />
          <Swatch label="info" className="bg-info" />
        </div>
        <div className="flex flex-wrap gap-4 mt-3">
          <Swatch label="success-soft" className="bg-success-soft" />
          <Swatch label="warning-soft" className="bg-warning-soft" />
          <Swatch label="danger-soft" className="bg-danger-soft" />
          <Swatch label="info-soft" className="bg-info-soft" />
        </div>
      </Group>

      <Group
        label="-strong tier (WCAG AA на сатурованих заливках)"
        description={
          <>
            Якщо ставиш <code>text-white</code> на бренд-fill — використовуй
            <code>-strong</code> companion. Контраст перевіряється у Storybook і
            design-review.
          </>
        }
      >
        <div className="flex flex-wrap gap-3">
          <div className="bg-brand text-white rounded-xl px-3 py-2 text-style-code">
            bg-brand · text-white (~2.7:1 — fail)
          </div>
          <div className="bg-brand-strong text-white rounded-xl px-3 py-2 text-style-code">
            bg-brand-strong · text-white (WCAG AA — recommended)
          </div>
        </div>
      </Group>

      <Group label="Приклад використання">
        <CodeBlock>{SAMPLE_USAGE}</CodeBlock>
      </Group>

      <Group label="Do / Don't">
        <DoDont
          rows={[
            {
              label: "Background",
              good: <code>bg-panel</code>,
              bad: <code>bg-[#ffffff]</code>,
            },
            {
              label: "Saturated fill + text-white",
              good: <code>bg-accent-strong text-white</code>,
              bad: <code>bg-accent text-white</code>,
            },
            {
              label: "Dark-pair",
              good: <code>bg-panel</code>,
              bad: <code>bg-stone-100 dark:bg-stone-900</code>,
            },
          ]}
        />
      </Group>

      <RuleBadges
        hardRules={[]}
        lintRules={[
          {
            label: "check-design-conventions",
            hint: "raw hex у className — кольори лише через токени",
          },
        ]}
      />
    </Sec>
  );
}
