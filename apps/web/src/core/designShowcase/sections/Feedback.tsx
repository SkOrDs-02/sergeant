import {
  Avatar,
  Button,
  Card,
  Icon,
  ProgressBar,
  ProgressCircle,
  ProgressRing,
  Skeleton,
  SkeletonAvatar,
  SkeletonCardBlock,
  SkeletonText,
  Spinner,
  Tooltip,
} from "@shared/components/ui";
import { Sec, Group } from "../_shared";

export function FeedbackSection() {
  return (
    <Sec id="feedback" title="Фідбек">
      <Group label="Spinner — розміри" row>
        {(["xs", "sm", "md", "lg"] as const).map((size) => (
          <div key={size} className="flex flex-col items-center gap-2">
            <Spinner size={size} />
            <span className="text-2xs text-subtle font-mono">{size}</span>
          </div>
        ))}
      </Group>

      <Group label="ProgressBar — розміри (determinate)">
        <div className="space-y-3 max-w-md">
          {(["xs", "sm", "md", "lg"] as const).map((size) => (
            <div key={size} className="flex items-center gap-3">
              <span className="text-2xs text-subtle font-mono w-6 shrink-0">
                {size}
              </span>
              <ProgressBar
                size={size}
                value={65}
                label={size === "lg" ? "65%" : undefined}
                aria-label={`Progress ${size}`}
                className="flex-1"
              />
            </div>
          ))}
        </div>
      </Group>

      <Group label="ProgressBar — статуси">
        <div className="space-y-3 max-w-md">
          {(
            [
              ["brand", 50],
              ["success", 100],
              ["warning", 35],
              ["danger", 15],
            ] as const
          ).map(([variant, value]) => (
            <div key={variant} className="flex items-center gap-3">
              <span className="text-2xs text-subtle font-mono w-16 shrink-0">
                {variant}
              </span>
              <ProgressBar
                size="md"
                variant={variant}
                value={value}
                aria-label={`Progress ${variant}`}
                className="flex-1"
              />
              <span className="text-xs text-muted tabular-nums w-8 text-right">
                {value}%
              </span>
            </div>
          ))}
        </div>
      </Group>

      <Group label="ProgressBar — indeterminate">
        <div className="space-y-3 max-w-md">
          {(["sm", "md", "lg"] as const).map((size) => (
            <ProgressBar
              key={size}
              size={size}
              indeterminate
              aria-label={`Indeterminate ${size}`}
            />
          ))}
        </div>
      </Group>

      <Group label="ProgressCircle — розміри + статуси">
        <div className="flex flex-wrap items-end gap-6">
          {(["xs", "sm", "md", "lg"] as const).map((size) => (
            <div key={size} className="flex flex-col items-center gap-2">
              <ProgressCircle size={size} value={65} />
              <span className="text-2xs text-subtle font-mono">{size}</span>
            </div>
          ))}
          <ProgressCircle size="md" value={100} variant="success" />
          <ProgressCircle size="md" value={35} variant="warning" />
          <ProgressCircle size="md" value={15} variant="danger" />
          <ProgressCircle size="md" indeterminate aria-label="Завантаження" />
        </div>
      </Group>

      <Group label="ProgressRing (KPI tile)">
        <div className="flex flex-wrap items-end gap-6">
          {(["sm", "md", "lg", "xl"] as const).map((size) => (
            <ProgressRing key={size} size={size} value={65} max={100} />
          ))}
          <ProgressRing size="lg" value={100} max={100} variant="success" />
          <ProgressRing size="lg" value={30} max={100} variant="warning" />
          <ProgressRing size="lg" value={15} max={100} variant="danger" />
        </div>
      </Group>

      <Group label="Skeleton — варіанти">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          <div className="space-y-2">
            <p className="text-2xs text-subtle font-mono">text (lines=4)</p>
            <SkeletonText lines={4} />
          </div>
          <div className="space-y-2">
            <p className="text-2xs text-subtle font-mono">text + shimmer</p>
            <SkeletonText lines={4} shimmer />
          </div>
          <div className="space-y-2">
            <p className="text-2xs text-subtle font-mono">avatar (sm/md/lg)</p>
            <div className="flex items-end gap-3">
              <SkeletonAvatar className="w-8 h-8" />
              <SkeletonAvatar className="w-12 h-12" />
              <SkeletonAvatar className="w-16 h-16" shimmer />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-2xs text-subtle font-mono">rect</p>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" shimmer />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <p className="text-2xs text-subtle font-mono">card</p>
            <SkeletonCardBlock shimmer />
          </div>
        </div>
      </Group>

      <Group label="Анімації">
        <div className="flex flex-wrap gap-4">
          <Card
            variant="default"
            padding="sm"
            radius="lg"
            className="motion-safe:animate-fade-in text-xs font-mono text-muted"
          >
            fade-in
          </Card>
          <Card
            variant="default"
            padding="sm"
            radius="lg"
            className="motion-safe:animate-slide-up text-xs font-mono text-muted"
          >
            slide-up
          </Card>
          <Card
            variant="default"
            padding="sm"
            radius="lg"
            className="motion-safe:animate-scale-in text-xs font-mono text-muted"
          >
            scale-in
          </Card>
          <Card
            variant="default"
            padding="sm"
            radius="lg"
            className="motion-safe:animate-pulse-soft text-xs font-mono text-text"
          >
            pulse-soft
          </Card>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center motion-safe:animate-success-pulse shrink-0">
              <Icon name="check" size={16} className="text-white" />
            </div>
            <span className="text-xs text-muted font-mono">success-pulse</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center shrink-0">
              <Icon
                name="check"
                size={16}
                className="text-white motion-safe:animate-check-pop"
              />
            </div>
            <span className="text-xs text-muted font-mono">check-pop</span>
          </div>
        </div>
      </Group>

      <Group label="Avatar">
        <div className="flex flex-wrap items-end gap-4">
          {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
            <Avatar key={size} size={size} name="Сергій Коваленко" src="" />
          ))}
          <Avatar size="lg" name="Онлайн" status="online" />
          <Avatar size="lg" name="Офлайн" status="offline" />
          <Avatar size="lg" name="Зайнятий" status="busy" />
        </div>
      </Group>

      <Group label="Tooltip">
        <div className="flex flex-wrap items-center gap-4">
          <Tooltip content="Підказка зверху" placement="top-center">
            <Button variant="secondary" size="sm">
              Top
            </Button>
          </Tooltip>
          <Tooltip content="Підказка знизу" placement="bottom-center">
            <Button variant="secondary" size="sm">
              Bottom
            </Button>
          </Tooltip>
          <Tooltip content="Підказка зліва" placement="left-center">
            <Button variant="secondary" size="sm">
              Left
            </Button>
          </Tooltip>
          <Tooltip content="Підказка справа" placement="right-center">
            <Button variant="secondary" size="sm">
              Right
            </Button>
          </Tooltip>
        </div>
      </Group>
    </Sec>
  );
}
