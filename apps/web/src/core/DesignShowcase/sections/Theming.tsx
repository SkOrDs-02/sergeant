import {
  CodeBlock,
  DoDont,
  Group,
  RuleBadges,
  Sec,
  Swatch,
} from "../_shared/primitives";
import { useShowcaseSettings } from "../_shared/context";

const SAMPLE_USAGE = `// Toggle theme via classList — tokens cascade for free
document.documentElement.classList.toggle("dark");

// In Tailwind classes, use semantic tokens — they swap automatically
<div className="bg-panel text-text border border-line">…</div>

// Anti-pattern (Hard Rule #13): see Do/Don't row below for the raw-palette example`;

const THEME_MATRIX = [
  {
    label: "Light",
    tone: "Default app theme",
    swatches: [
      { label: "bg-bg", className: "bg-bg" },
      { label: "bg-panel", className: "bg-panel" },
      { label: "text-text", className: "bg-text" },
    ],
  },
  {
    label: "Dark",
    tone: ".dark token cascade, default at night",
    swatches: [
      { label: "bg-bg", className: "bg-bg" },
      { label: "bg-panel", className: "bg-panel" },
      { label: "text-text", className: "bg-text" },
    ],
  },
  {
    label: "High contrast",
    tone: "Toggle in showcase top-bar — bumps text + line contrast",
    swatches: [
      { label: "bg-bg", className: "bg-bg" },
      { label: "bg-panel", className: "bg-panel" },
      { label: "text-text", className: "bg-text" },
    ],
  },
] as const;

export function ThemingSection() {
  const { theme } = useShowcaseSettings();
  return (
    <Sec
      id="theming"
      title="Theming"
      intro={
        <>
          Світла / темна / high-contrast — всі живуть на одному tokenset.
          Перемикач у топ-барі змінює клас на <code>documentElement</code>.
          Парні <code>dark:bg-stone-900</code> заборонено (HR #13, lint{" "}
          <code>no-raw-dark-palette</code>).
        </>
      }
    >
      <Group label="Поточна тема">
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>
            Активна тема:{" "}
            <code className="text-text font-semibold">{theme}</code>
          </span>
          <span className="text-subtle">
            (перемикається у топ-барі або вручну через{" "}
            <code>useDarkMode()</code>)
          </span>
        </div>
      </Group>

      <Group label="Matrix">
        <div className="grid gap-4 sm:grid-cols-3">
          {THEME_MATRIX.map((row) => (
            <div
              key={row.label}
              className="bg-panel border border-line rounded-2xl p-4 space-y-2"
            >
              <div className="text-style-label text-text">{row.label}</div>
              <p className="text-2xs text-muted">{row.tone}</p>
              <div className="flex gap-2 pt-1">
                {row.swatches.map((s) => (
                  <Swatch
                    key={s.label}
                    label={s.label}
                    className={s.className}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Group>

      <Group label="Schedule modes (useDarkMode)">
        <div className="space-y-2 text-xs text-muted">
          <p>
            <code className="text-text">manual</code> — вручну через{" "}
            <code>toggle()</code>. localStorage: <code>hub_dark_mode_v1</code>.
          </p>
          <p>
            <code className="text-text">system</code> — слухаємо{" "}
            <code>prefers-color-scheme</code>.
          </p>
          <p>
            <code className="text-text">sunset</code> — Kyiv-широта (~50N),
            apparent sunrise / sunset з cosine-апроксимацією.
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
              label: "Token usage",
              good: <code>bg-panel text-text</code>,
              bad: <code>bg-white dark:bg-stone-900</code>,
            },
            {
              label: "Theme toggle",
              good: <code>useDarkMode().toggle()</code>,
              bad: <code>localStorage.setItem(&quot;theme&quot;, …)</code>,
            },
            {
              label: "Schedule",
              good: <code>setSchedule(&quot;sunset&quot;)</code>,
              bad: <code>setTimeout(toggle, msUntilSunset)</code>,
            },
          ]}
        />
      </Group>

      <RuleBadges
        hardRules={[
          { label: "HR #13", hint: "No raw dark palette" },
          { label: "HR #11", hint: "No hex in className" },
        ]}
        lintRules={[
          { label: "no-raw-dark-palette" },
          { label: "no-hex-in-classname" },
        ]}
      />
    </Sec>
  );
}
