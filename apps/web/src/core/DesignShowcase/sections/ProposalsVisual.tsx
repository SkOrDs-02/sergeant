// Showcase section — "Proposals · Visual". Each idea is shown as a
// «Зараз → Може бути» pair (same format as the UX section):
//   V-3   dynamic theme-color (per-module system chrome)
//   V-5   monochrome / themed adaptive icon purpose
//   V-10  graduated macro rings (bars → rings)
//   V-11  tactile press depth (flat scale → inset depth)
//   V-12  empty-state idle motion
//   V-16  active-tab accent glow (dark)
//   V-18  smooth chart transitions on period change
//   V-19  action-icon state morph (add → check)
//   V-20  module-tinted focus ring
//   V-4   module-accent morph on navigation
//
// V-8 (streak-flame micro-animation) was dropped from this set — it is already
// implemented: `StreakFlame` scales colour across six tiers with tokenised
// light/dark ramps, `animate-streak-glow`, and milestone bursts.
//
// Prototypes only — no wiring to real domain state. Theme follows the showcase
// header toggle (Light / Dark).
import { Sec } from "../_shared/primitives";
import { ProposalCompareCard } from "./proposals/_Compare";
import { DynamicThemeColorDemo } from "./proposals/DynamicThemeColorDemo";
import { MonochromeIconDemo } from "./proposals/MonochromeIconDemo";
import { MacroRingDemo } from "./proposals/MacroRingDemo";
import { PressDepthDemo } from "./proposals/PressDepthDemo";
import { EmptyStateIdleDemo } from "./proposals/EmptyStateIdleDemo";
import { BottomNavGlowDemo } from "./proposals/BottomNavGlowDemo";
import { ChartTransitionDemo } from "./proposals/ChartTransitionDemo";
import { IconMorphDemo } from "./proposals/IconMorphDemo";
import { FocusGlowDemo } from "./proposals/FocusGlowDemo";
import { AccentMorphDemo } from "./proposals/AccentMorphDemo";

export function ProposalsVisualSection() {
  return (
    <Sec
      id="proposals-visual"
      title="Proposals · Visual (зараз → може бути)"
      intro="Мокапи візуальних ідей у форматі порівняння: ліворуч — поточний вигляд, праворуч — пропозиція. Прототипи без привʼязки до реальних даних; тему перемикай у шапці. V-8 (полумʼя серії) прибрано — вже реалізовано."
    >
      <div className="flex flex-col gap-6">
        <ProposalCompareCard
          id="V-3"
          title="Динамічний theme-color"
          intent="Зараз манифест має один статичний theme_color (#fdf9f3). Пропозиція: колір системної панелі підлаштовується під акцент активного модуля з плавним переходом."
        >
          <DynamicThemeColorDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="V-5"
          title="Monochrome / themed іконка"
          intent="Зараз у манифесті лише purpose «any» і «maskable». Пропозиція: додати «monochrome» варіант, щоб Android-13+ themed-icons тінтили іконку під палітру системи."
        >
          <MonochromeIconDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="V-10"
          title="Градуйовані кільця макросів"
          intent="Зараз макроси — три горизонтальні смуги (DailyPlanMacros). Пропозиція: концентричні кільця прогресу — щільніший glanceable-підсумок на тих самих токенах."
        >
          <MacroRingDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="V-11"
          title="Тактильна глибина натискання"
          intent="Зараз картки лише масштабуються (active:scale). Пропозиція: додати легку inset-тінь на press — картку «вдавлює», а не просто зменшує."
        >
          <PressDepthDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="V-12"
          title="Idle-рух порожніх станів"
          intent="Зараз ілюстрації порожніх станів статичні. Пропозиція: субтильний idle-рух (повільний float), повністю вимкнений під prefers-reduced-motion."
        >
          <EmptyStateIdleDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="V-16"
          title="Accent-glow під активним табом (dark)"
          intent="Зараз нижня навігація має пласку тінь. Пропозиція: мʼяке акцент-сяйво під активним табом у темній темі, де глибина будується світлом."
        >
          <BottomNavGlowDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="V-18"
          title="Плавні переходи чартів"
          intent="Зараз зміна періоду ремаунтить чарт (стовпці блимають). Пропозиція: tween значень між періодами — дані «перетікають», а не перезавантажуються."
        >
          <ChartTransitionDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="V-19"
          title="Морфінг іконки дії (add → check)"
          intent="AnimatedCheckbox уже анімує тоглери, але кнопки-дії міняють іконку стрибком. Пропозиція: plus плавно морфить у check при успіху."
        >
          <IconMorphDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="V-20"
          title="Focus-ring у кольорі модуля"
          intent="Зараз :focus-visible — нейтральний ring-focus скрізь. Пропозиція: тінтувати ring акцентом модуля (--module-accent-rgb уже існує), зберігаючи контраст і розмір."
        >
          <FocusGlowDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="V-4"
          title="Морфінг акценту при навігації"
          intent="Система акцентів модулів уже є ([data-module-accent]), але акцент міняється миттєво. Пропозиція: плавний crossfade акценту між модулями — одна суцільна поверхня, що перетінюється."
        >
          <AccentMorphDemo />
        </ProposalCompareCard>
      </div>
    </Sec>
  );
}
