import {
  Banner,
  Button,
  Card,
  EmptyState,
  Icon,
  ICON_NAMES,
  Stat,
} from "@shared/components/ui";
import { Sec, Group } from "../_shared";

export function DataDisplaySection() {
  return (
    <Sec id="data" title="Відображення даних">
      <Group label="Stat — варіанти">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(
            [
              "default",
              "success",
              "warning",
              "danger",
              "finyk",
              "fizruk",
              "routine",
              "nutrition",
            ] as const
          ).map((variant) => (
            <Card key={variant} variant="default" padding="md" radius="lg">
              <Stat
                label={variant}
                value="1 234"
                sublabel="+5%"
                variant={variant}
              />
            </Card>
          ))}
        </div>
      </Group>

      <Group label="Stat — розміри та вирівнювання">
        <div className="flex flex-wrap gap-8">
          <Stat label="size=sm" value="42" size="sm" />
          <Stat label="size=md" value="42" size="md" />
          <Stat label="size=lg" value="42" size="lg" />
          <Stat label="з icon" value="82 кг" icon="⚡" size="md" />
          <Stat label="center" value="7/10" align="center" size="md" />
          <Stat label="right" value="98%" align="right" size="md" />
        </div>
      </Group>

      <Group label="Banner">
        <div className="space-y-2">
          <Banner variant="info">
            Banner variant=&quot;info&quot; — інформаційне повідомлення
          </Banner>
          <Banner variant="success">
            Banner variant=&quot;success&quot; — успішна операція
          </Banner>
          <Banner variant="warning">
            Banner variant=&quot;warning&quot; — попередження
          </Banner>
          <Banner variant="danger">
            Banner variant=&quot;danger&quot; — помилка або небезпека
          </Banner>
        </div>
      </Group>

      <Group label="EmptyState">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card variant="flat" padding="none" radius="lg">
            <EmptyState
              icon={<Icon name="search" size={24} />}
              title="Нічого не знайдено"
              description="Спробуй змінити пошуковий запит або скинути фільтри."
              action={
                <Button size="sm" variant="secondary">
                  Скинути
                </Button>
              }
            />
          </Card>
          <Card variant="flat" padding="none" radius="lg">
            <EmptyState
              compact
              icon={<Icon name="bar-chart" size={18} />}
              title="Compact EmptyState"
              description="Менший варіант для inline-контексту всередині картки."
            />
          </Card>
        </div>
      </Group>

      <Group label="Іконки">
        <div className="grid grid-cols-5 sm:grid-cols-8 gap-2">
          {ICON_NAMES.map((name) => (
            <div
              key={name}
              className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-panelHi transition-colors"
            >
              <Icon name={name} size={20} className="text-text" />
              <span className="text-2xs text-subtle text-center leading-tight font-mono break-all">
                {name}
              </span>
            </div>
          ))}
        </div>
      </Group>
    </Sec>
  );
}
