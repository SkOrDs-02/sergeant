import { Button } from "@shared/components/ui/Button";
import { Icon, type IconName } from "@shared/components/ui/Icon";
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
    title: "Побачити гроші без шуму",
    body: "Додай першу витрату або підключи Mono, щоб Sergeant показав тижневий патерн.",
  },
  {
    id: "fizruk",
    icon: "dumbbell",
    title: "Зібрати ритм тренувань",
    body: "Запиши перше тренування, і наступна підказка вже буде відштовхуватись від факту.",
  },
  {
    id: "nutrition",
    icon: "utensils",
    title: "Зрозуміти харчування",
    body: "Перший прийом їжі запускає простий денний контекст без складного трекінгу.",
  },
  {
    id: "routine",
    icon: "calendar-check",
    title: "Втримати день",
    body: "Одна задача або звичка дає основу для спокійнішого плану на завтра.",
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
      className="rounded-2xl border border-line bg-panel p-4 sm:p-5 space-y-4"
      aria-labelledby="ftux-outcome-card-title"
      data-testid="ftux-outcome-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2
            id="ftux-outcome-card-title"
            className="text-style-title text-text"
          >
            Почни з одного живого запису
          </h2>
          <p className="text-style-body text-muted leading-relaxed">
            Обери модуль, де найпростіше зробити першу дію. Після цього хаб
            замінить стартові підказки на персональний фокус дня.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => onOpenModule(preferred.id)}
        >
          Відкрити
          <Icon name="chevron-right" size="sm" className="ml-1" />
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
              className={cn(
                "text-left rounded-xl border p-3 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                selected
                  ? "border-brand-500 bg-brand/10"
                  : "border-line bg-bg hover:bg-panelHi",
              )}
            >
              <span className="flex items-start gap-3">
                <span className="mt-0.5 text-brand-strong" aria-hidden="true">
                  <Icon name={module.icon} size="md" />
                </span>
                <span className="space-y-1">
                  {/* eslint-disable-next-line sergeant-design/prefer-text-style -- pre-existing semibold module title; semantic swap deferred to design-token pass */}
                  <span className="block text-sm font-semibold text-text">
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
