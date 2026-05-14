import { SectionHeading } from "@shared/components/ui";
import {
  CodeBlock,
  DoDont,
  Group,
  RuleBadges,
  Sec,
} from "../_shared/primitives";

const SAMPLE_USAGE = `// Semantic style — preferred (Hard Rule #16)
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
  { cls: "text-2xs", size: "10 / 14" },
];

const SEMANTIC_STYLES = [
  { cls: "text-style-hero", spec: "26 / 32 / 700 / -0.02em" },
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
          Семантичні <code>text-style-*</code> утиліті — переважно. Сира пара
          <code>text-sm font-medium</code> → warn від{" "}
          <code>prefer-text-style</code>. Заборонено <code>text-[Npx]</code> —
          це блокер <code>no-arbitrary-text-size</code>.
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
                <span className="text-2xs text-subtle">{row.size}</span>
              </div>
            ) : (
              <div key={row.cls} className="flex items-baseline gap-4">
                <span className={`${row.cls} font-semibold text-text`}>
                  {row.cls}
                </span>
                <span className="text-2xs text-subtle">{row.size}</span>
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
              <span className="text-2xs text-subtle">{row.spec}</span>
            </div>
          ))}
        </div>
      </Group>

      <Group label="SectionHeading — варіанти">
        <div className="space-y-2">
          <SectionHeading size="xs">SectionHeading xs — eyebrow</SectionHeading>
          <SectionHeading size="sm">SectionHeading sm — eyebrow</SectionHeading>
          <SectionHeading size="md">SectionHeading md</SectionHeading>
          <SectionHeading size="lg">SectionHeading lg</SectionHeading>
          <SectionHeading size="xl">SectionHeading xl</SectionHeading>
        </div>
      </Group>

      <Group label="Font weight" row>
        {([400, 500, 600, 700, 900] as const).map((w) => (
          <div key={w} className="flex flex-col items-center gap-1">
            <span style={{ fontWeight: w }} className="text-2xl text-text">
              Аа
            </span>
            <span className="text-2xs text-subtle">{w}</span>
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
              bad: <code>uppercase tracking-wide text-2xs</code>,
            },
          ]}
        />
      </Group>

      <RuleBadges
        hardRules={[
          { label: "HR #16", hint: "Типографічна шкала, 12px floor" },
        ]}
        lintRules={[
          { label: "prefer-text-style" },
          { label: "no-arbitrary-text-size" },
          { label: "no-eyebrow-drift" },
          { label: "no-ellipsis-dots" },
          { label: "no-bare-empty-text" },
        ]}
      />
    </Sec>
  );
}
