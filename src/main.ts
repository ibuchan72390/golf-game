// src/main.ts
import './style.css';
import { createScene } from './render/scene';
import { createHud } from './ui/hud';
import { createSettingsPanel } from './ui/settings';
import { Game, type GamePhase } from './app/game';
import { initPhysics } from './sim/shot';
import { ThreeClickMeter } from './input/threeClick';
import { HoldReleaseMeter } from './input/holdRelease';
import { generateHole } from './course/generate';
import { SURFACE, surfaceAt } from './course/format';
import { loadProfile, saveProfile, type InputScheme } from './save/profile';
import { renderCourseGallery } from './dev/courses';
import type { ClubId, HoleState, ShotIntent } from './sim/types';
import type { CameraMode } from './render/cameraRig';

async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get('dev') === 'courses') {
    renderCourseGallery(document.body);
    return;
  }

  await initPhysics();
  const seed = Number(params.get('seed') ?? 42);
  const instant = params.has('instant');

  const canvas = document.querySelector('#game-canvas') as HTMLCanvasElement;
  const hudRoot = document.querySelector('#hud') as HTMLElement;

  const profile = loadProfile(localStorage);
  let scheme: InputScheme = profile.settings.inputScheme;

  const hole = generateHole(seed, 3);
  const scene = createScene(canvas, hole);
  const hud = createHud(hudRoot);

  const threeClick = new ThreeClickMeter();
  const holdRelease = new HoldReleaseMeter();
  const meter = () => (scheme === 'holdRelease' ? holdRelease : threeClick);

  // `let` + definite-assignment: the Game constructor invokes view callbacks
  // synchronously, before the assignment completes — `const game` would throw
  // a TDZ ReferenceError inside setBallPosition. With `let`, the early calls
  // see `undefined` and the optional chain no-ops safely.
  let game!: Game;
  // eslint-disable-next-line prefer-const
  game = new Game(seed, hole, {
    onStateChange: (phase: GamePhase, h: HoleState, club: ClubId) => hud.update(phase, h, club),
    setBallPosition: (p) => {
      scene.setBallPosition(p);
      if ((game as Game | undefined)?.phase === 'flying') scene.trailPush(p);
    },
    setAimDir: (yaw) => scene.setAimDir(yaw),
    frameBall: () => scene.frameBall(),
    onLanding: (p) => scene.markLanding(p),
  });

  const settings = createSettingsPanel(hudRoot, scheme, (next) => {
    scheme = next;
    threeClick.reset();
    holdRelease.reset();
    saveProfile(localStorage, { version: 1, settings: { inputScheme: next } });
    hud.setMeter(0, 'ready', scheme);
  });
  hud.onGear(() => settings.toggle());
  hud.onClubSelect((club) => game.setClub(club));

  function fireSwing(power: number, contactError: number): void {
    scene.trailClear();
    game.performSwing({ club: game.club, aimDir: game.aimDir, power, contactError });
    if (instant) game.update(60);
  }

  function pressDown(): void {
    if (game.phase === 'holed' || game.phase === 'flying') return;
    if (scheme === 'holdRelease') {
      const m = holdRelease;
      if (m.phase === 'idle' && game.phase === 'aiming') {
        m.press(performance.now());
        game.setPhase('metering');
      } else if (m.phase === 'contact') {
        m.tap(performance.now());
        const r = m.result();
        m.reset();
        fireSwing(r.power, r.contactError);
      }
    } else {
      const m = threeClick;
      if (m.phase === 'idle' && game.phase === 'aiming') {
        m.begin(performance.now());
        game.setPhase('metering');
      } else if (m.phase === 'power' || m.phase === 'accuracy') {
        m.click(performance.now());
        if ((m.phase as string) === 'done') {
          const r = m.result();
          m.reset();
          fireSwing(r.power, r.contactError);
        }
      }
    }
  }

  function pressUp(): void {
    if (scheme === 'holdRelease' && holdRelease.phase === 'charging') {
      holdRelease.release(performance.now());
    }
  }

  const clubKeys: Record<string, ClubId> = { '1': 'driver', '2': 'iron7', '3': 'wedge', '4': 'putter' };
  let spaceHeld = false;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') game.adjustAim(-0.03);
    if (e.key === 'ArrowRight') game.adjustAim(0.03);
    if (e.key === ' ' && !spaceHeld) {
      e.preventDefault();
      spaceHeld = true;
      pressDown();
    }
    const c = clubKeys[e.key];
    if (c) game.setClub(c);
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === ' ') {
      spaceHeld = false;
      pressUp();
    }
  });
  canvas.addEventListener('pointerdown', pressDown);
  canvas.addEventListener('pointerup', pressUp);
  window.addEventListener('resize', () => scene.resize());

  let last = performance.now();
  function frame(now: number) {
    const dt = (now - last) / 1000;
    last = now;
    const m = meter();
    hud.setMeter(m.value(now), game.phase === 'flying' ? 'swinging' : m.stage(), scheme);
    game.update(dt);
    const mode: CameraMode =
      game.phase === 'flying'
        ? 'flight'
        : game.hole.lie === SURFACE.green && !game.hole.holedOut
          ? 'putting'
          : 'aiming';
    scene.updateCamera(dt, mode, game.flightVelocity);
    scene.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Deterministic hooks for Playwright — not a public API.
  (window as unknown as Record<string, unknown>).__golfTest = {
    getState: () => ({
      phase: game.phase,
      strokes: game.hole.strokes,
      ballPos: game.hole.ballPos,
      holedOut: game.hole.holedOut,
      lie: game.hole.lie,
      distToPin: game.distToPin(),
      club: game.club,
    }),
    swing: (intent: Partial<ShotIntent>) => {
      threeClick.reset();
      holdRelease.reset();
      hud.setMeter(0, 'ready', scheme);
      game.performSwing({
        club: intent.club ?? game.club,
        aimDir: intent.aimDir ?? game.aimDir,
        power: intent.power ?? 1,
        contactError: intent.contactError ?? 0,
      });
      if (instant) game.update(60);
    },
    placeBall: (x: number, z: number) => {
      game.hole.ballPos = { x, y: 0, z };
      game.hole.lie = surfaceAt(game.hole.hole, x, z);
      game.club = game.hole.lie === SURFACE.green ? 'putter' : game.club;
      game.aimDir = game.aimToHole();
      // sync view + snap camera
      game.setPhase(game.phase);
      // direct view sync:
      scene.setAimDir(game.aimDir);
      scene.setBallPosition(game.hole.ballPos);
      scene.frameBall();
    },
    loadHole: (seed: number) => {
      location.search = `?seed=${seed}${instant ? '&instant=1' : ''}`;
    },
    pin: { x: hole.pin.x, z: hole.pin.z },
    ready: true,
  };
}

void boot();
