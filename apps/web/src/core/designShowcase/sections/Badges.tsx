import { Badge } from "@shared/components/ui";
import { Sec, Group } from "../_shared";

export function BadgesSection() {
  return (
    <Sec id="badges" title="Бейджі">
      {(["soft", "solid", "outline"] as const).map((badgeTone) => (
        <Group key={badgeTone} label={`tone="${badgeTone}"`} row>
          {(
            [
              "neutral",
              "accent",
              "success",
              "warning",
              "danger",
              "info",
              "finyk",
              "fizruk",
              "routine",
              "nutrition",
            ] as const
          ).map((variant) => (
            <Badge key={variant} variant={variant} tone={badgeTone}>
              {variant}
            </Badge>
          ))}
        </Group>
      ))}

      <Group label="Розміри та dot" row>
        <Badge variant="accent" size="xs">
          xs
        </Badge>
        <Badge variant="accent" size="sm">
          sm
        </Badge>
        <Badge variant="accent" size="md">
          md
        </Badge>
        <Badge variant="success" dot>
          Активний
        </Badge>
        <Badge variant="danger" dot>
          Критично
        </Badge>
        <Badge variant="warning" dot size="md">
          Увага
        </Badge>
      </Group>
    </Sec>
  );
}
