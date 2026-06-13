// src/app/round.ts
import { Game, type GameView } from './game';
import { BASE_LOADOUT } from '../sim/clubs';
import { makeScorecard, recordHole, type Scorecard } from '../sim/scorecard';
import type { CourseFile } from '../course/format';
import type { ClubLoadout } from '../sim/types';

export type RoundPhase = 'playing' | 'hole-complete' | 'round-complete';

/** App-level view: per-hole Game callbacks plus round-level events. */
export interface RoundView extends GameView {
  onHoleComplete(index: number, strokes: number, card: Scorecard): void;
  onRoundComplete(card: Scorecard): void;
}

export class Round {
  phase: RoundPhase = 'playing';
  index = 0;
  card: Scorecard;
  game: Game;

  constructor(
    public readonly course: CourseFile,
    private readonly view: RoundView,
    private readonly loadout: ClubLoadout = BASE_LOADOUT,
  ) {
    this.card = makeScorecard(course.holes.map((h) => h.par));
    this.game = this.makeGame(0);
  }

  private makeGame(index: number): Game {
    const holeFile = this.course.holes[index]!;
    return new Game(this.course.seed * 1000 + index, holeFile, {
      onStateChange: (phase, hole, club) => this.view.onStateChange(phase, hole, club),
      setBallPosition: (p) => this.view.setBallPosition(p),
      setAimDir: (yaw) => this.view.setAimDir(yaw),
      frameBall: () => this.view.frameBall(),
      onLanding: (p) => this.view.onLanding(p),
    }, this.loadout);
  }

  /** The app calls this once it has observed game.phase === 'holed' and finished the celebration. */
  onHoleSettled(): void {
    if (this.phase !== 'playing' || this.game.phase !== 'holed') return;
    this.recordAndComplete(this.game.hole.strokes);
  }

  private recordAndComplete(strokes: number): void {
    this.card = recordHole(this.card, this.index, strokes);
    this.phase = 'hole-complete';
    this.view.onHoleComplete(this.index, strokes, this.card);
  }

  /** Test seam: record a score without driving physics. */
  completeHoleForTest(strokes: number): void {
    if (this.phase !== 'playing') return;
    this.recordAndComplete(strokes);
  }

  nextHole(): void {
    if (this.phase !== 'hole-complete') return;
    if (this.index === this.course.holes.length - 1) {
      this.phase = 'round-complete';
      this.view.onRoundComplete(this.card);
      return;
    }
    this.index += 1;
    this.game = this.makeGame(this.index);
    this.phase = 'playing';
  }
}
