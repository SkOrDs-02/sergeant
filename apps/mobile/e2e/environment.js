/**
 * Detox-provided Jest environment. Declared as a separate module so
 * `jest.config.js` can reference it by path; keeps the config JSON-safe.
 */
// Detox 20.x moved `SpecReporter` and `WorkerAssignReporter` from the
// top-level `detox/runners/jest` index into a `testEnvironment/listeners`
// sub-index. Importing them from the old path silently destructures to
// `undefined`, which then trips `Listener is not a constructor` inside
// `registerListeners({ … })` — that's exactly the failure mode CI has
// been hitting on every Detox (Android) / Detox (iOS) run.
//
// `DetoxCircusEnvironment` is still exported from the top-level index.
const { DetoxCircusEnvironment } = require("detox/runners/jest");
const {
  SpecReporter,
  WorkerAssignReporter,
} = require("detox/runners/jest/testEnvironment/listeners");

class CustomDetoxEnvironment extends DetoxCircusEnvironment {
  constructor(config, context) {
    super(config, context);
    // Matches the default Detox stream reporter layout. We keep it
    // explicit so future plug-ins (coverage, flakiness tracker) can be
    // appended without grep-replacing `jest.config.js`.
    this.initTimeout = 300_000;
    this.registerListeners({
      SpecReporter,
      WorkerAssignReporter,
    });
  }
}

module.exports = CustomDetoxEnvironment;
