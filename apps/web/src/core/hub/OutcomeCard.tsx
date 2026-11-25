import { Button } from "@shared/components/ui/Button";
import { DASHBOARD_MODULE_LABELS } from "@sergeant/shared";
import { Icon, type IconName } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import type { DashboardModuleId } from "./hub.types";

const MODULES: ReadonlyArray<{
  id: DashboardModuleId;
  icon: IconName;
  body: string;
}> = [
  {
    id: "finyk",
    icon: "wallet",
    body: "Додай першу витрату або підключи Monobank.",
  },
  {
    id: "fizruk",
    icon: "dumbbell",
    body: "Запиши перше тренування.",
  },
  {
    id: "nutrition",
    icon: "utensils",
    body: "Запиши перший прийом їжі.",
  },
  {
    id: "routine",
    icon: "calendar-check",
    body: "Додай першу звичку.",
  },
];
const DEFAULT_MODULE = MODULES[0] as (typeof MODULES)[number];

interface OutcomeCardProps {
  activeModules: readonly string[];
  primaryModule?: DashboardModuleId | undefined;
  onOpenModule: (module: string) => void;
}

export function OutcomeCard({
  activeModules,
  primaryModule,
  onOpenModule,
}: OutcomeCardProps) {
  const preferred =
    MODULES.find((module) => module.id === primaryModule) ??
    MODULES.find((module) => activeModules.includes(module.id)) ??
    DEFAULT_MODULE;

  return (
    <section
      className="rounded-panel border border-line bg-panel p-4 sm:p-5 space-y-4"
      aria-labelledby="ftux-outcome-card-title"
      data-testid="ftux-outcome-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2
            id="ftux-outcome-card-title"
            className="text-style-title text-text"
          >
            Почни з одного запису
          </h2>
          <p className="text-style-body text-muted leading-relaxed">
            Обери модуль. Після першого запису тут зʼявиться фокус дня.
          </p>
        </div>
        <Button
          type="button"
          variant="solid"
          size="sm"
          onClick={() => onOpenModule(preferred.id)}
          aria-label={`Відкрити: ${DASHBOARD_MODULE_LABELS[preferred.id]}`}
        >
          Відкрити
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {MODULES.map((module) => {
          const selected = module.id === preferred.id;
          return (
            <button
              key={module.id}
              type="button"
              onClick={() => onOpenModule(module.id)}
              aria-label={`${DASHBOARD_MODULE_LABELS[module.id]}: ${module.body}`}
              // Обраний модуль - той, що відкриє «Відкрити» вгорі; досі це
              // тепер це сильніша рамка й заливка.
              aria-current={selected ? "true" : undefined}
              className={cn(
                "text-left rounded-lg border p-3 transition-colors focus-ring",
                selected
                  ? "border-line-strong-v2 bg-panelHi"
                  : "border-line bg-bg hover:bg-panelHi",
              )}
            >
              <span className="flex items-start gap-3">
                <Icon
                  name={module.icon}
                  size="md"
                  className="mt-0.5 shrink-0 text-muted"
                  aria-hidden
                />
                <span className="space-y-1">
                  <span className="block text-style-label font-semibold text-text">
                    {DASHBOARD_MODULE_LABELS[module.id]}
                  </span>
                  <span className="block text-style-caption text-muted leading-relaxed">
                    {module.body}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
