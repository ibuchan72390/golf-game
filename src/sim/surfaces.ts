// src/sim/surfaces.ts
import { SURFACE, type Surface } from '../course/format';

export interface SurfacePhysics {
  friction: number;
  /** linear damping while the ball is in ground contact */
  damping: number;
}

export const AIR_DAMPING = 0.3;

export const SURFACE_PHYSICS: Record<Surface, SurfacePhysics> = {
  [SURFACE.fairway]: { friction: 0.6, damping: 1.0 },
  [SURFACE.rough]: { friction: 1.2, damping: 2.0 },
  [SURFACE.green]: { friction: 0.40, damping: 0.15 },
  [SURFACE.sand]: { friction: 2.0, damping: 5.0 },
};
