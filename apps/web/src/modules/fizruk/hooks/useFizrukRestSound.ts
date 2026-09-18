import { useCallback, useEffect, useRef } from "react";
import { hapticPattern } from "@shared/lib/adapters/haptic";

// Legacy Safari (< 14) ships `AudioContext` only as the prefixed
// `webkitAudioContext`. Not in `lib.dom.d.ts`, so we attach it to `Window`
// via module augmentation rather than relying on a double-cast.
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

// Shared AudioContext reused across beeps. Creating/closing one per call
// races with quick successive rest-timer completions and fights iOS' audio
// session. Lazily created on first call (after a user gesture) and kept open
// for the lifetime of the page; browsers GC it on unload.
let sharedAudioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  try {
    if (sharedAudioCtx && sharedAudioCtx.state !== "closed")
      return sharedAudioCtx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    sharedAudioCtx = new Ctor();
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function playRestCompletionSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    // iOS can suspend the context between beeps; resume is a noop if running.
    if (ctx.state === "suspended") void ctx.resume();
    const playBeep = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.18, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    const t = ctx.currentTime;
    playBeep(880, t, 0.15);
    playBeep(1100, t + 0.18, 0.15);
    playBeep(1320, t + 0.36, 0.3);
  } catch {
    /* swallow autoplay/policy errors — beeps are progressive enhancement */
  }
}

function vibrateRestComplete() {
  // Haptic helper respects prefers-reduced-motion and swallows browser
  // throttling errors that raw `navigator.vibrate` does not.
  hapticPattern([200, 100, 200]);
}

export interface RestTimerState {
  remaining: number;
  total: number;
}

/**
 * Plays a three-tone beep + haptic when the rest timer finishes naturally
 * (i.e. counted down to zero on its own, not because the user cancelled).
 *
 * Usage:
 *   const { markCompletedNaturally } = useFizrukRestSound(restTimer);
 *   ...
 *   setRestTimer((r) => {
 *     if (!r || r.remaining <= 1) {
 *       markCompletedNaturally();
 *       return null;
 *     }
 *     return { ...r, remaining: r.remaining - 1 };
 *   });
 *
 * Encapsulates the shared `AudioContext`, iOS Safari `webkitAudioContext`
 * fallback, and the "did the timer hit zero on its own" flag so that
 * cancel-paths (`onCancel={() => setRestTimer(null)}`) don't trigger the
 * completion beep.
 */
export function useFizrukRestSound(restTimer: RestTimerState | null) {
  const completedNaturally = useRef(false);

  useEffect(() => {
    if (restTimer === null && completedNaturally.current) {
      completedNaturally.current = false;
      playRestCompletionSound();
      vibrateRestComplete();
    }
  }, [restTimer]);

  const markCompletedNaturally = useCallback(() => {
    completedNaturally.current = true;
  }, []);

  return { markCompletedNaturally };
}
