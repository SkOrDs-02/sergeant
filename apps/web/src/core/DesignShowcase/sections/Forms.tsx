import { useState } from "react";
import {
  Button,
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

const SAMPLE_USAGE = `// Inputs use focus-visible only (Hard Rule #14)
<FormField label="Email" htmlFor="email">
  <Input id="email" variant="default" size="md" placeholder="hi@example.com" />
</FormField>

// Submit button defaults to brand-strong + text-white (HR #9)
<Button size="md" variant="primary">Зберегти</Button>`;

export function FormsSection() {
  return (
    <Sec
      id="forms"
      title="Форми"
      intro={
        <>
          Кнопки + Input / Textarea / Select / Switch. Контракт фокусу —
          <code>focus-visible:</code> (HR #14, lint{" "}
          <code>prefer-focus-visible</code>); цілі ≥44×44 px (HR stays-touchable
          convention).
        </>
      }
    >
      <Group label="Button variants × sizes">
        <ButtonsMatrix />
      </Group>

      <Group label="Input — variants × sizes">
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

      <Group label="Input — стан error / success">
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
            error="Невірний формат email"
          >
            <Input id="email" placeholder="hi@example.com" error />
          </FormField>
        </div>
      </Group>

      <Group label="Switch — стани">
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
              good: <code>&lt;Button variant=&quot;primary&quot; /&gt;</code>,
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
        hardRules={[
          { label: "HR #14", hint: "focus-visible only, no :focus" },
          { label: "HR #9", hint: "-strong fill behind text-white" },
        ]}
        lintRules={[
          { label: "prefer-focus-visible" },
          { label: "prefer-data-state" },
        ]}
      />
    </Sec>
  );
}

function ButtonsMatrix() {
  return (
    <div className="space-y-3">
      {(["primary", "secondary", "ghost", "danger", "success"] as const).map(
        (variant) => (
          <div key={variant} className="flex flex-wrap items-end gap-3">
            <span className="w-20 text-2xs text-subtle font-mono">
              {variant}
            </span>
            {(["sm", "md", "lg"] as const).map((size) => (
              <Button key={size} variant={variant} size={size}>
                {variant}
              </Button>
            ))}
            <Button variant={variant} size="md" disabled>
              disabled
            </Button>
            <Button variant={variant} size="md" loading>
              loading
            </Button>
          </div>
        ),
      )}
    </div>
  );
}

function SwitchDemo() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return (
    <div className="flex items-center gap-6 flex-wrap">
      <div className="flex items-center gap-2 text-sm text-text">
        <Switch checked={a} onChange={setA} label="Notifications" />
        <span>Notifications</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-text">
        <Switch checked={b} onChange={setB} label="Sound effects" />
        <span>Sound effects</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted">
        <Switch checked={false} onChange={() => {}} disabled label="Disabled" />
        <span>Disabled</span>
      </div>
    </div>
  );
}
