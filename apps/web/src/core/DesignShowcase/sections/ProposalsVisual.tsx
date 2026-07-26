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
import { Sec, Group } from "../_shared/primitives";
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

        <div className="mt-2 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-2xs uppercase tracking-wide text-muted">Друга хвиля · review 2026-07</span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <p className="text-2xs leading-relaxed text-muted">
          Ці мокапи — одиночні прототипи (без пари «зараз/може бути»). R2-V-10/16/18 зі списку рев’ю прибрано як уже реалізовані вище
          (DynamicThemeColor · EmptyStateIdle · BottomNavGlow). Анімовані демо поважають prefers-reduced-motion.
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          <Group label="R2-V-1 · View Transitions API" description="Крос-фейд/слайд між модулем і хабом через startViewTransition замість кастомного PageTransition.">
            <ViewTransitionDemo />
          </Group>
          <Group label="R2-V-2 · Shared-element morph" description="Іконка модуля «перелітає» в акцент-хедер при вході — спільний елемент переходу.">
            <SharedElementMorphDemo />
          </Group>
          <Group label="R2-V-3 · prefers-contrast: more" description="High-contrast набір токенів: жирніші межі, темніший текст, чіткіші поверхні.">
            <ContrastMoreDemo />
          </Group>
          <Group label="R2-V-4 · prefers-reduced-transparency" description="Вимикає blur/mesh-шари на користь суцільних поверхонь без втрати ієрархії.">
            <ReducedTransparencyDemo />
          </Group>
          <Group label="R2-V-5 · forced-colors (Windows HC)" description="Мапінг на системні кольори у forced-colors режимі — межі й фокус лишаються читабельними.">
            <ForcedColorsDemo />
          </Group>
          <Group label="R2-V-6 · Dynamic Type" description="Масштаб тексту з системного налаштування; ритм і tap-таргети зберігаються.">
            <DynamicTypeDemo />
          </Group>
          <Group label="R2-V-7 · Живий mesh-фон" description="Дуже повільне idle-дихання градієнтного фону в межах motion-бюджету.">
            <BreathingMeshDemo />
          </Group>
          <Group label="R2-V-8 · Паралакс hero" description="Шари hero рухаються з різною швидкістю при скролі (useScrollParallax уже є в кодовій базі).">
            <ParallaxHeroDemo />
          </Group>
          <Group label="R2-V-9 · Акцент-aware skeleton" description="Плейсхолдери завантаження підбирають hue активного модуля замість нейтрального shimmer.">
            <AccentSkeletonDemo />
          </Group>
          <Group label="R2-V-11 · Одометр великих тоталів" description="Кожна цифра — окремий барабан, що прокручується; натяк на лічильник.">
            <OdometerRollupDemo />
          </Group>
          <Group label="R2-V-12 · Streak-flame градації" description="Колір та інтенсивність полумʼя ростуть tier-ами з довжиною серії.">
            <StreakTiersDemo />
          </Group>
          <Group label="R2-V-17 · Scroll-driven reveal" description="Картки мʼяко зʼявляються при вході у viewport (staggered fade-in).">
            <ScrollRevealDemo />
          </Group>
          <Group label="R2-V-19 · Grain / noise-overlay" description="Тонка «паперова» текстура на cream-поверхнях (5% через multiply, без градієнтів).">
            <GrainOverlayDemo />
          </Group>
          <Group label="R2-V-20 · Splash → app crossfade" description="Брендовий splash плавно тане у Хаб, лого переходить у хедер замість різкого cold-start.">
            <SplashCrossfadeDemo />
          </Group>
        </div>
      </div>
    </Sec>
  );
}
