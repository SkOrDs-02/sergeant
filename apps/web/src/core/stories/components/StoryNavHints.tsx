/**
 * Side-edge gradient hints that reinforce the tap-zone affordance on
 * first view. Non-interactive; `pointer-events: none` keeps them out of
 * the gesture pipeline.
 */
export function StoryNavHints() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-linear-to-r from-black/10 to-transparent"
        data-nav-hint="prev"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-linear-to-l from-black/10 to-transparent"
        aria-hidden
      />
    </>
  );
}
