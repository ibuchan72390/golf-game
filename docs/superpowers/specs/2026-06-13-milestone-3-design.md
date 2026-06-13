# Milestone 3 — Full Rounds & Progression: Design Spec

**Date:** 2026-06-13
**Status:** Approved design, pre-implementation
**Builds on:** `2026-06-11-golf-game-design.md` (master spec), the deployed Milestone 1 (deterministic sim core, CI/Pages) and Milestone 2 (par-3 generator, surfaces/lies, putting, hold-release swing, Arcade HUD, versioned save profile).

## Goals

1. **Full 9-hole rounds** with a running scorecard, played on procedurally generated courses with par-3/4/5 holes (doglegs via multi-segment routing).
2. **Progression:** an 8-club bag with four upgradeable stats per club, skill points earned per round (scaled by difficulty and score), spent on a club-upgrade screen.
3. **One curated course** assembled from the generator, shipped in the repo, loaded through the same path as a random round.

**Sequencing:** the implementation plan must make 9-hole rounds fully playable BEFORE progression layers on, giving a natural mid-milestone checkpoint. Strand order: generator/course → round/scorecard → clubs/progression/upgrade UI.

## Decisions Made During Brainstorming

| Topic | Decision |
|---|---|
| Course content | **Both** (master-spec "C"): random 9-hole generator is the core engine; one curated course shipped from it. More curation is a later pass. |
| Club bag | **Full 8-club bag, per-club stat upgrades** (master-spec design). |
| Progression feel | **Tunable curve, generous default** ("C with B default"): constants in one block, defaulted generous; skill-expression can be dialed up later without rework. |
| Upgrade screen | **List + Detail** layout (club list left, four stat bars + spend on right). |
| Par 4/5 generation | **Multi-segment polyline corridor**: par-3 = 1 segment, par-4 = 2 (one dogleg), par-5 = 3 (up to two doglegs). Reuses M2 corridor/surface/bunker logic per segment. |
| Scope | One spec, sequenced rounds-first. ~18–22 plan tasks. |

## Round Structure (`src/app/round.ts`)

A `Round` wraps the existing single-hole `Game`. It holds:
- the `CourseFile` (its `holes: HoleFile[]` array — M2 already supports many),
- current hole index,
- per-hole stroke tallies and the cumulative scorecard.

When the Game holes out, the Round records the score, advances the index, and feeds the next `HoleFile` to a fresh Game. The Game remains a pure single-hole state machine; the Round is orchestration above it. Nothing in the sim or render layers needs to know rounds exist (keeps Game tests untouched).

**App flow:** `menu → course-select → [hole-intro → play hole → hole-complete card] ×9 → round-summary → menu`. Between holes a compact scorecard shows standing; tap to tee off next. Within a hole, M2 behavior is unchanged.

**Scorecard:** classic 9-column grid (hole #, par, strokes, running total vs par as "+2"/"E"/"-1"). Compact between holes, full at round end. Per-hole flourishes reuse M2 `scoreName` (Ace/Birdie/Par/Bogey…).

## Par 4/5 Generator (`src/course/generate.ts`)

`generateHole(seed, par)` gains a `par` parameter setting segment count:
- **par-3:** 1 straight segment (today's behavior), ~90–180 m.
- **par-4:** 2 segments, one dogleg (left/right from seed), ~270–400 m total.
- **par-5:** 3 segments, up to two doglegs, ~450–550 m total.

Route a tee, then knee points joined by straight corridors turning by a dogleg angle. Total routed length sets the distance; the green sits at the final knee. Fairway-carving, surface-painting, slope-tilted green, and bunker placement run **per-segment** (reusing M2). Bunkers cluster on the inside of bends and guard the green. The heightfield grid is sized to bound the whole polyline (generalizing the M2/hotfix grid-sizing). Out-of-bounds stays rough; water/trees out of scope.

`generateCourse(seed)` returns 9 holes with a fixed par-36 mix — **five par-4s, two par-3s, two par-5s** (4·5 + 3·2 + 5·2 = 36) — shuffled per seed for variety with the constraint that no two par-5s are adjacent. Each hole gets a sub-seed derived from the course seed → fully reproducible, independently regenerable.

**Generator invariants (tested across hundreds of seeds):** every segment playable and connected; green reachable from prior knee; par matches total routed length; no bunker covers a tee or green; dogleg angles within sane bounds; whole polyline fits inside the grid; same seed → identical course.

**Curated course:** once the generator works, generate many seeds, inspect via the dev gallery, pick one strong 9-hole layout, hand-tune its `CourseFile` JSON if needed, commit to the repo as the shipped course (parody name, e.g. "Seagrass Links"). Loads through the identical path as a random round.

## Clubs (`src/sim/clubs.ts`)

`CLUBS` expands 4 → 8: Driver, 3-Wood, 5-Iron, 7-Iron, 9-Iron, Pitching Wedge, Sand Wedge, Putter — distinct base distance and loft each. Sand Wedge takes the bunker-recovery role M2's generic `wedge` held — the M2 club id `wedge` is replaced by `pitchingWedge` and `sandWedge`, and the sand lie modifier keys on `sandWedge` (a club-id migration the plan handles, updating the powerScale chip logic and lie modifier that referenced `wedge`).

**Four upgradeable stats, each a scalar modifier on the M2 shot math:**
- **Power** → club max ball speed (carry distance).
- **Accuracy** → tightens base dispersion cone (the existing `accuracy` field).
- **Forgiveness** → scales down the mishit penalty (a given `contactError` costs less distance and offline drift).
- **Spin** → greenside check: more spin → less roll-out when the ball lands on green ("bites"). Implemented as a roll modifier on green contact (no full Magnus).

**Player-dependent clubs:** because upgrades change behavior, `resolveShot` takes a **loadout** (effective stats = base + upgrade levels) as an explicit input rather than reading a global constant table. The loadout is derived deterministically from the save profile, so the sim stays pure and replay-deterministic (a shot's result depends on the explicit loadout passed in).

## Progression

**Skill points at round end:** `points = base × courseDifficulty × scoreMultiplier`, all constants in one tunable block, defaulted generous. Awarded once per completed round.

**Spending:** the List+Detail upgrade screen; each `+1` to a club stat costs skill points on a gently ramping curve (early levels cheap, later dearer) — boost a favorite club within a few rounds; maxing everything is a long arc. Upgrades are permanent; the screen is reachable from the menu anytime, not only at round end.

## Save Data → Profile v2 (`src/save/profile.ts`)

The versioned profile gains:
- `skillPoints: number`
- `clubLevels: { [clubId]: { power, accuracy, forgiveness, spin } }`
- per-course best scores

A **v1→v2 migration** seeds existing players with zeroed levels and points (and preserves the v1 `settings.inputScheme`). Forward-compatible, as in M2.

## UI (DOM overlays, Arcade style)

- **Menu:** Play, Upgrade Clubs, Settings.
- **Course-select:** Play a Course (curated) / Random Round (seed entry).
- **Scorecard:** 9-hole grid; compact between holes, full at round end.
- **Round summary:** final score vs par, per-hole flourishes, skill points earned with the difficulty/score breakdown (legible reward).
- **Upgrade screen:** List+Detail — club list left, four stat bars + spend buttons right, skill-point balance on top.

## Dev Scene

`?dev=courses` extends to render full 9-hole courses (mixed par, doglegs visible) for eyeballing the generator and picking the curated course.

## Testing

- **Unit:** par-4/5 generator invariants across hundreds of seeds + determinism; 9-hole course assembly (par mix, sub-seed reproducibility); club stat effects on shots (more Power = farther; more Forgiveness = mishits land closer; more Spin = less green roll-out) as deterministic range tests; skill-point award math; upgrade cost curve + that buying a level changes the loadout; profile v1→v2 migration; round scoring and scorecard totals.
- **e2e:** full 9-hole round playthrough on a fixed seed (auto-caddie holes out each hole, scorecard accumulates, round summary shows); upgrade-and-persist flow (earn → spend → reload → levels stick); course-select navigation.
- **Visual snapshots (re-baselined once after merge):** par-5 dogleg aiming view, scorecard, upgrade screen, course-select, extended `/dev/courses` gallery (mixed par) — desktop + iPad each.

## Migration Notes

- `resolveShot` signature gains a `loadout` parameter; existing sim tests pass a default (all-base) loadout. Golden ranges re-pinned once if base-club tuning shifts.
- `generateHole` gains a `par` parameter; par-3 path preserves M2 behavior so existing generator tests pass with `par = 3`.
- `Game` is unchanged in responsibility (one hole); the new `Round` consumes it.

## Out of Scope (M3)

Wind, water/trees/OB, full Magnus ball flight, multiplayer, sound, 18-hole rounds, multiple curated courses (one ships; more is a later pass).
