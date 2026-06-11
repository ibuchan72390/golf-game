// src/main.ts
import './style.css';
import { createScene } from './render/scene';
import { createHud } from './ui/hud';
import { Game, makeFlatHole, type GamePhase } from './app/game';
import { initPhysics } from './sim/shot';
import { ThreeClickMeter } from './input/threeClick';
import type { ClubId, HoleState, ShotIntent } from './sim/types';

async function boot() {
  await initPhysics();

  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed') ?? 42);
  const instant = params.has('instant'); // tests: skip flight animation

  const canvas = document.querySelector('#game-canvas') as HTMLCanvasElement;
  const hudRoot = document.querySelector('#hud') as HTMLElement;

  const holePos = makeFlatHole(seed).holePos;
  const scene = createScene(canvas, holePos);
  const hud = createHud(hudRoot);

  let club: ClubId = 'driver';
  const meter = new ThreeClickMeter();

  const game = new Game(seed, {
    onStateChange: (phase: GamePhase, hole: HoleState) => hud.update(phase, hole, club),
    setBallPosition: (p) => scene.setBallPosition(p),
    setAimDir: (yaw) => scene.setAimDir(yaw),
    frameBall: () => scene.frameBall(),
  });

  const clubKeys: Record<string, ClubId> = { '1': 'driver', '2': 'iron7', '3': 'wedge', '4': 'putter' };

  function pressAction() {
    if (game.phase === 'aiming' && meter.phase === 'idle') {
      meter.begin(performance.now());
      game.setPhase('metering');
    } else if (meter.phase === 'power' || meter.phase === 'accuracy') {
      meter.click(performance.now());
      if ((meter.phase as string) === 'done') {
        const { power, contactError } = meter.result();
        meter.reset();
        hud.setMeter(false, 0);
        game.performSwing({ club, aimDir: game.aimDir, power, contactError });
        if (instant) game.update(60);
      }
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') game.adjustAim(-0.03);
    if (e.key === 'ArrowRight') game.adjustAim(0.03);
    if (e.key === ' ') { e.preventDefault(); pressAction(); }
    const c = clubKeys[e.key];
    if (c && game.phase === 'aiming') { club = c; hud.update(game.phase, game.hole, club); }
  });
  canvas.addEventListener('pointerdown', pressAction);
  window.addEventListener('resize', () => scene.resize());

  let last = performance.now();
  function frame(now: number) {
    const dt = (now - last) / 1000;
    last = now;
    if (meter.phase === 'power' || meter.phase === 'accuracy') {
      hud.setMeter(true, meter.value(now));
    }
    game.update(dt);
    scene.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Deterministic hooks for Playwright — not a public API.
  (window as unknown as Record<string, unknown>).__golfTest = {
    getState: () => ({ phase: game.phase, strokes: game.hole.strokes, ballPos: game.hole.ballPos, holedOut: game.hole.holedOut }),
    swing: (intent: Partial<ShotIntent>) => {
      game.performSwing({
        club: intent.club ?? club,
        aimDir: intent.aimDir ?? game.aimDir,
        power: intent.power ?? 1,
        contactError: intent.contactError ?? 0,
      });
      if (instant) game.update(60);
    },
    ready: true,
  };
}

void boot();
