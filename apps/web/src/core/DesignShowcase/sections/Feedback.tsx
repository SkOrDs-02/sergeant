import {
  Avatar,
  Badge,
  ProgressRing,
  Skeleton,
  Spinner,
  Tooltip,
} from "@shared/components/ui";
import {
  CodeBlock,
  DoDont,
  Group,
  RuleBadges,
  Sec,
} from "../_shared/primitives";

const SAMPLE_USAGE = `// Status pills — semantic variants, never raw colors
<Badge variant="success">Done</Badge>
<Badge variant="warning">Pending</Badge>

// Loading skeleton respects reduced-motion
<Skeleton className="h-5 w-2/3" />`;

export function FeedbackSection() {
  return (
    <Sec
      id="feedback"
      title="Фідбек"
      intro={
        <>
          Badge, Spinner, Skeleton, Avatar, ProgressRing, Tooltip. Анімації
          обгорнуті в <code>motion-safe:</code> (HR #17); статуси завжди через
          variants — ніяких сирих <code>bg-green-500</code>.
        </>
      }
    >
      <Group label="Badge — варіанти">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="accent">Accent</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="danger">Danger</Badge>
          <Badge variant="info">Info</Badge>
        </div>
      </Group>

      <Group label="Badge — модулі">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="finyk">Finyk</Badge>
          <Badge variant="fizruk">Fizruk</Badge>
          <Badge variant="routine">Routine</Badge>
          <Badge variant="nutrition">Nutrition</Badge>
        </div>
      </Group>

      <Group label="Spinner — розміри">
        <div className="flex items-center gap-4">
          <Spinner size="xs" className="text-muted" />
          <Spinner size="sm" className="text-muted" />
          <Spinner size="md" className="text-brand" />
          <Spinner size="lg" className="text-brand" />
        </div>
      </Group>

      <Group label="Skeleton">
        <div className="space-y-2 max-w-sm">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </Group>

      <Group label="Avatar — розміри + status dot">
        <div className="flex items-center gap-4 flex-wrap">
          {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
            <Avatar key={size} size={size} name={size.toUpperCase()} />
          ))}
          <Avatar size="lg" name="Online User" status="online" />
          <Avatar size="lg" name="Busy User" status="busy" />
          <Avatar size="lg" name="Offline User" status="offline" />
        </div>
      </Group>

      <Group label="ProgressRing — модулі">
        <div className="flex items-center gap-6 flex-wrap">
          <ProgressRing value={25} size="md" />
          <ProgressRing value={50} size="md" variant="finyk" />
          <ProgressRing value={75} size="md" variant="fizruk" />
          <ProgressRing value={100} size="md" variant="routine" />
        </div>
      </Group>

      <Group label="Tooltip">
        <div className="flex items-center gap-4 flex-wrap">
          <Tooltip content="Top tooltip" placement="top">
            <button
              type="button"
              className="px-3 py-2 rounded-xl border border-line bg-panel text-xs text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              Top
            </button>
          </Tooltip>
          <Tooltip content="Bottom tooltip" placement="bottom">
            <button
              type="button"
              className="px-3 py-2 rounded-xl border border-line bg-panel text-xs text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              Bottom
            </button>
          </Tooltip>
          <Tooltip content="Right tooltip" placement="right">
            <button
              type="button"
              className="px-3 py-2 rounded-xl border border-line bg-panel text-xs text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              Right
            </button>
          </Tooltip>
        </div>
      </Group>

      <Group label="Приклад використання">
        <CodeBlock>{SAMPLE_USAGE}</CodeBlock>
      </Group>

      <Group label="Do / Don't">
        <DoDont
          rows={[
            {
              label: "Status",
              good: <code>&lt;Badge variant=&quot;success&quot; /&gt;</code>,
              bad: (
                <code>&lt;span className=&quot;bg-emerald-500&quot; /&gt;</code>
              ),
            },
            {
              label: "Loading",
              good: <code>&lt;Skeleton /&gt;</code>,
              bad: <code>&lt;div&gt;Завантаження&lt;/div&gt;</code>,
            },
            {
              label: "Tooltip",
              good: <code>&lt;Tooltip content=&quot;Info&quot; /&gt;</code>,
              bad: <code>title=&quot;Info&quot; (native tooltip)</code>,
            },
          ]}
        />
      </Group>

      <RuleBadges
        hardRules={[
          { label: "HR #17", hint: "Motion budget" },
          { label: "HR #14", hint: "focus-visible" },
        ]}
        lintRules={[
          { label: "no-bare-empty-text" },
          { label: "no-ellipsis-dots" },
        ]}
      />
    </Sec>
  );
}
