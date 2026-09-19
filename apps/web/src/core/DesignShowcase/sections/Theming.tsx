import {
  CodeBlock,
  DoDont,
  Group,
  RuleBadges,
  Sec,
  Swatch,
} from "../_shared/primitives";
import { useShowcaseSettings } from "../_shared/context";

const SAMPLE_USAGE = `// Three explicit choices, one owner of the <html> classes
const { choice, setChoice, isDark, isHighContrast } = useTheme();
setChoice("dark"); // "light" | "dark" | "hc" — no schedule, no "system"

// In Tailwind classes, use semantic tokens — they swap automatically
<div className="bg-panel text-text border border-line">…</div>

// Anti-pattern (review-only convention): see Do/Don't row below for the raw-palette example`;

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
    tone: "Toggle in showcase top-bar: bumps text + line contrast",
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
          Світла / темна / high-contrast, всі живуть на одному tokenset.
          Перемикач у топ-барі змінює клас на <code>documentElement</code>.
          Парні <code>dark:bg-stone-900</code> заборонено, конвенція review-only
          (ADR-0081); механічно гейтиться лише сирий hex у className (
          <code>check-design-conventions</code>).
        </>
      }
    >
      <Group label="Поточна тема">
        <div className="flex items-center gap-3 text-style-caption text-muted">
          <span>
            Активна тема:{" "}
            <code className="text-text font-semibold">{theme}</code>
          </span>
          <span className="text-subtle">
            (перемикається у топ-барі або вручну через{" "}
            <code>useTheme().setChoice()</code>)
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
              <p className="text-style-caption text-muted">{row.tone}</p>
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

      <Group label="Три режими (useTheme)">
        <div className="space-y-2 text-style-caption text-muted">
          <p>
            <code className="text-text">light</code> /{" "}
            <code className="text-text">dark</code> /{" "}
            <code className="text-text">hc</code>: явний вибір користувача, один
            власник класів <code>dark</code> і <code>hc</code> на{" "}
            <code>&lt;html&gt;</code>. Режиму «за розкладом» і «як у системі»
            немає: колишній <code>useDarkMode</code> із manual / system / sunset
            знято, а збережене <code>system</code> мігрується в одноразовий
            знімок <code>prefers-color-scheme</code>.
          </p>
          <p>
            Вибір переживає перезавантаження, синхронізується між вкладками і
            перевстановлюється після bfcache на iOS PWA (<code>pageshow</code>
            ). Лейбли й іконки для перемикачів беруться з{" "}
            <code>THEME_CHOICE_LABELS</code> / <code>THEME_CHOICE_ICONS</code>.
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
              label: "Theme switch",
              good: <code>useTheme().setChoice(&quot;dark&quot;)</code>,
              bad: <code>localStorage.setItem(&quot;theme&quot;, …)</code>,
            },
            {
              label: "Dark class",
              good: <code>useTheme()</code>,
              bad: (
                <code>documentElement.classList.toggle(&quot;dark&quot;)</code>
              ),
            },
          ]}
        />
      </Group>

      <RuleBadges
        hardRules={[]}
        lintRules={[
          {
            label: "check-design-conventions",
            hint: "raw hex у className, кольори лише через токени",
          },
        ]}
      />
    </Sec>
  );
}
