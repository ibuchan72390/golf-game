# Visual Redesign Notes

A living list of visual/presentation items deferred to the final visual-redesign phase
(see the `visual-redesign-timing` decision: one coherent redesign against the complete
feature set, rather than incremental polish). Functional bugs are fixed as they're found;
items here are specifically about *appearance* and should be folded into the single redesign
handoff so the whole surface gets a consistent art language in one pass.

## Deferred items

### Slope / terrain readability (from 2026-06-13 iPad playtest)
- Players find it hard to read green and fairway slope. Requested treatment: a grid or
  "cross" overlay that deforms with the terrain to make slope direction/steepness legible
  at a glance — most important on the green during putting.
- Redesign should own this as a holistic visual: e.g. a contour/grid overlay on greens,
  possibly slope-shaded coloring or directional arrows, styled to match the final art.
- NOTE: a minimal *functional* slope indicator may be added before the redesign if putting
  feel demands it (tracked separately as a functional fix, not here). This note covers the
  polished, designed version.

### Club distance readout styling
- The fix-now pass adds a basic approximate-carry readout per club (functional). The redesign
  should style this into the club selector / HUD coherently (e.g. distance under each club
  chip, or a yardage band on the swing meter).

### Club selector appearance
- The fix-now pass makes all 8 clubs reachable on mobile (functional). The redesign should
  decide the final selector treatment (scrollable rail vs. radial vs. compact grid) and style.
