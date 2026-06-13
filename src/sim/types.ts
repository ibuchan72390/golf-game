import type { HoleFile, Surface } from '../course/format';

export type ClubId =
  | 'driver' | 'wood3' | 'iron5' | 'iron7' | 'iron9'
  | 'pitchingWedge' | 'sandWedge' | 'putter';

export interface ClubStats {
  name: string;
  /** ball speed in m/s at power = 1 (Power stat) */
  maxSpeed: number;
  /** launch angle in degrees */
  launchDeg: number;
  /** yaw-dispersion scale in radians; lower = tighter (Accuracy stat) */
  accuracy: number;
  /** 0..1, higher = mishits punished less (Forgiveness stat) */
  forgiveness: number;
  /** 0..1, higher = more greenside check / less roll-out on green (Spin stat) */
  spin: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ShotIntent {
  club: ClubId;
  /** yaw radians; dir = (sin, 0, -cos) so 0 faces -Z */
  aimDir: number;
  /** 0..1 fraction of club max speed */
  power: number;
  /** -1..1, 0 = pure strike; from swing input quality */
  contactError: number;
}

export interface HoleState {
  seed: number;
  ballPos: Vec3;
  holePos: Vec3;
  /** capture radius in meters */
  holeRadius: number;
  strokes: number;
  holedOut: boolean;
  /** terrain this hole is played on */
  hole: HoleFile;
  /** surface under the ball at rest */
  lie: Surface;
}

export interface TrajectorySample {
  /** seconds since strike */
  t: number;
  pos: Vec3;
}

export interface ShotResult {
  newState: HoleState;
  trajectory: TrajectorySample[];
}
