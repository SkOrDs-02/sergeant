import { useState } from "react";
import {
  Button,
  type ButtonEmphasis,
  type ButtonTone,
  FormField,
  Input,
  Select,
  Textarea,
  Switch,
} from "@shared/components/ui";
import {
  CodeBlock,
  DoDont,
  Group,
  RuleBadges,
  Sec,
} from "../_shared/primitives";

const SAMPLE_USAGE = `// Inputs use focus-visible only (gated by check-design-conventions)
<FormField label="Email" htmlFor="email">
  <Input id="email" variant="default" size="md" placeholder="hi@example.com" />
</FormField>

// Головна дія — чорнило на сторінці (solid × neutral, дефолт)
<Button size="md" variant="solid">Зберегти</Button>`;

export function FormsSection() {
  return (
    <Sec
      id="forms"
      title="Форми"
      intro={
        <>
          Кнопки + Input / Textarea / Select / Switch. Контракт фокусу:{" "}
          <code>focus-visible:</code>, і це гейтить{" "}
          <code>check-design-conventions</code>. Цілі ≥44×44 px під{" "}
          <code>pointer: coarse</code>, Playwright-лейн{" "}
          <code>Mobile UI audit</code> у CI.
        </>
      }
    >
      <Group label="Button variants × sizes">
        <ButtonsMatrix />
      </Group>

      <Group label="Input: variants × sizes">
        <div className="space-y-3">
          {(["default", "filled", "ghost"] as const).map((variant) => (
            <div key={variant} className="grid grid-cols-3 gap-2">
              {(["sm", "md", "lg"] as const).map((size) => (
                <Input
                  key={`${variant}-${size}`}
                  variant={variant}
                  size={size}
                  placeholder={`${variant} ${size}`}
                  aria-label={`${variant} ${size}`}
                />
              ))}
            </div>
          ))}
        </div>
      </Group>

      <Group label="Input: стан error / success">
        <div className="grid grid-cols-2 gap-2 max-w-sm">
          <Input variant="default" size="md" error placeholder="error" />
          <Input variant="default" size="md" success placeholder="success" />
        </div>
      </Group>

      <Group label="FormField + Textarea + Select">
        <div className="space-y-3 max-w-sm">
          <FormField label="Опис" htmlFor="desc">
            <Textarea id="desc" rows={3} placeholder="Кілька рядків опису…" />
          </FormField>
          <FormField label="Категорія" htmlFor="cat">
            <Select id="cat">
              <option>Зарплата</option>
              <option>Кешбек</option>
              <option>Інше</option>
            </Select>
          </FormField>
          <FormField
            label="Email"
            htmlFor="email"
            error="Неправильний формат email"
          >
            <Input id="email" placeholder="hi@example.com" error />
          </FormField>
        </div>
      </Group>

      <Group label="Switch: стани">
        <SwitchDemo />
      </Group>

      <Group label="Приклад використання">
        <CodeBlock>{SAMPLE_USAGE}</CodeBlock>
      </Group>

      <Group label="Do / Don't">
        <DoDont
          rows={[
            {
              label: "Focus",
              good: <code>focus-visible:ring-2 ring-accent/60</code>,
              bad: <code>focus:outline-1 focus:outline-black</code>,
            },
            {
              label: "Submit",
              good: <code>&lt;Button variant=&quot;solid&quot; /&gt;</code>,
              bad: (
                <code>&lt;button className=&quot;bg-green-500&quot; /&gt;</code>
              ),
            },
            {
              label: "Field label",
              good: <code>&lt;FormField label=&quot;Email&quot; /&gt;</code>,
              bad: <code>&lt;span&gt;Email&lt;/span&gt; + bare Input</code>,
            },
          ]}
        />
      </Group>

      <RuleBadges
        hardRules={[]}
        lintRules={[
          {
            label: "check-design-conventions",
            hint: "`focus:` заборонено, лише focus-visible: / focus-within:",
          },
        ]}
      />
    </Sec>
  );
}

// Ті самі п'ять рядків, що до 2026-11-22 стояли легасі-іменами
// (`primary`, `secondary`, `ghost`, `danger`, `success`), у каноні
// `variant` × `tone`.
const BUTTON_MATRIX_ROWS: ReadonlyArray<{
  label: string;
  variant: ButtonEmphasis;
  tone: ButtonTone;
}> = [
  { label: "solid", variant: "solid", tone: "neutral" },
  { label: "outline", variant: "outline", tone: "neutral" },
  { label: "ghost", variant: "ghost", tone: "neutral" },
  { label: "soft danger", variant: "soft", tone: "danger" },
  { label: "soft success", variant: "soft", tone: "success" },
];

function ButtonsMatrix() {
  return (
    <div className="space-y-3">
      {BUTTON_MATRIX_ROWS.map(({ label, variant, tone }) => (
        <div key={label} className="flex flex-wrap items-end gap-3">
          <span className="w-20 text-style-code text-subtle">{label}</span>
          {(["sm", "md", "lg"] as const).map((size) => (
            <Button key={size} variant={variant} tone={tone} size={size}>
              {label}
            </Button>
          ))}
          <Button variant={variant} tone={tone} size="md" disabled>
            disabled
          </Button>
          <Button variant={variant} tone={tone} size="md" loading>
            loading
          </Button>
        </div>
      ))}
    </div>
  );
}

function SwitchDemo() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return (
    <div className="flex items-center gap-6 flex-wrap">
      <div className="flex items-center gap-2 text-style-label text-text">
        <Switch checked={a} onChange={setA} label="Notifications" />
        <span>Notifications</span>
      </div>
      <div className="flex items-center gap-2 text-style-label text-text">
        <Switch checked={b} onChange={setB} label="Sound effects" />
        <span>Sound effects</span>
      </div>
      <div className="flex items-center gap-2 text-style-label text-muted">
        <Switch checked={false} onChange={() => {}} disabled label="Disabled" />
        <span>Disabled</span>
      </div>
    </div>
  );
}
