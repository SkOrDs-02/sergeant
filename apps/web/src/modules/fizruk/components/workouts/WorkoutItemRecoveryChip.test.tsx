// @vitest-environment jsdom
/**
 * Last validated: 2026-11-17
 * Status: Active
 *
 * Чип відновлення в сесії мусить бачити активні позначки травми
 * (ADR-0083). Раніше `recoveryConflictsForWorkoutItem` викликався лише з
 * картою втоми, тож `injury.blocked` тут не ставав `true` ніколи і текст
 * «Позначено біль» був недосяжний (аудит 2026-11-17, §3.4).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { WorkoutItem } from "@sergeant/fizruk-domain";
import type { InjurySiteId } from "@sergeant/fizruk-domain/data";
import { messages } from "@shared/i18n/uk";
import {
  WorkoutItemRecoveryChip,
  summarizeRecoveryChip,
} from "./WorkoutItemRecoveryChip";

afterEach(cleanup);

// Жим лежачи: primary `chest`, зона `shoulder` — тобто плечову позначку
// бачить лише зонна половина перевірки, якій потрібен `exerciseId`.
const bench = {
  id: "item-1",
  exerciseId: "bench_press_barbell",
  nameUk: "Жим лежачи",
  type: "strength",
  musclesPrimary: ["pectoralis_major"],
  musclesSecondary: [],
  sets: [],
} as unknown as WorkoutItem;

const shoulder: ReadonlySet<InjurySiteId> = new Set<InjurySiteId>(["shoulder"]);
const none: ReadonlySet<InjurySiteId> = new Set<InjurySiteId>();

describe("summarizeRecoveryChip", () => {
  it("називає біль, коли активна позначка накриває вправу за зоною", () => {
    expect(summarizeRecoveryChip(bench, {}, shoulder)).toEqual({
      tone: "red",
      label: messages.fizruk.session.injuryPrefix,
    });
  });

  it("мовчить без позначок і без втоми", () => {
    expect(summarizeRecoveryChip(bench, {}, none)).toBeNull();
  });
});

describe("WorkoutItemRecoveryChip", () => {
  it("рендерить чип болю для травмованої зони", () => {
    render(
      <WorkoutItemRecoveryChip it={bench} recBy={{}} injurySites={shoulder} />,
    );
    expect(
      screen.getByText(messages.fizruk.session.injuryPrefix),
    ).toBeInTheDocument();
  });
});
