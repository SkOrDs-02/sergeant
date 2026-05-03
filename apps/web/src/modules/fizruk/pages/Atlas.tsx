import { BodyAtlas } from "../components/BodyAtlas";
import { useRecovery } from "../hooks/useRecovery";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";

type MuscleStatus = "red" | "yellow" | "green";
type HighlighterMuscle =
  | "chest"
  | "upper-back"
  | "lower-back"
  | "trapezius"
  | "biceps"
  | "triceps"
  | "forearm"
  | "front-deltoids"
  | "back-deltoids"
  | "abs"
  | "obliques"
  | "quadriceps"
  | "hamstring"
  | "calves"
  | "adductor"
  | "abductors"
  | "gluteal"
  | "neck";

export function Atlas() {
  const rec = useRecovery();

  const statusByMuscle: Partial<Record<HighlighterMuscle, MuscleStatus>> =
    (() => {
      // Map our muscle ids to body-highlighter muscle keys.
      const map = (id: string | null | undefined): HighlighterMuscle | null => {
        if (!id) return null;
        if (id === "pectoralis_major" || id === "pectoralis_minor")
          return "chest";
        if (id === "latissimus_dorsi") return "upper-back";
        if (id === "rhomboids" || id === "upper_back") return "upper-back";
        if (id === "erector_spinae") return "lower-back";
        if (id === "trapezius") return "trapezius";
        if (id === "biceps") return "biceps";
        if (id === "triceps") return "triceps";
        if (id === "forearms") return "forearm";
        if (id === "front_deltoid") return "front-deltoids";
        if (id === "rear_deltoid") return "back-deltoids";
        if (id === "rectus_abdominis") return "abs";
        if (id === "obliques") return "obliques";
        if (id === "quadriceps") return "quadriceps";
        if (id === "hamstrings") return "hamstring";
        if (id === "calves") return "calves";
        if (id === "adductors") return "adductor";
        if (id === "abductors") return "abductors";
        if (id === "gluteus_maximus" || id === "gluteus_medius")
          return "gluteal";
        if (id === "neck") return "neck";
        return null;
      };
      const worst = (a: MuscleStatus, b: MuscleStatus): MuscleStatus =>
        a === "red" || b === "red"
          ? "red"
          : a === "yellow" || b === "yellow"
            ? "yellow"
            : "green";
      const out: Partial<Record<HighlighterMuscle, MuscleStatus>> = {};
      for (const m of Object.values(rec.by || {}) as Array<{
        id?: string;
        status: MuscleStatus;
      }>) {
        const key = map(m.id);
        if (!key) continue;
        const prev = out[key];
        out[key] = prev ? worst(prev, m.status) : m.status;
      }
      return out;
    })();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-3">
        <section
          className="rounded-3xl p-5 border border-line/20 bg-hero-teal dark:border-teal-800/30 dark:bg-panel dark:bg-[linear-gradient(135deg,rgba(20,184,166,0.18)_0%,rgba(20,184,166,0.05)_100%)]"
          aria-label="Атлас мʼязів"
        >
          <SectionHeading size="sm" variant="fizruk" as="p">
            Атлас мʼязів
          </SectionHeading>
          <h1 className="text-hero font-black text-teal-900 dark:text-white mt-2 leading-tight">
            Стан відновлення
          </h1>
          <div className="flex gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-success inline-block" />
              <span className="text-xs text-teal-700 dark:text-white/70">
                Готовий
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" />
              <span className="text-xs text-teal-700 dark:text-white/70">
                Відновлюється
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-danger inline-block" />
              <span className="text-xs text-teal-700 dark:text-white/70">
                Уникати
              </span>
            </div>
          </div>
        </section>

        <Card radius="lg" padding="lg">
          <BodyAtlas
            statusByMuscle={statusByMuscle}
            height={520}
            showLegend={false}
          />
        </Card>
      </div>
    </div>
  );
}
