import { Button, Icon, IconButton } from "@shared/components/ui";
import { Sec, Group } from "../_shared";

export function ButtonsSection() {
  return (
    <Sec id="buttons" title="Кнопки">
      <Group label="Основні варіанти × розміри">
        <div className="space-y-3">
          {(
            [
              "primary",
              "secondary",
              "ghost",
              "danger",
              "destructive",
              "success",
            ] as const
          ).map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-2">
              <span className="text-2xs text-subtle w-24 shrink-0 font-mono">
                {variant}
              </span>
              {(["xs", "sm", "md", "lg"] as const).map((size) => (
                <Button key={size} variant={variant} size={size}>
                  {size}
                </Button>
              ))}
            </div>
          ))}
        </div>
      </Group>

      <Group label="Module variants">
        <div className="space-y-3">
          {(
            [
              "finyk",
              "fizruk",
              "routine",
              "nutrition",
              "finyk-soft",
              "fizruk-soft",
              "routine-soft",
              "nutrition-soft",
            ] as const
          ).map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-2">
              <span className="text-2xs text-subtle w-32 shrink-0 font-mono">
                {variant}
              </span>
              {(["sm", "md", "lg"] as const).map((size) => (
                <Button key={size} variant={variant} size={size}>
                  {size}
                </Button>
              ))}
            </div>
          ))}
        </div>
      </Group>

      <Group label="Стани" row>
        <Button loading>Завантаження</Button>
        <Button disabled>Вимкнено</Button>
        <Button variant="secondary" loading>
          Secondary
        </Button>
        <Button variant="ghost" disabled>
          Ghost
        </Button>
      </Group>

      <Group label="IconButton">
        <div className="flex flex-wrap gap-3">
          {(["ghost", "secondary", "primary", "danger"] as const).map((v) =>
            (["sm", "md", "lg"] as const).map((s) => (
              <IconButton
                key={`${v}-${s}`}
                variant={v}
                size={s}
                aria-label={`${v} ${s}`}
              >
                <Icon
                  name="plus"
                  size={s === "sm" ? 14 : s === "md" ? 16 : 18}
                />
              </IconButton>
            )),
          )}
        </div>
      </Group>
    </Sec>
  );
}
