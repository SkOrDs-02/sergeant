import { SectionHeading } from "@shared/components/ui";
import { Sec, Group } from "../_shared";

export function TypographySection() {
  return (
    <Sec id="typography" title="Типографіка">
      <Group label="Розміри тексту">
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-4">
            <span className="text-5xl font-semibold text-text">text-5xl</span>
            <span className="text-2xs text-subtle">48px / 1</span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="text-4xl font-semibold text-text">text-4xl</span>
            <span className="text-2xs text-subtle">36px / 40px</span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="text-3xl font-semibold text-text">text-3xl</span>
            <span className="text-2xs text-subtle">30px / 36px</span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="text-2xl font-semibold text-text">text-2xl</span>
            <span className="text-2xs text-subtle">24px / 32px</span>
          </div>
          <div className="flex items-baseline gap-4">
            {/* eslint-disable-next-line sergeant-design/prefer-text-style -- showcase intentionally renders raw text-xl + font-semibold so the demo matches its label */}
            <span className="text-xl font-semibold text-text">text-xl</span>
            <span className="text-2xs text-subtle">20px / 28px</span>
          </div>
          <div className="flex items-baseline gap-4">
            {/* eslint-disable-next-line sergeant-design/prefer-text-style -- showcase intentionally renders raw text-lg + font-semibold so the demo matches its label */}
            <span className="text-lg font-semibold text-text">text-lg</span>
            <span className="text-2xs text-subtle">18px / 28px</span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="text-base font-semibold text-text">text-base</span>
            <span className="text-2xs text-subtle">16px / 24px</span>
          </div>
          <div className="flex items-baseline gap-4">
            {/* eslint-disable-next-line sergeant-design/prefer-text-style -- showcase intentionally renders raw text-sm + font-semibold so the demo matches its label */}
            <span className="text-sm font-semibold text-text">text-sm</span>
            <span className="text-2xs text-subtle">14px / 20px</span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="text-xs font-semibold text-text">text-xs</span>
            <span className="text-2xs text-subtle">12px / 16px</span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="text-2xs font-semibold text-text">text-2xs</span>
            <span className="text-2xs text-subtle">10px / 14px</span>
          </div>
        </div>
      </Group>

      <Group label="Семантичні текстові стилі">
        <div className="space-y-2">
          <div className="flex items-baseline gap-4">
            <span className="text-style-hero text-text">text-style-hero</span>
            <span className="text-2xs text-subtle">
              26 / 32 / 700 / -0.02em
            </span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="text-style-title text-text">text-style-title</span>
            <span className="text-2xs text-subtle">
              20 / 28 / 600 / -0.01em
            </span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="text-style-body text-text">text-style-body</span>
            <span className="text-2xs text-subtle">16 / 24 / 400</span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="text-style-label text-text">text-style-label</span>
            <span className="text-2xs text-subtle">14 / 20 / 500</span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="text-style-caption text-text">
              text-style-caption
            </span>
            <span className="text-2xs text-subtle">12 / 16 / 400</span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="text-style-overline text-text">
              text-style-overline
            </span>
            <span className="text-2xs text-subtle">12 / 16 / 600 / 0.06em</span>
          </div>
        </div>
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
