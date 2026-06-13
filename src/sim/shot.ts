import RAPIER from '@dimforge/rapier3d-compat';
import { CLUBS, launchVelocity } from './clubs';
import { createRng } from './rng';
import { heightAt, surfaceAt } from '../course/format';
import type { HoleFile } from '../course/format';
import { strikeModifier } from './lies';
import { AIR_DAMPING, SURFACE_PHYSICS } from './surfaces';
import type { HoleState, ShotIntent, ShotResult, TrajectorySample } from './types';

export const BALL_RADIUS = 0.021;
const TIMESTEP = 1 / 120;
const MAX_STEPS = 120 * 30; // 30 s simulated cap
const SAMPLE_EVERY = 2; // record at 60 Hz
const REST_SPEED = 0.05; // m/s
const REST_STEPS = 60; // must stay slow this many steps (0.5 s)
const CAPTURE_SPEED = 3.0; // m/s — max speed at which the cup grabs the ball
/** High damping applied when grounded and nearly at rest, preventing slope drift. */
const GROUND_DAMPING_SLOW = 15.0;

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
export function resolveShot(state: HoleState, intent: ShotIntent): ShotResult {
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
    const v = launchVelocity(CLUBS[intent.club], adjusted, rng());
    body.setLinvel(v, true);

    const trajectory: TrajectorySample[] = [];
    let holedOut = false;
    let slowStreak = 0;

    for (let step = 0; step < MAX_STEPS; step++) {
      world.step();
      const p = body.translation();
      const vel = body.linvel();
      const speed = Math.hypot(vel.x, vel.y, vel.z);

      const surf = surfaceAt(state.hole, p.x, p.z);
      const grounded = p.y - heightAt(state.hole, p.x, p.z) < BALL_RADIUS * 3;
      body.setLinearDamping(
        grounded
          ? speed < 0.2
            ? GROUND_DAMPING_SLOW
            : SURFACE_PHYSICS[surf].damping
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
