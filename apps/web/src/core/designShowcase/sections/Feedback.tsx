import { useState } from "react";
import {
  Avatar,
  Button,
  Card,
  Icon,
  ProgressRing,
  Skeleton,
  SkeletonText,
  Spinner,
  Switch,
  Tooltip,
} from "@shared/components/ui";
import { Sec, Group } from "../_shared";

export function FeedbackSection() {
  const [switchOn, setSwitchOn] = useState(false);
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

      <Group label="Skeleton">
        <div className="space-y-2 max-w-sm">
          <Skeleton className="h-24 w-full" />
          <SkeletonText className="w-3/4" />
          <SkeletonText className="w-1/2" />
          <SkeletonText className="w-2/3" />
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

      <Group label="ProgressRing">
        <div className="flex flex-wrap items-end gap-6">
          {(["sm", "md", "lg", "xl"] as const).map((size) => (
            <ProgressRing key={size} size={size} value={65} max={100} />
          ))}
          <ProgressRing size="lg" value={100} max={100} variant="success" />
          <ProgressRing size="lg" value={30} max={100} variant="warning" />
          <ProgressRing size="lg" value={15} max={100} variant="danger" />
        </div>
      </Group>

      <Group label="Switch">
        <div className="flex flex-wrap items-center gap-6">
          <Switch checked={switchOn} onChange={setSwitchOn} label="Увімкнено" />
          <Switch checked={false} onChange={() => {}} label="Вимкнено" />
          <Switch
            checked={true}
            onChange={() => {}}
            disabled
            label="Disabled on"
          />
          <Switch
            checked={false}
            onChange={() => {}}
            disabled
            label="Disabled off"
          />
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
