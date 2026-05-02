import { useState } from "react";
import { Badge, Icon, Segmented, Tabs } from "@shared/components/ui";
import { ModuleBottomNav } from "@shared/components/ui/ModuleBottomNav";
import { Sec, Group } from "../_shared";

export function NavigationSection() {
  const [tabVal, setTabVal] = useState("overview");
  const [segVal, setSegVal] = useState<"day" | "week" | "month">("day");
  const [navActive, setNavActive] = useState("home");
  return (
    <Sec id="navigation" title="Навігація">
      <Group label="Tabs — underline">
        <Tabs
          items={[
            {
              value: "overview",
              label: "Огляд",
              icon: <Icon name="home" size={14} />,
            },
            {
              value: "stats",
              label: "Статистика",
              badge: (
                <Badge variant="accent" size="xs" tone="solid">
                  3
                </Badge>
              ),
            },
            { value: "settings", label: "Налаштування" },
            { value: "disabled", label: "Disabled", disabled: true },
          ]}
          value={tabVal}
          onChange={setTabVal}
          style="underline"
        />
      </Group>

      <Group label="Tabs — pill × accents">
        <div className="space-y-3">
          {(["brand", "finyk", "fizruk", "routine", "nutrition"] as const).map(
            (variant) => (
              <div key={variant} className="flex items-center gap-3">
                <span className="text-2xs text-subtle font-mono w-20 shrink-0">
                  {variant}
                </span>
                <Tabs
                  items={[
                    { value: "a", label: "Перший" },
                    { value: "b", label: "Другий" },
                    { value: "c", label: "Третій" },
                  ]}
                  value={
                    tabVal === "overview" ||
                    tabVal === "stats" ||
                    tabVal === "settings"
                      ? "a"
                      : tabVal
                  }
                  onChange={setTabVal}
                  style="pill"
                  variant={variant}
                />
              </div>
            ),
          )}
        </div>
      </Group>

      <Group label="Segmented — solid та soft">
        <div className="space-y-5">
          {(["solid", "soft"] as const).map((segStyle) => (
            <div key={segStyle}>
              <div className="text-2xs text-subtle font-mono mb-2">
                style=&quot;{segStyle}&quot;
              </div>
              <div className="flex flex-wrap gap-3">
                {(
                  ["brand", "finyk", "fizruk", "routine", "nutrition"] as const
                ).map((variant) => (
                  <Segmented
                    key={variant}
                    items={[
                      { value: "day", label: "День" },
                      { value: "week", label: "Тиждень" },
                      { value: "month", label: "Місяць" },
                    ]}
                    value={segVal}
                    onChange={(v) => setSegVal(v as "day" | "week" | "month")}
                    style={segStyle}
                    variant={variant}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Group>

      <Group label="ModuleBottomNav — 4 модулі">
        <div className="space-y-3">
          {(["finyk", "fizruk", "routine", "nutrition"] as const).map((mod) => (
            <div
              key={mod}
              className="rounded-2xl overflow-hidden border border-line"
            >
              <ModuleBottomNav
                module={mod}
                ariaLabel={`ModuleBottomNav (${mod})`}
                items={[
                  {
                    id: "home",
                    label: "Головна",
                    icon: <Icon name="home" size={20} />,
                  },
                  {
                    id: "stats",
                    label: "Статистика",
                    icon: <Icon name="bar-chart" size={20} />,
                    badge: mod === "finyk",
                  },
                  {
                    id: "settings",
                    label: "Налаштування",
                    icon: <Icon name="settings" size={20} />,
                  },
                ]}
                activeId={navActive}
                onChange={setNavActive}
              />
            </div>
          ))}
        </div>
      </Group>
    </Sec>
  );
}
