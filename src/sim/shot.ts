import RAPIER from '@dimforge/rapier3d-compat';
import { launchVelocity } from './clubs';
import { createRng } from './rng';
import { heightAt, surfaceAt, SURFACE } from '../course/format';
import type { HoleFile } from '../course/format';
import { strikeModifier } from './lies';
import { AIR_DAMPING, SURFACE_PHYSICS } from './surfaces';
import type { ClubLoadout, HoleState, ShotIntent, ShotResult, TrajectorySample } from './types';

/**
 * Cartoon-sized physics ball (matches the rendered ball). A real golf ball
 * (r=0.021) travels ~12 diameters per physics step at drive speed, which
 * tunnels through the thin heightfield collider even with CCD; at r=0.1 the
 * per-step travel is ~1 diameter and collisions resolve reliably.
 */
export const BALL_RADIUS = 0.1;
const TIMESTEP = 1 / 120;
const MAX_STEPS = 120 * 30; // 30 s simulated cap
const SAMPLE_EVERY = 2; // record at 60 Hz
const REST_SPEED = 0.08; // m/s — above the slow-clamp creep equilibrium on the steepest generated slopes
const REST_STEPS = 60; // must stay slow this many steps (0.5 s)
const CAPTURE_SPEED = 3.0; // m/s — max speed at which the cup grabs the ball
/**
 * High damping applied when grounded and nearly at rest, preventing slope drift.
 * Terminal creep speed on a slope is g·slope/damping; 30 keeps it under
 * REST_SPEED for every slope the generator can produce (≤ ~0.2).
 */
const GROUND_DAMPING_SLOW = 30.0;
/** After this many simulated seconds, grounded damping ramps up to force settle. */
const SOFT_SETTLE_S = 10;
/** Past this, any grounded ball is declared at rest (residual motion is jitter). */
const HARD_SETTLE_S = 12;

let rapierReady: Promise<unknown> | null = null;

/**
 * Rapier heightfields are column-major with rows along Z and columns along X,
 * spanning scale.x × scale.z centered on the collider origin.
 * z rows are filled reversed: Rapier's second axis runs opposite our -z convention
 * — pinned by the z-ramp probes below.
 */
function buildTerrainCollider(world: RAPIER.World, hole: HoleFile): void {
  const { width, depth, cellSize } = hole.grid;
  const f32 = new Float32Array((depth + 1) * (width + 1));
  for (let iz = 0; iz <= depth; iz++) {
    for (let ix = 0; ix <= width; ix++) {
      f32[ix * (depth + 1) + (depth - iz)] = hole.heights[iz * (width + 1) + ix]!;
    }
  }
  world.createCollider(
    RAPIER.ColliderDesc.heightfield(depth, width, f32, { x: width * cellSize, y: 1, z: depth * cellSize })
      .setTranslation(0, 0, -(depth * cellSize) / 2)
      .setFriction(0.8)
      .setRestitution(0.4),
  );
}

/** Must resolve before the first resolveShot call (app boot / test beforeAll). */
export function initPhysics(): Promise<unknown> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

/**
 * Deterministically simulate one shot to rest. Fresh Rapier world per call +
 * fixed timestep + seeded RNG ⇒ identical results everywhere, forever.
 */
export function resolveShot(state: HoleState, intent: ShotIntent, loadout: ClubLoadout): ShotResult {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = TIMESTEP;
  try {
    buildTerrainCollider(world, state.hole);

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(
          state.ballPos.x,
          heightAt(state.hole, state.ballPos.x, state.ballPos.z) + BALL_RADIUS,
          state.ballPos.z,
        )
        .setLinearDamping(0.3) // crude air drag + rolling resistance for M1
        .setAngularDamping(2.0)
        .setCcdEnabled(true),
    );
    const ballCollider = world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS).setRestitution(0.55).setFriction(0.6).setDensity(1100),
      body,
    );

    const rng = createRng(state.seed + state.strokes * 1013);
    const lieAtStrike = surfaceAt(state.hole, state.ballPos.x, state.ballPos.z);
    // RNG draw order is load-bearing for determinism: lie roll MUST precede launch wobble.
    const mod = strikeModifier(lieAtStrike, intent.club, rng());
    const adjusted: ShotIntent = {
      ...intent,
      power: intent.power * mod.powerMul,
      contactError: Math.max(-1, Math.min(1, intent.contactError * mod.errorMul)),
    };
    const v = launchVelocity(loadout[intent.club], adjusted, rng());
    body.setLinvel(v, true);

    const trajectory: TrajectorySample[] = [];
    let holedOut = false;
    let slowStreak = 0;
    const shotSpin = loadout[intent.club].spin; // 0..0.95

    for (let step = 0; step < MAX_STEPS; step++) {
      world.step();
      let p = body.translation();
      // Tunnel backstop: a full-speed landing moves ~12 ball diameters per step,
      // and Rapier's CCD does not reliably catch the thin heightfield — without
      // this the ball passes through the terrain and sinks until the sim cap.
      // The 0.25 m threshold means "clearly tunneled": the triangulated collider
      // can legitimately sit a few cm below the bilinear heightAt mid-cell, and a
      // hair-trigger here would teleport-loop a ball resting in such a dimple.
      // Deterministic (pure function of state), so replay guarantees hold.
      // Off-grid boundary stop: the heightfield collider ends at the grid edge;
      // a ball that leaves it would fall into the void forever. The generator
      // sizes grids so normal shots stay inside — this is the safety net for
      // extreme outliers. The ball simply stops at the boundary.
      const half = (state.hole.grid.width * state.hole.grid.cellSize) / 2;
      const zMin = -state.hole.grid.depth * state.hole.grid.cellSize;
      if (Math.abs(p.x) > half - 0.5 || p.z > -0.5 || p.z < zMin + 0.5) {
        const cx = Math.max(-half + 0.5, Math.min(half - 0.5, p.x));
        const cz = Math.max(zMin + 0.5, Math.min(-0.5, p.z));
        body.setTranslation({ x: cx, y: heightAt(state.hole, cx, cz) + BALL_RADIUS, z: cz }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        break;
      }
      const groundY = heightAt(state.hole, p.x, p.z);
      if (p.y < groundY - 0.25) {
        // Fires transiently on hard landings (~1 frame, recovered next step;
        // invisible — the renderer clamps to ground). Fully dissipative
        // (velocity killed) so it can never feed an energy loop; the cartoon
        // ball radius keeps penetration shallow and never sustained.
        body.setTranslation({ x: p.x, y: groundY + BALL_RADIUS, z: p.z }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        p = body.translation();
      }
      const vel = body.linvel();
      const speed = Math.hypot(vel.x, vel.y, vel.z);

      const surf = surfaceAt(state.hole, p.x, p.z);
      // Margin is generous because heightAt is bilinear while the collider is
      // triangulated — mid-cell they disagree by a few cm on noisy terrain, and
      // a tight margin flickers `grounded`, re-applying air damping during rolls.
      const grounded = p.y - heightAt(state.hole, p.x, p.z) < 0.15;
      // Soft settle ramp: past SOFT_SETTLE_S a grounded ball gets progressively
      // heavier damping, so the ~1-in-8 long rolls down sustained slopes wind
      // down within a bounded, deterministic time instead of running to the
      // 30 s cap. The accelerated playback tail hides this from the player.
      const settleRamp =
        step > SOFT_SETTLE_S * 120 ? (step / 120 - SOFT_SETTLE_S) * 5 : 0;
      // Settling-friction gate: a ball rolling below this speed gets heavy
      // damping so it stops promptly instead of creeping at terminal velocity
      // down a moderate slope forever. Off the green the gate is high (long
      // grass grabs a slow ball); on the green it stays low so lag putts keep
      // their delicate roll-out.
      const settleGate = surf === SURFACE.green ? 0.2 : 0.6;
      const greenBite = surf === SURFACE.green ? 1 + shotSpin * 2.5 : 1; // spin → extra check
      body.setLinearDamping(
        grounded
          ? Math.max(
              (speed < settleGate ? GROUND_DAMPING_SLOW : SURFACE_PHYSICS[surf].damping) * greenBite,
              settleRamp,
            )
          : AIR_DAMPING,
      );
      if (grounded) {
        ballCollider.setFriction(SURFACE_PHYSICS[surf].friction);
      }

      if (step % SAMPLE_EVERY === 0) {
        trajectory.push({ t: (step + 1) * TIMESTEP, pos: { x: p.x, y: p.y, z: p.z } });
      }

      const distToHole = Math.hypot(p.x - state.holePos.x, p.z - state.holePos.z);
      if (distToHole < state.holeRadius && speed < CAPTURE_SPEED) {
        holedOut = true;
        break;
      }

      slowStreak = speed < REST_SPEED ? slowStreak + 1 : 0;
      if (slowStreak >= REST_STEPS) break;
      // Hard settle: in rare pathological cells (bilinear/triangle disagreement)
      // the ball jitters at terminal fall speed forever and the speed criterion
      // is unreachable. Any grounded ball this late is visually at rest — end it
      // deterministically rather than running to the 30 s cap.
      if (grounded && step >= HARD_SETTLE_S * 120) break;
    }

    const final = body.translation();
    const restPos = holedOut
      ? { ...state.holePos }
      : { x: final.x, y: final.y - BALL_RADIUS, z: final.z };
    trajectory.push({ t: trajectory.length > 0 ? trajectory[trajectory.length - 1]!.t + TIMESTEP : TIMESTEP, pos: restPos });

    return {
      newState: {
        ...state,
        ballPos: restPos,
        strokes: state.strokes + 1,
        holedOut,
        lie: surfaceAt(state.hole, restPos.x, restPos.z),
      },
      trajectory,
    };
  } finally {
    world.free();
  }
}
