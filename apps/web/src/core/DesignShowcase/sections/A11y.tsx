/* eslint-disable sergeant-design/no-eyebrow-drift -- contrast preview table
   intentionally renders raw eyebrow th-cells so the layout matches the
   primitives.tsx DoDont table exactly. */
import { Button, Icon, IconButton } from "@shared/components/ui";
import {
  CodeBlock,
  DoDont,
  Group,
  RuleBadges,
  Sec,
} from "../_shared/primitives";

const SAMPLE_USAGE = `// Visible focus ring on keyboard nav only (Hard Rule #14)
<button className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
  Submit
</button>

// IconButton автоматично отримує min-h/min-w 44px tap-target
<IconButton aria-label="Settings"><Icon name="settings" /></IconButton>`;

const CONTRAST_ROWS = [
  {
    label: "text on bg",
    a: "text-text",
    b: "bg-bg",
    ratio: "≥ 7:1",
    aa: "AAA",
  },
  {
    label: "muted on bg",
    a: "text-muted",
    b: "bg-bg",
    ratio: "≥ 4.5:1",
    aa: "AA",
  },
  {
    label: "subtle on bg",
    a: "text-subtle",
    b: "bg-bg",
    ratio: "≥ 4.5:1",
    aa: "AA (small)",
  },
  {
    label: "white on brand-strong",
    a: "text-white",
    b: "bg-brand-strong",
    ratio: "≥ 4.5:1",
    aa: "AA",
  },
  {
    label: "white on brand (default)",
    a: "text-white",
    b: "bg-brand",
    ratio: "≈ 2.7:1",
    aa: "fail (use -strong)",
  },
];

export function A11ySection() {
  return (
    <Sec
      id="a11y"
      title="A11y"
      intro={
        <>
          Чотири стовпи: видимий фокус (HR #14), tap-targets ≥44×44 px, WCAG AA
          контраст, повага до <code>prefers-reduced-motion: reduce</code> (HR
          #17).
          <code>focus:</code> заборонено — використовуй{" "}
          <code>focus-visible:</code>.
        </>
      }
    >
      <Group label="Focus rings — focus-visible only">
        <div className="flex flex-wrap gap-3 items-center">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <IconButton aria-label="Налаштування">
            <Icon name="settings" />
          </IconButton>
          <a
            href="#a11y"
            className="px-3 py-2 rounded-xl text-style-label text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            Текстове посилання
          </a>
        </div>
        <p className="text-2xs text-muted mt-3">
          Натисни{" "}
          <kbd className="px-1.5 py-0.5 rounded border border-line bg-panelHi text-2xs">
            Tab
          </kbd>{" "}
          щоб побачити focus-ring (тільки клавіатура — не миша).
        </p>
      </Group>

      <Group label="Touch targets ≥44×44 px">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="xs">xs (auto-min)</Button>
          <Button size="sm">sm (auto-min)</Button>
          <IconButton aria-label="Закрити" size="sm">
            <Icon name="x" />
          </IconButton>
          <IconButton aria-label="Закрити" size="md">
            <Icon name="x" />
          </IconButton>
        </div>
        <p className="text-2xs text-muted mt-2">
          Button з <code>size=&quot;xs&quot;/&quot;sm&quot;</code> + IconButton
          автоматично отримують <code>min-h-[44px] min-w-[44px]</code>. Opt-out
          лише через <code>data-compact</code> для щільних cells (heatmap).
        </p>
      </Group>

      <Group label="Контраст — WCAG AA">
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-xs">
            <thead className="bg-panelHi">
              <tr>
                <th
                  scope="col"
                  className="text-left text-2xs uppercase tracking-wide text-subtle px-3 py-2"
                >
                  Пара
                </th>
                <th
                  scope="col"
                  className="text-left text-2xs uppercase tracking-wide text-subtle px-3 py-2"
                >
                  Preview
                </th>
                <th
                  scope="col"
                  className="text-left text-2xs uppercase tracking-wide text-subtle px-3 py-2"
                >
                  Ratio
                </th>
                <th
                  scope="col"
                  className="text-left text-2xs uppercase tracking-wide text-subtle px-3 py-2"
                >
                  WCAG
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {CONTRAST_ROWS.map((row) => (
                <tr key={row.label} className="bg-panel">
                  <td className="px-3 py-2 text-text font-mono text-2xs">
                    {row.label}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`${row.a} ${row.b} px-2 py-1 rounded-md font-semibold`}
                    >
                      Aa
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-muted">
                    {row.ratio}
                  </td>
                  <td className="px-3 py-2 font-mono text-muted">{row.aa}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Group>

      <Group label="prefers-reduced-motion respect">
        <p className="text-xs text-muted">
          Всі <code>animate-*</code> утиліти обгорнуті в{" "}
          <code>motion-safe:</code>; OS-pref{" "}
          <code>prefers-reduced-motion: reduce</code> вимикає їх. Toggle
          &quot;Force&quot; у топ-барі симулює це навіть якщо OS-pref не
          встановлено.
        </p>
      </Group>

      <Group label="Приклад використання">
        <CodeBlock>{SAMPLE_USAGE}</CodeBlock>
      </Group>

      <Group label="Do / Don't">
        <DoDont
          rows={[
            {
              label: "Focus",
              good: <code>focus-visible:ring-2</code>,
              bad: <code>focus:ring-2</code>,
            },
            {
              label: "Tap target",
              good: <code>min-h-[44px] min-w-[44px]</code>,
              bad: <code>w-6 h-6 p-1 (24×24)</code>,
            },
            {
              label: "Contrast",
              good: <code>text-white on bg-brand-strong</code>,
              bad: <code>text-white on bg-brand (саме 2.7:1)</code>,
            },
            {
              label: "Animations",
              good: <code>motion-safe:animate-pulse</code>,
              bad: <code>animate-pulse</code>,
            },
          ]}
        />
      </Group>

      <RuleBadges
        hardRules={[
          { label: "HR #14", hint: "focus-visible only" },
          { label: "HR #17", hint: "Motion budget — respect reduced-motion" },
          { label: "HR #9", hint: "-strong companion for white-on-fill" },
        ]}
        lintRules={[
          { label: "prefer-focus-visible" },
          { label: "no-low-contrast-text-on-fill" },
        ]}
      />
    </Sec>
  );
}
