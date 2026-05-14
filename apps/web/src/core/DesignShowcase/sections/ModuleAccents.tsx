import { Card } from "@shared/components/ui";
import {
  CodeBlock,
  DoDont,
  Group,
  RuleBadges,
  Sec,
} from "../_shared/primitives";

const SAMPLE_USAGE = `// All four module tokens — used in cross-module surfaces (core/**, shared/**)
<ModuleAccentProvider module="finyk">
  <Card module="finyk" prominence="hero">…</Card>
</ModuleAccentProvider>

// Inside apps/web/src/modules/finyk/** — only finyk accents allowed.
// Foreign accent (e.g. text-fizruk) is blocked by no-foreign-module-accent.`;

type ModuleId = "finyk" | "fizruk" | "routine" | "nutrition";

interface ModuleEntry {
  id: ModuleId;
  label: string;
  hue: string;
  role: string;
  textCls: string;
  swatch: { base: string; strong: string; soft: string; surface: string };
}

const MODULES: readonly ModuleEntry[] = [
  {
    id: "finyk",
    label: "ФІНІК",
    hue: "Emerald",
    role: "Фінанси, бюджети, кешбек",
    textCls: "text-finyk",
    swatch: {
      base: "bg-finyk",
      strong: "bg-finyk-strong",
      soft: "bg-finyk-soft",
      surface: "bg-finyk-surface",
    },
  },
  {
    id: "fizruk",
    label: "ФІЗРУК",
    hue: "Teal",
    role: "Тренування, кроки, body composition",
    textCls: "text-fizruk",
    swatch: {
      base: "bg-fizruk",
      strong: "bg-fizruk-strong",
      soft: "bg-fizruk-soft",
      surface: "bg-fizruk-surface",
    },
  },
  {
    id: "routine",
    label: "Рутина",
    hue: "Coral",
    role: "Звички, чек-листи",
    textCls: "text-routine",
    swatch: {
      base: "bg-routine",
      strong: "bg-routine-strong",
      soft: "bg-routine-soft",
      surface: "bg-routine-surface",
    },
  },
  {
    id: "nutrition",
    label: "Харчування",
    hue: "Lime",
    role: "Калорії, KBJU, рецепти",
    textCls: "text-nutrition",
    swatch: {
      base: "bg-nutrition",
      strong: "bg-nutrition-strong",
      soft: "bg-nutrition-soft",
      surface: "bg-nutrition-surface",
    },
  },
];

export function ModuleAccentsSection() {
  return (
    <Sec
      id="accents"
      title="Module Accents"
      intro={
        <>
          Чотири бренд-акценти модулів — emerald / teal / coral / lime. Кожен
          модуль користується лише своїм акцентом (HR #12) — lint{" "}
          <code>no-foreign-module-accent</code> блокує <code>text-fizruk</code>{" "}
          у <code>apps/web/src/modules/finyk/**</code>.
        </>
      }
    >
      <Group label="Token preview">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {MODULES.map((m) => (
            <div
              key={m.id}
              className="bg-panel border border-line rounded-2xl p-3 space-y-2"
            >
              <div className={`text-sm font-bold ${m.textCls}`}>{m.label}</div>
              <div className="text-2xs text-muted">{m.hue}</div>
              <div className="text-2xs text-subtle">{m.role}</div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span
                  className={`w-5 h-5 rounded-md ${m.swatch.base}`}
                  aria-hidden="true"
                />
                <span
                  className={`w-5 h-5 rounded-md ${m.swatch.strong}`}
                  aria-hidden="true"
                />
                <span
                  className={`w-5 h-5 rounded-md ${m.swatch.soft}`}
                  aria-hidden="true"
                />
                <span
                  className={`w-5 h-5 rounded-md border border-line ${m.swatch.surface}`}
                  aria-hidden="true"
                />
              </div>
              <div className="text-2xs font-mono text-subtle">
                base · -strong · -soft · -surface
              </div>
            </div>
          ))}
        </div>
      </Group>

      <Group label="Card prominence — soft / tinted / hero">
        <div className="grid grid-cols-2 gap-3">
          {MODULES.map((m) => (
            <Card
              key={m.id}
              module={m.id}
              prominence="soft"
              padding="md"
              radius="xl"
            >
              <div className="text-xs font-semibold text-text">{m.label}</div>
              <div className="text-2xs text-muted mt-1">
                prominence=&quot;soft&quot;
              </div>
            </Card>
          ))}
        </div>
      </Group>

      <Group label="Module-accent containment правило">
        <div className="space-y-2 text-xs text-muted">
          <p>
            <code>apps/{`{web,mobile}`}/src/modules/&lt;X&gt;/**</code> →
            дозволено лише акценти модуля <code>&lt;X&gt;</code>.
          </p>
          <p>
            <code>apps/{`{web,mobile}`}/src/core/**</code>,{" "}
            <code>shared/**</code>, <code>stories/**</code> — cross-module
            shells, можуть використовувати всі чотири.
          </p>
          <p>
            <code>modules/shared/</code> (cross-module utility folder) — те
            саме, що core/shared.
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
              label: "Module-only accent",
              good: <code>modules/finyk/&lt;file&gt; uses text-finyk</code>,
              bad: <code>modules/finyk/&lt;file&gt; uses text-fizruk</code>,
            },
            {
              label: "Hero variant",
              good: (
                <code>
                  &lt;Card module=&quot;finyk&quot; prominence=&quot;hero&quot;
                  /&gt;
                </code>
              ),
              bad: <code>bg-finyk text-white shadow-xl rounded-3xl</code>,
            },
            {
              label: "Cross-module shell",
              good: <code>core/* — uses all four ad-hoc</code>,
              bad: <code>core/* — hardcodes one module&apos;s hue</code>,
            },
          ]}
        />
      </Group>

      <RuleBadges
        hardRules={[{ label: "HR #12", hint: "Module-accent containment" }]}
        lintRules={[{ label: "no-foreign-module-accent" }]}
      />
    </Sec>
  );
}
