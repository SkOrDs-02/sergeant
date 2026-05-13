import { Prose, SectionHeading } from "@shared/components/ui";
import { Sec, Group } from "../_shared";

// ── Demo data ──────────────────────────────────────────────────────────
// Single source for the 12-slot fluid type scale so the showcase stays
// in sync with the design-tokens preset. Each entry pairs the utility
// class with a human-readable contract string for the right column.

const TEXT_STYLES = [
  {
    cls: "text-style-display",
    contract: "32 → 56px / 1.05 / 700 / -0.025em",
    sample: "Sergeant — твій персональний хаб життя",
  },
  {
    cls: "text-style-headline",
    contract: "26 → 36px / 1.15 / 700 / -0.02em",
    sample: "Сьогодні твій 47-й день поспіль",
  },
  {
    cls: "text-style-title-lg",
    contract: "22 → 28px / 1.25 / 600 / -0.015em",
    sample: "Огляд тижня — фінансовий пульс",
  },
  {
    cls: "text-style-title",
    contract: "18 → 22px / 1.3 / 600 / -0.01em",
    sample: "Тренування плечей",
  },
  {
    cls: "text-style-subtitle",
    contract: "16 → 18px / 1.4 / 500",
    sample: "Активність за останні 7 днів",
  },
  {
    cls: "text-style-body-lg",
    contract: "16 → 18px / 1.55 / 400",
    sample: "Звичка формується там, де є ритм.",
  },
  {
    cls: "text-style-body",
    contract: "15 → 16px / 1.55 / 400",
    sample: "Дефолтний body — для довгих описів і кроків інструкцій.",
  },
  {
    cls: "text-style-body-sm",
    contract: "13 → 14px / 1.55 / 400",
    sample: "Допоміжний текст під полем чи розширений опис картки.",
  },
  {
    cls: "text-style-label",
    contract: "13 → 14px / 1.4 / 500",
    sample: "Сума витрати",
  },
  {
    cls: "text-style-caption",
    contract: "12px floor / 1.4 / 400",
    sample: "Оновлено щойно · з Monobank",
  },
  {
    cls: "text-style-overline",
    contract: "12px floor / 1.4 / 600 / 0.08em / UPPER",
    sample: "Фінік · сьогодні",
  },
  {
    cls: "text-style-code",
    contract: "13 → 14px / 1.5 / 500 / mono",
    sample: "queryKey: finykKeys.txByDay(date)",
  },
] as const;

const STATS = [
  { day: "Пн", revenue: 1850, change: 12 },
  { day: "Вт", revenue: 2340, change: -4 },
  { day: "Ср", revenue: 980, change: 28 },
  { day: "Чт", revenue: 4120, change: 7 },
  { day: "Пт", revenue: 12400, change: -18 },
] as const;

function ProseDemo() {
  return (
    <Prose>
      <h2>Заголовок розділу</h2>
      <p>
        Усі типографічні рішення живуть у семантичній шкалі{" "}
        <code>.text-style-*</code>. Цей блок рендерить сирий HTML — без
        додаткової розмітки — і однаково охайно читається на 320 px, 768 px і
        1440 px завдяки <code>clamp()</code> розмірам і кепу{" "}
        <code>--max-line-length: 70ch</code>.
      </p>
      <h3>Підзаголовок</h3>
      <p>
        Списки, цитати та посилання отримують узгоджені вертикальні ритми. Ось{" "}
        <a href="#prose">внутрішнє посилання</a>, що використовує{" "}
        <code>text-accent</code> + <code>focus-visible</code> кільце для
        клавіатурної доступності.
      </p>
      <ul>
        <li>12px floor — Hard Rule #16, ніщо менше за caption.</li>
        <li>OpenType: kerning, common ligatures, ss01 alternates.</li>
        <li>
          <code>.tnum</code> вмикає tabular-nums для числових колонок.
        </li>
      </ul>
      <blockquote>
        «Дизайн не про те, як це виглядає. Це про те, як це працює.» — Steve
        Jobs
      </blockquote>
    </Prose>
  );
}

export function TypographySection() {
  return (
    <Sec id="typography" title="Типографіка">
      <Group label="Семантична шкала — .text-style-* (fluid clamp)">
        <div className="space-y-4">
          {TEXT_STYLES.map(({ cls, contract, sample }) => (
            <div
              key={cls}
              className="flex flex-col gap-1 pb-3 border-b border-line last:border-b-0 last:pb-0"
            >
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <span className="text-style-overline text-subtle">{cls}</span>
                <span className="text-style-caption text-subtle font-mono">
                  {contract}
                </span>
              </div>
              <span className={`${cls} text-text`}>{sample}</span>
            </div>
          ))}
        </div>
      </Group>

      <Group label="Prose — стандартний HTML рендерить багатий текст">
        <div className="rounded-2xl border border-line bg-panel p-5">
          <ProseDemo />
        </div>
      </Group>

      <Group label="Prose — варіант compact">
        <div className="rounded-2xl border border-line bg-panel p-5">
          <Prose variant="compact">
            <h3>Compact-режим</h3>
            <p>
              У сайдбарах, шітах і дрібних блоках текст автоматично сходить на{" "}
              <code>body-sm</code> з тіснішим вертикальним ритмом — без зміни
              кепу читабельності.
            </p>
            <ul>
              <li>Менше повітря між блоками.</li>
              <li>Body-sm — для секундарних описів.</li>
            </ul>
          </Prose>
        </div>
      </Group>

      <Group label="Tabular-nums — .tnum для числових колонок">
        <div className="rounded-2xl border border-line bg-panel overflow-hidden">
          <table className="w-full text-style-body">
            <thead className="text-style-overline text-subtle bg-panelHi">
              <tr>
                <th className="text-left py-2 px-4">День</th>
                <th className="text-right py-2 px-4">Дохід, ₴</th>
                <th className="text-right py-2 px-4">Δ, %</th>
              </tr>
            </thead>
            <tbody>
              {STATS.map(({ day, revenue, change }) => (
                <tr key={day} className="border-t border-line">
                  <td className="py-2 px-4 text-style-label">{day}</td>
                  <td className="py-2 px-4 text-right tnum text-text">
                    {revenue.toLocaleString("uk-UA")}
                  </td>
                  <td
                    className={`py-2 px-4 text-right tnum ${
                      change >= 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {change >= 0 ? "+" : ""}
                    {change}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-style-caption text-subtle mt-2">
          Без <code className="text-style-code">.tnum</code> цифри стрибали б на
          ±2px у пропорційному шрифті.
        </p>
      </Group>

      <Group label="Font weight">
        <div className="flex flex-wrap gap-6">
          {([400, 500, 600, 700, 900] as const).map((w) => (
            <div key={w} className="flex flex-col items-center gap-1">
              <span style={{ fontWeight: w }} className="text-2xl text-text">
                Аа
              </span>
              <span className="text-2xs text-subtle">{w}</span>
            </div>
          ))}
        </div>
      </Group>

      <Group label="SectionHeading — розміри">
        <div className="space-y-2">
          <SectionHeading size="xs">SectionHeading xs — eyebrow</SectionHeading>
          <SectionHeading size="sm">SectionHeading sm — eyebrow</SectionHeading>
          <SectionHeading size="md">SectionHeading md</SectionHeading>
          <SectionHeading size="lg">SectionHeading lg</SectionHeading>
          <SectionHeading size="xl">SectionHeading xl</SectionHeading>
        </div>
      </Group>

      <Group label="SectionHeading — тони" row>
        <SectionHeading size="xs" variant="subtle">
          subtle
        </SectionHeading>
        <SectionHeading size="xs" variant="muted">
          muted
        </SectionHeading>
        <SectionHeading size="xs" variant="text">
          text
        </SectionHeading>
        <SectionHeading size="xs" variant="accent">
          accent
        </SectionHeading>
        <SectionHeading size="xs" variant="finyk">
          finyk
        </SectionHeading>
        <SectionHeading size="xs" variant="fizruk">
          fizruk
        </SectionHeading>
        <SectionHeading size="xs" variant="routine">
          routine
        </SectionHeading>
        <SectionHeading size="xs" variant="nutrition">
          nutrition
        </SectionHeading>
      </Group>
    </Sec>
  );
}
