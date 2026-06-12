# Milestone 2 — Real Golf: Design Spec

**Date:** 2026-06-12
**Status:** Approved design, pre-implementation
**Builds on:** `2026-06-11-golf-game-design.md` (master spec) and the deployed Milestone 1 walking skeleton.

## Goals

1. **Real golf content:** procedurally generated par-3 holes with terrain surfaces, lie penalties, putting mode, and per-hole scoring.
2. **Fix the clunk (user-reported):** the swing required an invisible "arming" click; the camera sat still while the ball flew away; transitions were teleports. M2 replaces the default swing input, adds always-visible swing prompts, and gives the camera flight/settle behavior.
3. **Look like the game we designed:** toon shading, outlines, sky/light pass, Arcade HUD v1.

## Decisions Made During Brainstorming

| Topic | Decision |
|---|---|
| Default swing input | **Hold & Release** (press → power fills; release → locks; tap the contact bar → contactError). 3-click moves behind a settings toggle. |
| Swing affordance | Always-visible meter + pulsing stage prompts for BOTH schemes ("HOLD TO CHARGE" → "RELEASE TO SET POWER" → "TAP THE GREEN BAND"; 3-click gets equivalents). |
| Graphics experiments | Toon outlines + sky/light pass; flight camera + ball trail; Arcade HUD v1. (Hit-feedback/celebrations deferred.) |
| Terrain representation | **Heightfield grid + surface map** (Rapier native heightfield collider; grid lookup for surfaces; renderer meshes the same grid). Spline corridors deferred. |
| Outline technique | **Inverted-hull shells + MeshToonMaterial** (no post-processing; iPad-friendly; snapshot-stable). Terrain gets no hull — flat-shaded facets + surface color borders carry the look. |
| Shadows | No shadow maps in M2 (perf + snapshot stability); dark blob under ball. |
| Minimap | Deferred to M3 (par-3s fit one screen). |
| Settings | Minimal gear-button panel, one setting: input scheme. Persisted via versioned localStorage profile (the M3 progression foundation). |
| Dev scenes | `/dev/courses` gallery ships in M2 (`?dev=courses`); `/dev/physics` deferred. |

## CourseFile v1 (the load-bearing contract)

```ts
type Surface = 0 | 1 | 2 | 3; // fairway, rough, green, sand

interface CourseFile {
  version: 1;
  name: string;
  seed: number;        // generator seed that produced it
  holes: HoleFile[];   // M2: exactly one par-3 per file
}

interface HoleFile {
  par: 3 | 4 | 5;      // M2 generator emits only 3
  grid: { width: number; depth: number; cellSize: number }; // sized by generator: width ≈ 60 m, depth = hole length + 40 m margin, cellSize 1 m
  heights: number[];   // row-major, meters
  surfaces: Surface[]; // row-major, parallel to heights
  tee: Vec3;
  pin: Vec3;
  difficulty: number;  // 0..1, computed by generator
}
```

Generator output, sim input, render input, and future hand-tuned classics all share this format. It must remain JSON-serializable and deterministic (same seed → byte-identical file).

## Generator v1 (`src/course/`)

Seeded and pure. Par-3s, 90–180 m tee-to-pin:
1. Place tee near one end, pin near the other (distance drawn from seeded RNG).
2. Terrain: gentle value-noise undulation (RNG-derived), low-poly amplitude.
3. Green: slightly sloped disc around the pin.
4. Fairway: path tee→green; rough elsewhere.
5. Bunkers: 1–3 discs guarding the green at strategic angles.
6. Difficulty: function of length, bunker coverage, green size.

**Invariants (enforced by tests across hundreds of seeds):** tee and pin on non-sand walkable surface; pin on green; no sand under tee/pin; difficulty ∈ [0,1]; heights bounded; same seed → identical output.

## Sim Changes (`src/sim/`)

- `resolveShot` builds a **Rapier heightfield collider** from `HoleFile.heights` (replaces the flat cuboid).
- `HoleState` gains `hole: HoleFile` (terrain reference) and `lie: Surface` (surface under ball at rest).
- **Strike modifiers** (applied to the launch velocity before physics):
  - Rough: 20–35% power loss (RNG roll) + widened contactError.
  - Sand: heavy power and error penalty; **mostly negated when `club === 'wedge'`** (the wedge doubles as sand wedge until M3 expands the bag).
  - Fairway/green/tee: none.
- **Roll behavior:** per-surface friction/restitution on contact — green: slow, true; fairway: releases; rough: kills roll; sand: stops dead. (Implementation note: surface-dependent contact response on a single heightfield collider requires per-step friction adjustment from the ball's grid cell — the sim already steps manually, so it can update ball-collider friction per step.)
- Determinism guarantees unchanged: fresh world per shot, fixed timestep, all randomness from the seeded RNG keyed off `seed + strokes`.

## Putting & Chipping

- Ball at rest on green → club auto-switches to putter; meter power rescales (full bar ≈ 15 m of roll); camera drops to low putting framing; **slope-aware aim line** renders the sampled terrain gradient along the aim direction.
- Off-green inside ~40 m → chip mode: same meter-rescale mechanism, wedge suggested.
- Mode selection is automatic but overridable via club selection (except: putter power scale always applies when putter selected).

## Scoring (per hole)

Strokes vs par at hole-done with classic names (ace/eagle/birdie/par/bogey/double+). Round scorecards are M3.

## Input (`src/input/`)

- **`HoldReleaseMeter`** (new default): press → power 0→1 over ~1.2 s, holds at max; release → locks power, contact bar sweeps; tap → contactError = signed offset from band center, clamped [-1,1]. Emits the same `{power, contactError}` as `ThreeClickMeter`.
- Both meters drive a shared **prompt state** the HUD renders: always-visible meter (dimmed when idle) + stage prompt text.
- Scheme selected via settings; stored in profile.

## Save (`src/save/`)

Versioned localStorage profile: `{ version: 1, settings: { inputScheme: 'holdRelease' | 'threeClick' } }`. Missing/corrupt profile → defaults (treated as migration from v0). M3 adds progression fields to this object.

## Camera (`src/render/`)

Camera rig states: **aiming** (current behind-ball framing) → **flight** (damped chase with velocity look-ahead, never outruns ball) → **settle** (eased transition to new aiming framing — no teleport cuts). Putting uses a lower aiming pose.

## Visuals (`src/render/`)

- `MeshToonMaterial` + 3-step gradient map on ball, flag/pin, bunker lips; terrain uses flat-shaded vertex-colored low-poly mesh built from the heightfield (surface enum → color).
- Inverted-hull black outline shells on ball and flag/pin (not terrain).
- Sky: vertical gradient (warm horizon). No shadow maps; dark blob under ball.
- **Ball trail:** fading white ribbon from recent flight positions, cleared at rest; landing marker pulse at first touchdown.

## HUD — Arcade v1 (`src/ui/`)

Restyled chip system (chunky, rounded, consistent palette): strokes vs par, distance-to-pin, **lie indicator**, tappable club selector (keys 1–4 still work), new meter visuals + prompt text, hole-done score callout, gear button → settings panel.

## Dev Scene

`?dev=courses` renders a 12-seed gallery of top-down hole views (terrain colors, tee/pin markers, difficulty values). Manual QA surface + visual snapshot target.

## Testing

- **Unit:** generator invariants (hundreds of seeds) + generator determinism; strike modifiers (fairway vs rough distance; sand with/without wedge); per-surface roll distances; putting/chip meter rescale; HoldReleaseMeter state machine; save round-trip + v0→v1 migration; re-pinned golden determinism tests on heightfield terrain.
- **e2e:** playthrough on a fixed generated par-3 (auto-caddie aims at pin, adapts power to lie); swing prompts visible and stage-correct; settings toggle switches scheme and persists across reload.
- **Visual snapshots (re-baselined once after merge):** aiming view on fixed generated hole, putting view, `/dev/courses` gallery — desktop + iPad each.
- `__golfTest` gains `loadHole(seed)`.

## Migration Notes

- M1 flat-hole unit tests keep passing via a `flatHoleFile()` fixture (flat heightfield). Golden numbers re-pinned once (cell interpolation may shift them slightly); the determinism guard stays exact.
- `makeFlatHole` becomes a test fixture; the game boots into a generated course (default seed from URL as today).

## Out of Scope (M2)

Wind, 9-hole rounds/scorecards, skill points/club upgrades, minimap, drag-back input, hit-feedback celebrations, shadow maps, `/dev/physics`, sound, par-4/5 generation, trees/water/OB.
