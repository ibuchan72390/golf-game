# Golf Game — Design Spec

**Date:** 2026-06-11
**Status:** Approved design, pre-implementation

## Vision

A 100% web-based 3D golf game with realistic physics and a goofy, cartoony art style. Players work through randomly generated and curated courses, earning skill points to upgrade club stats. Built stability-first: deterministic simulation, heavy automated testing, visual snapshot regression, free static hosting.

## Decisions Made During Brainstorming

| Topic | Decision |
|---|---|
| Art direction | Low-poly flat-shaded geometry **with toon outlines** (Monument Valley geometry, Wind Waker linework) |
| Swing input | Two schemes, **player-configurable**: 3-click meter and drag-back & release |
| HUD | Two modes, **player-configurable**: Arcade (full HUD) and Sim (minimal/contextual) |
| Persistence | Local-first (localStorage + export/import); save schema designed so cloud sync can be added later without rework |
| Course content | One pipeline: seeded generator → CourseFile JSON → hand-tuned keepers shipped as "classic" courses |
| Devices | Desktop-first but touch-functional from day one; **iPad Safari is a named target** (primary share audience plays on iPad/MacBook) |
| Multiplayer | Not in v1, but deterministic sim + ShotIntent replay is the explicit foundation for future async challenges and live rooms |
| Hosting | GitHub Pages (static), deployed via GitHub Actions |

## Tech Stack

- **TypeScript + Vite** — build tooling, static output
- **Three.js** — rendering (low-poly meshes, toon outline post-pass, camera rig)
- **Rapier** (`@dimforge/rapier3d-compat`, WASM) — physics; deterministic for a given build
- **Plain DOM** for all UI (no React) — easier deterministic snapshots, responsive layout, and 60fps loop reasoning
- **Vitest** — unit tests; **Playwright** — integration + visual snapshot tests
- **GitHub Actions** — CI/CD; **GitHub Pages** — hosting

No server in v1. Future multiplayer relay would be a small Node service (isomorphic: reuses the sim core for server-side shot validation) hosted separately; the static client stays on Pages.

## Architecture

The load-bearing rule: **the simulation core is pure TypeScript with zero DOM or Three.js imports.** Everything else is a view or adapter around it.

```
input layer ──ShotIntent──▶ sim core ──trajectory/state──▶ render layer
                                │                          ▶ UI layer (DOM)
                                └──────────────────────────▶ persistence
```

### Modules

```
src/
  sim/      # Rapier world, fixed timestep, seeded RNG, club math,
            # shot resolution, lies/hazards, scoring. PURE — no DOM/Three.
  course/   # CourseFile format, seeded generator, difficulty rating
  render/   # Three.js scene build, toon outline pass, camera rig,
            # trajectory playback animation
  input/    # Swing controllers (3-click, drag-back) → ShotIntent
  ui/       # DOM HUD (Arcade + Sim variants), menus, scorecard, settings
  save/     # versioned JSON in localStorage, export/import
  app/      # state machine + game loop wiring it all together
```

### Key contracts

```ts
interface ShotIntent {
  club: ClubId;
  aimDir: number;        // radians, world yaw
  power: number;         // 0..1 of club max
  contactError: number;  // signed, 0 = pure strike; from swing input quality
}

// Steps physics on a fixed timestep until ball rest; deterministic.
resolveShot(state: HoleState, intent: ShotIntent): {
  newState: HoleState;
  trajectory: TrajectorySample[];  // render layer plays this back
}
```

- Same seed + same intent ⇒ identical result on every machine and in CI. This enables exact golden tests and, later, multiplayer shot replay (~30-byte payloads instead of streamed positions).
- Adding a new input scheme touches only `input/`. Adding cloud sync touches only `save/`.

### App state machine

`menu → course-select → hole-intro → aiming → swinging → ball-in-flight → ball-at-rest (⟲ aiming) → hole-done → round-summary (skill points awarded) → menu`

## Gameplay Systems

### Ball physics

Rapier rigid body plus three custom per-step forces: air drag, Magnus lift (spin produces climb/hook/slice), and surface-dependent bounce/roll friction. Surface types — green, fairway, rough, sand — each define restitution and friction (firm fairways release and run; greens check balls with backspin). **Wind is explicitly out of v1**; it is a future difficulty modifier with no structural impact.

### Shot resolution (skill + randomness)

`contactError` (input quality) + club stats + lie modifier → seeded-RNG roll of final dispersion: push/pull angle, distance loss, unwanted sidespin. Clean contact + upgraded club + fairway lie ≈ flies as aimed; sloppy contact + stock club + sand can go anywhere.

### Clubs & progression

Starter bag (8): Driver, 3-Wood, 5-Iron, 7-Iron, 9-Iron, Pitching Wedge, Sand Wedge, Putter.

Per-club stats: **Power** (max carry), **Accuracy** (sweet-spot width in swing UI), **Forgiveness** (mishit penalty falloff), **Spin** (greenside control). Skill points buy +1 stat levels at ramping costs.

Skill points at round end: `basePoints × courseDifficulty × scoreMultiplier`. The generator computes each course's difficulty rating (length, hazard density, green sizes), so good scores on hard courses pay the most. Exact curve tuning happens during implementation, behind unit tests.

### Situational play

| Situation | Behavior |
|---|---|
| Tee / full swing | Standard meter, full club power |
| Rough | 20–35% power loss, widened error roll |
| Sand | Heavy power + error penalty; **mostly negated by Sand Wedge** — club choice is the counterplay |
| Chipping (<~40 yd) | Meter rescales for touch shots |
| Putting | Dedicated mode: rolling physics only, low camera, slope-aware aim line; greens have gentle low-poly slopes that break putts |
| Water / OB | Stroke penalty, drop at entry point |

### Swing schemes (both emit ShotIntent)

- **3-click meter:** click to start, click to set power, click in accuracy zone; miss distance → `contactError`. Works as taps on touch.
- **Drag-back & release:** pull-back distance = power, drag angle fine-tunes aim, release wobble → `contactError`. Naturally touch-first.

### Course generation

Seeded generator routes each hole as a curved corridor (tee → green) over a low-poly heightfield: fairway ribbon, rough margins, bunkers/water at strategic distances, trees as obstacles, sloped green. Par (3/4/5) derives from routing length. Courses are 9 holes in v1 with a sensible par mix; the CourseFile format supports 18. Generator also emits the difficulty rating. Invariants (enforced by tests): hole completable, par in 3–5, no hazard overlaps tee/green, rating in bounds.

**Classic courses = curated generator output.** Generate many seeds, keep the best, hand-tune the CourseFile JSON, ship in repo. Homages to famous real holes (island greens, Road Hole-style doglegs) happen in the hand-tuning step under parody names — real course/tournament names are trademarked; layouts are fine.

### Save data

One profile, versioned JSON: settings (input scheme, HUD mode), skill points, per-club levels, per-course best scores, format version for migration. Export/import as a file for cross-device transfer until cloud sync exists.

## UI / Presentation

- **Arcade HUD:** persistent hole info, distance-to-pin, club selector, minimap, swing meter.
- **Sim HUD:** one floating chip (distance + club); meter/minimap/scorecard slide in contextually.
- Behind-the-ball camera with a rotatable dotted aim arc in both modes.
- All UI is DOM overlay above the canvas — responsive for iPad, snapshot-testable.

## Testing Strategy

1. **Unit (Vitest), sim core:** exact golden shot tests (seed + intent → exact rest coordinates), club/dispersion math, scoring, save migrations, generator invariants across hundreds of seeds.
2. **Determinism guard:** run the same shot twice, hash trajectories, fail on mismatch. Protects test exactness and the multiplayer path against stray `Math.random()` / variable timesteps.
3. **Integration (Playwright):** boot real game with `?seed=` + scripted inputs, play a hole, assert state machine and scorecard.
4. **Visual snapshots (Playwright):**
   - **Dev scenes** in the build: `/dev/physics` (fixed shot intents → landing dispersion render) and `/dev/courses` (grid of generator seeds) — the "experiments" surface.
   - Real screens: menu, aiming view on fixed seed, both HUD modes, scorecard.
   - Each at desktop + iPad viewports.
   - CI renders WebGL via software rasterizer (SwiftShader); **baselines generated in CI only**; small diff threshold for rasterization noise.

## CI/CD

- **PR:** lint, typecheck, unit, integration, visual snapshots. Failed visual diffs uploaded as artifacts.
- **main:** same gates → build → deploy to GitHub Pages.
- **Manual workflow:** re-baseline snapshots when a visual change is intentional.
- Pipeline is built in milestone 1 so every commit is live at a shareable URL.

## Milestones

1. **Walking skeleton** — flat test hole, ball, 3-click swing, physics flight, hole-out detection; CI + Pages deploy live.
2. **Real golf** — generator v1 (par-3s), surfaces/lies, putting mode, scoring, Arcade HUD.
3. **Full round** — 9-hole courses (par 3–5), scorecard, skill points, club upgrades, saves.
4. **Polish + reach** — drag-back input, Sim HUD, settings screen, first curated classic course, basic SFX (ball strike, hole-out), iPad/touch refinement pass.

Each milestone is fully tested before the next begins.

## Out of Scope (v1)

Wind, multiplayer (async or live), cloud sync/accounts, leaderboards, character avatars/animations, sound design beyond basic SFX, real-money anything.
