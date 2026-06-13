# Mobile Playability Pass — Design Spec

**Date:** 2026-06-13
**Status:** Approved design, pre-implementation
**Builds on:** shipped M1/M2/M3 (Three.js + Rapier, deterministic sim core, Arcade HUD, 8-club bag + loadout, putting mode).
**Source:** real iPad playtest feedback (2026-06-13).

## Goals

Three functional playability fixes surfaced by playing on the iPad. No visual-design work — the *appearance* of these elements is owned by the later visual redesign; this pass only makes the game **playable on touch** and gives players the **information** to make decisions.

The fourth playtest item — green/fairway slope readability — is deferred ENTIRELY to the visual redesign (recorded in `docs/superpowers/redesign-notes.md`), with no interim stopgap, by user decision.

## Why these are functional (not visual)

- **Touch aiming** and **club reachability** are hard blockers on the primary device (iPad, shared with the user's dad): you currently cannot re-aim or select the putter on touch, so you cannot play a hole properly.
- **Club distance** is an information gap: without approximate carry per club you cannot choose a club or judge power — you are guessing blind.

These slipped through because the iPad e2e project drives the game via the `__golfTest` hooks, never exercising real touch input or the overflowing club row. This pass adds DOM-level interaction tests to close that gap.

## Decisions Made During Brainstorming

| Topic | Decision |
|---|---|
| Touch aiming scheme | **On-screen ◄ ► arrow buttons** in the HUD (mirror keyboard ←/→), not drag-to-aim or tap-the-ground (those collide with the tap-to-swing input model). |
| Slope readability (#4) | **Deferred entirely** to the visual redesign — no interim functional stopgap. |
| Distance readout source | Pure `approxCarry` helper from effective loadout stats (rises with Power upgrades); styling deferred to redesign. |
| Club selector fix | `flex-wrap` so all 8 clubs are always visible/tappable; not a scroll rail. |

## 1. Club distance readout

- A pure helper (`src/sim/`, no DOM/Three/Math.random) `approxCarry(club: ClubStats): number` estimates full-power carry on a flat fairway from the club's `maxSpeed` and `launchDeg`, using a projectile-range approximation with a single calibration constant accounting for the sim's drag.
- Because the HUD passes the club's **effective** stats (from the current loadout), the displayed carry increases when the player upgrades Power.
- The Arcade HUD club selector shows the approximate carry on each full-swing club button (e.g. `7 Iron · ≈130 m`). The putter shows no carry (it uses the putt power-scale, not carry).
- **Trust requirement:** a unit test asserts `approxCarry(club)` is within ~15% of the actual rest distance produced by `resolveShot` at full power on a flat fairway, for each full-swing club at base loadout. If calibration can't hit 15% for all clubs with one constant, a small per-club factor is acceptable — the test defines "trustworthy."

## 2. Touch aiming (on-screen arrows)

- Two HUD buttons, `#aim-left` (◄) and `#aim-right` (►), with `pointer-events:auto` and pointer-event propagation stopped so they never trigger the canvas swing input.
- Shown only during the `aiming` phase; hidden/disabled during `metering`, `flying`, `holed`.
- Press-and-hold rotates aim continuously: on pointerdown, start a repeat loop (rAF or interval) calling the existing `game.adjustAim(±AIM_STEP)`; on pointerup / pointerleave / pointercancel, stop. A single tap nudges once.
- The existing keyboard ←/→ path is unchanged (desktop unaffected).
- Positioned in comfortable thumb range and clear of the club row and swing meter at mobile widths.

## 3. Club selector reachability

- The club row (`#hud-clubs` in `src/ui/hud.ts`) changes from a single overflowing flex row to `flex-wrap: wrap`, so all 8 club chips are always on-screen and tappable (≈two rows at narrow widths). No horizontal scroll, no hidden clubs.
- Verified reachable (including the putter) at the iPad viewport (1024×768) and a narrow phone width.

## Architecture / boundaries

- `approxCarry` lives in the pure sim layer; it has no side effects and is independently testable.
- The aim-arrow control and the wrapped selector are HUD concerns in `src/ui/hud.ts` (plus a tiny wiring change in `src/main.ts` to bind the aim buttons to `game.adjustAim`, mirroring the keyboard handler). The Game/sim are untouched except for consuming `approxCarry` for display.
- Determinism and physics are unchanged.

## Testing

- **Unit:** `approxCarry` calibration test (within ~15% of `resolveShot` carry per full-swing club at base loadout); `approxCarry` rises with Power-upgraded effective stats.
- **e2e (real DOM, the gap-closer):** the `__golfTest.getState()` hook gains an `aimDir` field (small additive change to `src/main.ts`) so the test can assert aim changed. At the iPad viewport with `hasTouch`: tap `#aim-right`, assert `aimDir` changed; tap the putter chip, assert it became the active club (`getState().club === 'putter'`), proving reachability in the wrapped layout. A desktop test confirms keyboard ←/→ still changes `aimDir`.
- **Visual snapshots:** re-baselined (the HUD gains the aim arrows, per-club distances, and a wrapped club row) — aiming view + any HUD-bearing snapshot, desktop + iPad. Same self-activating gate + re-baseline-after-merge flow as prior milestones.

## Out of scope

The slope/green readability overlay (deferred to redesign), any restyling of the HUD/selector/readout (redesign), drag-to-aim or tap-to-aim schemes, and any change to the swing input model.
