import { SectionHeading } from "@shared/components/ui";
import {
  CodeBlock,
  DoDont,
  Group,
  RuleBadges,
  Sec,
} from "../_shared/primitives";

const SAMPLE_USAGE = `// Semantic style — preferred (12px floor gated by check-design-conventions)
<h2 className="text-style-title text-text">…</h2>

// Eyebrow / overline label
<span className="text-style-overline text-subtle">SECTION</span>`;

interface TextRow {
  cls: string;
  size: string;
  exempt?: boolean;
}

const TEXT_SIZES: readonly TextRow[] = [
  { cls: "text-5xl", size: "48 / 1" },
  { cls: "text-4xl", size: "36 / 40" },
  { cls: "text-3xl", size: "30 / 36" },
  { cls: "text-2xl", size: "24 / 32" },
  { cls: "text-xl", size: "20 / 28", exempt: true },
  { cls: "text-lg", size: "18 / 28", exempt: true },
  { cls: "text-base", size: "16 / 24" },
  { cls: "text-sm", size: "14 / 20", exempt: true },
  { cls: "text-xs", size: "12 / 16" },
  // спадковий 10px — навмисний експонат токена (Tier-1 шкала все ще
  // реєструє `text-2xs` для chart-тіків, тож рядок лишається в таблиці).
  { cls: "text-2xs", size: "10 / 14" },
];

const SEMANTIC_STYLES = [
  { cls: "text-style-headline", spec: "26 / 32 / 700 / -0.02em" },
  { cls: "text-style-title", spec: "20 / 28 / 600 / -0.01em" },
  { cls: "text-style-body", spec: "16 / 24 / 400" },
  { cls: "text-style-label", spec: "14 / 20 / 500" },
  { cls: "text-style-caption", spec: "12 / 16 / 400" },
  { cls: "text-style-overline", spec: "12 / 16 / 600 / 0.06em" },
] as const;

export function TypographySection() {
  return (
    <Sec
      id="typography"
      title="Типографіка"
      intro={
        <>
          Семантичні <code>text-style-*</code> утиліті — переважно; сира пара{" "}
          <code>text-sm font-medium</code> лишається на review (ADR-0081).
          Механічно блокується рівно 12px-floor: <code>text-2xs</code> і{" "}
          <code>text-[Npx]</code> з N &lt; 12 валять{" "}
          <code>check-design-conventions</code>.
        </>
      }
    >
      <Group label="Tier-1 — `text-*` шкала">
        <div className="space-y-1.5">
          {TEXT_SIZES.map((row) =>
            row.exempt ? (
              <div key={row.cls} className="flex items-baseline gap-4">
                <span className={`${row.cls} font-semibold text-text`}>
                  {row.cls}
                </span>
                <span className="text-style-caption text-subtle">
                  {row.size}
                </span>
              </div>
            ) : (
              <div key={row.cls} className="flex items-baseline gap-4">
                <span className={`${row.cls} font-semibold text-text`}>
                  {row.cls}
                </span>
                <span className="text-style-caption text-subtle">
                  {row.size}
                </span>
              </div>
            ),
          )}
        </div>
      </Group>

      <Group label="Tier-0 — семантичні `text-style-*`">
        <div className="space-y-2">
          {SEMANTIC_STYLES.map((row) => (
            <div key={row.cls} className="flex items-baseline gap-4">
              <span className={`${row.cls} text-text`}>{row.cls}</span>
              <span className="text-style-caption text-subtle">{row.spec}</span>
            </div>
          ))}
        </div>
      </Group>

      <Group label="SectionHeading — варіанти">
        <div className="space-y-2">
          <SectionHeading size="xs">SectionHeading xs — eyebrow</SectionHeading>
          <SectionHeading size="xs">SectionHeading sm — eyebrow</SectionHeading>
          <SectionHeading size="md">SectionHeading md</SectionHeading>
          <SectionHeading size="lg">SectionHeading lg</SectionHeading>
          <SectionHeading size="xl">SectionHeading xl</SectionHeading>
        </div>
      </Group>

      <Group label="Font weight" row>
        {([400, 500, 600, 700, 900] as const).map((w) => (
          <div key={w} className="flex flex-col items-center gap-1">
            <span
              style={{ fontWeight: w }}
              className="text-style-title text-text"
            >
              Аа
            </span>
            <span className="text-style-caption text-subtle">{w}</span>
          </div>
        ))}
      </Group>

      <Group label="Приклад використання">
        <CodeBlock>{SAMPLE_USAGE}</CodeBlock>
      </Group>

      <Group label="Do / Don't">
        <DoDont
          rows={[
            {
              label: "Heading",
              good: <code>text-style-title</code>,
              bad: <code>text-xl font-semibold</code>,
            },
            {
              label: "Body",
              good: <code>text-style-body</code>,
              bad: <code>text-base font-normal</code>,
            },
            {
              label: "Розмір",
              good: <code>text-sm</code>,
              bad: <code>text-[14px]</code>,
            },
            {
              label: "Eyebrow",
              good: <code>&lt;SectionHeading size=&quot;xs&quot; /&gt;</code>,
              // спадковий 10px — навмисний BAD-експонат (демонструє
              // анти-патерн, а не рендерить реальний UI-контент).
              bad: <code>uppercase tracking-wide text-2xs</code>,
            },
          ]}
        />
      </Group>

      <RuleBadges
        hardRules={[]}
        lintRules={[
          {
            label: "check-design-conventions",
            hint: "12px floor — text-2xs і text-[<12px] поза allowlist",
          },
        ]}
      />
    </Sec>
  );
}
