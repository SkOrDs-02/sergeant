/**
 * Shared prop types for the mobile Fizruk Progress sections.
 *
 * Re-exports the platform-neutral {@link MeasurementPoint} from
 * `@sergeant/fizruk-domain` so section components don't import the
 * domain package directly (keeps the boundary explicit).
 */

export type { MeasurementPoint } from "@sergeant/fizruk-domain/domain";
