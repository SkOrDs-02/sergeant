import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { hapticTap } from "@shared/lib/adapters/haptic";

/* -------------------------------------------------------------------------- *
 *  Confirm chip — 3-сек preview/undo після успішного STT.
 * -------------------------------------------------------------------------- */

const VOICE_CONFIRM_MS = 3000;
const CHIP_WIDTH = 288;
const CHIP_VIEWPORT_MARGIN = 8;
// Висота чипа динамічна (1–2 рядки тексту), але для розрахунку «вгору vs
// вниз» нам достатньо консервативної оцінки: один рядок ≈ 56px,
// два рядки ≈ 72px. Беремо більшу — краще трохи зайнятого простору
// зверху, ніж чип, який вилазить за нижній край в'юпорта.
const CHIP_HEIGHT_ESTIMATE = 72;

export interface PendingVoiceChipProps {
  text: string;
  anchorRect: DOMRect;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PendingVoiceChip({
  text,
  anchorRect,
  onConfirm,
  onCancel,
}: PendingVoiceChipProps) {
  const [progress, setProgress] = useState(1);
  const startedAtRef = useRef<number>(Date.now());
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    startedAtRef.current = Date.now();
    let raf = 0;
    const tick = () => {
      const elapsed = Date.now() - startedAtRef.current;
      const remaining = Math.max(0, VOICE_CONFIRM_MS - elapsed);
      setProgress(remaining / VOICE_CONFIRM_MS);
      if (remaining <= 0) {
        onConfirmRef.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Escape — швидкий вихід без збереження. Особливо важливо на десктопі,
  // де керування з клавіатури дешевше за тач-цілі.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Позиціонування фіксоване відносно в'юпорта: пробуємо знизу від
  // кнопки; якщо не вліз — піднімаємо вгору. Горизонтально центруємо
  // по кнопці, але клампимо у в'юпорт.
  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;
  const spaceBelow = vh - anchorRect.bottom;
  const placeAbove = spaceBelow < CHIP_HEIGHT_ESTIMATE + CHIP_VIEWPORT_MARGIN;
  const top = placeAbove
    ? Math.max(
        CHIP_VIEWPORT_MARGIN,
        anchorRect.top - CHIP_HEIGHT_ESTIMATE - CHIP_VIEWPORT_MARGIN,
      )
    : Math.min(
        vh - CHIP_HEIGHT_ESTIMATE - CHIP_VIEWPORT_MARGIN,
        anchorRect.bottom + CHIP_VIEWPORT_MARGIN,
      );
  const rawLeft = anchorRect.left + anchorRect.width / 2 - CHIP_WIDTH / 2;
  const left = Math.max(
    CHIP_VIEWPORT_MARGIN,
    Math.min(vw - CHIP_WIDTH - CHIP_VIEWPORT_MARGIN, rawLeft),
  );

  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const secondsLeft = Math.ceil(progress * (VOICE_CONFIRM_MS / 1000));

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Підтвердження голосового вводу"
      style={{
        position: "fixed",
        top,
        left,
        width: CHIP_WIDTH,
        zIndex: 9999,
      }}
      className="rounded-2xl bg-panel/95 backdrop-blur-sm border border-line shadow-xl px-3 py-2 flex items-center gap-2 motion-safe:animate-fade-in"
    >
      {/* Countdown ring + remaining seconds.  Ring fills counter-clockwise
          so the visual "drains" toward zero. */}
      <div className="relative w-7 h-7 shrink-0" aria-hidden>
        <svg viewBox="0 0 24 24" className="w-7 h-7 -rotate-90">
          <circle
            cx="12"
            cy="12"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-line"
          />
          <circle
            cx="12"
            cy="12"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-brand"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: circumference * (1 - progress),
              transition: "stroke-dashoffset 80ms linear",
            }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-micro font-semibold text-text tabular-nums">
          {secondsLeft}
        </span>
      </div>

      {/* Tapping the transcript = "save now". The button is the largest
          touch target in the chip on purpose — the most likely action is
          "looks right, just commit it without waiting". */}
      <button
        type="button"
        onClick={() => {
          hapticTap();
          onConfirm();
        }}
        className="flex-1 min-w-0 text-left text-xs leading-tight text-text hover:text-brand-strong line-clamp-2"
        title="Зберегти зараз"
      >
        {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift */}
        <span className="block text-micro uppercase tracking-wide text-subtle">
          Голос
        </span>
        <span className="block">{text}</span>
      </button>

      <button
        type="button"
        onClick={() => {
          hapticTap();
          onCancel();
        }}
        className="shrink-0 w-7 h-7 rounded-full bg-line/30 text-muted hover:text-error hover:bg-error/15 flex items-center justify-center [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]"
        aria-label="Скасувати"
        title="Скасувати"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}
