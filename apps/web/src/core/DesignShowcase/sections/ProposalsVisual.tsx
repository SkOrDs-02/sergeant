/* eslint-disable sergeant-design/no-cyrillic-jsx-literal -- Design-showcase narratives are local review artifacts, not product copy. */
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
// Second review wave (triage 2026-07). IDs prefixed R2- and numbered to match
// the review proposal list. V-10/16/18 of that list were dropped as already
// shipped in this same showcase (DynamicThemeColor / EmptyStateIdle / BottomNavGlow).
import { ViewTransitionDemo } from "./proposals/ViewTransitionDemo";
import { SharedElementMorphDemo } from "./proposals/SharedElementMorphDemo";
import { ContrastMoreDemo } from "./proposals/ContrastMoreDemo";
import { ReducedTransparencyDemo } from "./proposals/ReducedTransparencyDemo";
import { ForcedColorsDemo } from "./proposals/ForcedColorsDemo";
import { DynamicTypeDemo } from "./proposals/DynamicTypeDemo";
import { BreathingMeshDemo } from "./proposals/BreathingMeshDemo";
import { ParallaxHeroDemo } from "./proposals/ParallaxHeroDemo";
import { AccentSkeletonDemo } from "./proposals/AccentSkeletonDemo";
import { OdometerRollupDemo } from "./proposals/OdometerRollupDemo";
import { StreakTiersDemo } from "./proposals/StreakTiersDemo";
import { ScrollRevealDemo } from "./proposals/ScrollRevealDemo";
import { GrainOverlayDemo } from "./proposals/GrainOverlayDemo";
import { SplashCrossfadeDemo } from "./proposals/SplashCrossfadeDemo";

export function ProposalsVisualSection() {
  return (
    <Sec
      id="proposals-visual"
      title="Proposals · Visual (зараз → може бути)"
      intro="Мокапи візуальних ідей у форматі порівняння: ліворуч – поточний вигляд, праворуч – пропозиція. Прототипи без привʼязки до реальних даних; тему перемикай у шапці. V-8 (полумʼя серії) прибрано, вже реалізовано."
    >
      <div className="flex flex-col gap-6">
        <ProposalCompareCard
          id="V-3"
          title="Динамічний theme-color"
          intent="Зараз манифест має статичний theme_color, що слідує лише за `--c-bg` (light #f2ecdf / dark #14100e), але не за модулем. Пропозиція: колір системної панелі підлаштовується під акцент активного модуля з плавним переходом."
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
          intent="Зараз макроси показані трьома горизонтальними смугами (DailyPlanMacros). Пропозиція: концентричні кільця прогресу, щільніший glanceable-підсумок на тих самих токенах."
        >
          <MacroRingDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="V-11"
          title="Тактильна глибина натискання"
          intent="Зараз картки лише масштабуються (active:scale). Пропозиція: додати легку inset-тінь на press, картку «вдавлює», а не просто зменшує."
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
          intent="Зараз зміна періоду ремаунтить чарт (стовпці блимають). Пропозиція: tween значень між періодами, дані «перетікають», а не перезавантажуються."
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
          intent="Зараз :focus-visible – нейтральний ring-focus скрізь. Пропозиція: тінтувати ring акцентом модуля (--module-accent-rgb уже існує), зберігаючи контраст і розмір."
        >
          <FocusGlowDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="V-4"
          title="Морфінг акценту при навігації"
          intent="Система акцентів модулів уже є ([data-module-accent]), але акцент міняється миттєво. Пропозиція: плавний crossfade акценту між модулями, одна суцільна поверхня, що перетінюється."
        >
          <AccentMorphDemo />
        </ProposalCompareCard>

        <div className="mt-2 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-style-eyebrow text-muted">
            Друга хвиля · review 2026-07
          </span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <p className="text-style-caption leading-relaxed text-muted">
          Кожен мокап – пара «Зараз ↔ Може бути». R2-V-10/16/18 зі списку ревʼю
          прибрано як уже реалізовані вище (DynamicThemeColor · EmptyStateIdle ·
          BottomNavGlow). Анімовані демо поважають prefers-reduced-motion.
        </p>

        <ProposalCompareCard
          id="R2-V-1"
          title="View Transitions API"
          intent="Зараз переходи модуль↔хаб – кастомний PageTransition. Пропозиція: нативний startViewTransition з крос-фейдом/слайдом."
        >
          <ViewTransitionDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="R2-V-2"
          title="Shared-element morph"
          intent="Зараз іконка модуля і хедер – окремі елементи, поява різка. Пропозиція: іконка «перелітає» в акцент-хедер спільним елементом переходу."
        >
          <SharedElementMorphDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="R2-V-3"
          title="prefers-contrast: more"
          intent="Зараз один набір токенів для всіх. Пропозиція: high-contrast варіант, жирніші межі, темніший текст, чіткіші поверхні."
        >
          <ContrastMoreDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="R2-V-4"
          title="prefers-reduced-transparency"
          intent="Зараз mesh/blur-шари завжди активні. Пропозиція: за системним прапорцем, суцільні поверхні без втрати ієрархії."
        >
          <ReducedTransparencyDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="R2-V-5"
          title="forced-colors (Windows HC)"
          intent="Зараз у forced-colors режимі кольори «злипаються». Пропозиція: мапінг на системні кольори, межі й фокус лишаються читабельними."
        >
          <ForcedColorsDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="R2-V-6"
          title="Dynamic Type"
          intent="Зараз розмір тексту фіксований. Пропозиція: масштаб із системного налаштування, зберігаючи ритм і tap-таргети."
        >
          <DynamicTypeDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="R2-V-7"
          title="Живий mesh-фон"
          intent="Зараз MeshBackground статичний. Пропозиція: дуже повільне idle-дихання градієнта в межах motion-бюджету."
        >
          <BreathingMeshDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="R2-V-8"
          title="Паралакс hero"
          intent="Зараз hub-hero плоский при скролі. Пропозиція: шари рухаються з різною швидкістю (useScrollParallax уже є в кодовій базі)."
        >
          <ParallaxHeroDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="R2-V-9"
          title="Акцент-aware skeleton"
          intent="Зараз shimmer нейтральний для всіх модулів. Пропозиція: плейсхолдери підбирають hue активного модуля."
        >
          <AccentSkeletonDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="R2-V-11"
          title="Одометр великих тоталів"
          intent="Зараз AnimatedNumber просто тікає. Пропозиція: кожна цифра – окремий барабан, що прокручується (натяк на лічильник)."
        >
          <OdometerRollupDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="R2-V-12"
          title="Streak-flame градації"
          intent="Зараз полумʼя стрік однакове. Пропозиція: колір та інтенсивність ростуть tier-ами з довжиною серії."
        >
          <StreakTiersDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="R2-V-17"
          title="Scroll-driven reveal"
          intent="Зараз картки просто присутні. Пропозиція: staggered fade-in при вході у viewport (тільки при першій появі)."
        >
          <ScrollRevealDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="R2-V-19"
          title="Grain / noise-overlay"
          intent="Зараз cream-поверхні пласкі. Пропозиція: тонка «паперова» текстура (статичний SVG-шум 5% через multiply, без градієнтів)."
        >
          <GrainOverlayDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="R2-V-20"
          title="Splash → app crossfade"
          intent="Зараз cold-start різкий. Пропозиція: брендовий splash плавно тане у Хаб, лого переходить у хедер."
        >
          <SplashCrossfadeDemo />
        </ProposalCompareCard>
      </div>
    </Sec>
  );
}
