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
          класах заборонено (HR #11), парні light/dark literal — теж (HR #13).
          Сатуровані бренд-заливки під <code>text-white</code> мають вмикати{" "}
          <code>-strong</code> компаньйон (HR #9).
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
            <span className="text-base font-semibold text-text">text-text</span>
            <span className="text-base text-muted">text-muted</span>
            <span className="text-base text-subtle">text-subtle</span>
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
            <code>-strong</code> companion. Lint:{" "}
            <code>sergeant-design/no-low-contrast-text-on-fill</code>.
          </>
        }
      >
        <div className="flex flex-wrap gap-3">
          {/* eslint-disable-next-line sergeant-design/no-low-contrast-text-on-fill -- showcase демонструє AA-fail, а не пропонує його як патерн */}
          <div className="bg-brand text-white rounded-xl px-3 py-2 text-xs font-mono">
            bg-brand · text-white (~2.7:1 — fail)
          </div>
          <div className="bg-brand-strong text-white rounded-xl px-3 py-2 text-xs font-mono">
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
        hardRules={[
          { label: "HR #8", hint: "Opacity scale" },
          { label: "HR #9", hint: "-strong companion" },
          { label: "HR #11", hint: "No hex in className" },
          { label: "HR #13", hint: "No raw dark palette" },
        ]}
        lintRules={[
          { label: "valid-tailwind-opacity" },
          { label: "no-low-contrast-text-on-fill" },
          { label: "no-hex-in-classname" },
          { label: "no-raw-dark-palette" },
        ]}
      />
    </Sec>
  );
}
