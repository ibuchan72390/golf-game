import RAPIER from '@dimforge/rapier3d-compat';
import { CLUBS, launchVelocity } from './clubs';
import { createRng } from './rng';
import type { HoleState, ShotIntent, ShotResult, TrajectorySample } from './types';

export const BALL_RADIUS = 0.021;
const TIMESTEP = 1 / 120;
const MAX_STEPS = 120 * 30; // 30 s simulated cap
const SAMPLE_EVERY = 2; // record at 60 Hz
const REST_SPEED = 0.05; // m/s
const REST_STEPS = 60; // must stay slow this many steps (0.5 s)
const CAPTURE_SPEED = 3.0; // m/s — max speed at which the cup grabs the ball

let rapierReady: Promise<unknown> | null = null;

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

  world.createCollider(
    RAPIER.ColliderDesc.cuboid(500, 0.1, 500)
      .setTranslation(0, -0.1, 0)
      .setRestitution(0.4)
      .setFriction(0.8),
  );

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(state.ballPos.x, Math.max(state.ballPos.y, 0) + BALL_RADIUS, state.ballPos.z)
      .setLinearDamping(0.3) // crude air drag + rolling resistance for M1
      .setAngularDamping(2.0)
      .setCcdEnabled(true),
  );
  world.createCollider(
    RAPIER.ColliderDesc.ball(BALL_RADIUS).setRestitution(0.55).setFriction(0.6).setDensity(1100),
    body,
  );

  const rng = createRng(state.seed + state.strokes * 1013);
  const v = launchVelocity(CLUBS[intent.club], intent, rng());
  body.setLinvel(v, true);

  const trajectory: TrajectorySample[] = [];
  let holedOut = false;
  let slowStreak = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    world.step();
    const p = body.translation();
    const vel = body.linvel();
    const speed = Math.hypot(vel.x, vel.y, vel.z);

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
    : { x: final.x, y: Math.max(final.y - BALL_RADIUS, 0), z: final.z };
  trajectory.push({ t: trajectory.length > 0 ? trajectory[trajectory.length - 1]!.t + TIMESTEP : TIMESTEP, pos: restPos });

  world.free();

  return {
    newState: { ...state, ballPos: restPos, strokes: state.strokes + 1, holedOut },
    trajectory,
  };
}
