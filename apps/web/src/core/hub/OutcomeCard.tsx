import { Button } from "@shared/components/ui/Button";
import { type IconName } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import type { DashboardModuleId } from "./hub.types";

const MODULES: ReadonlyArray<{
  id: DashboardModuleId;
  icon: IconName;
  title: string;
  body: string;
}> = [
  {
    id: "finyk",
    icon: "wallet",
    title: "Витрати",
    body: "Додай першу витрату або підключи Monobank.",
  },
  {
    id: "fizruk",
    icon: "dumbbell",
    title: "Тренування",
    body: "Запиши перше тренування.",
  },
  {
    id: "nutrition",
    icon: "utensils",
    title: "Харчування",
    body: "Запиши перший прийом їжі.",
  },
  {
    id: "routine",
    icon: "calendar-check",
    title: "Звички",
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
          aria-label={`Відкрити: ${preferred.title}`}
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
              aria-label={`${module.title}: ${module.body}`}
              // Обраний модуль - той, що відкриє «Відкрити» вгорі; досі це
              // було видно лише кольором рамки.
              aria-current={selected ? "true" : undefined}
              className={cn(
                "text-left rounded-lg border p-3 transition-colors focus-ring",
                selected
                  ? "border-line bg-panel"
                  : "border-line bg-bg hover:bg-panelHi",
              )}
            >
              <span className="flex items-start gap-3">
                <span className="space-y-1">
                  <span className="block text-style-label font-semibold text-text">
                    {module.title}
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
