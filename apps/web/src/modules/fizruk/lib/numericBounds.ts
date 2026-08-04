/**
 * Last validated: 2026-08-01
 * Status: Active
 *
 * Стелі для вільних числових полів вправи.
 *
 * Це доменні числа, не тренувальна порада: межі проти друкарської помилки
 * й свідомо абсурдного вводу, які інакше зламали б обʼємні агрегати.
 * Сам клемп — спільний, у `@shared/lib/format/numberInput`.
 */

export const MAX_WEIGHT_KG = 1000;
export const MAX_REPS = 1000;
/** 24 години — довша «вправа» точно не вправа. */
export const MAX_DURATION_SEC = 86_400;
/** 1000 км. */
export const MAX_DISTANCE_M = 1_000_000;
