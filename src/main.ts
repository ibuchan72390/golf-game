// src/main.ts
import './style.css';
import { createScene } from './render/scene';
import { createHud } from './ui/hud';
import { createSettingsPanel } from './ui/settings';
import { renderScorecard } from './ui/scorecard';
import { showMenu, showCourseSelect, showHoleComplete, showRoundSummary, type CuratedEntry } from './ui/menu';
import { Round } from './app/round';
import { type GamePhase } from './app/game';
import { initPhysics } from './sim/shot';
import { ThreeClickMeter } from './input/threeClick';
import { HoldReleaseMeter } from './input/holdRelease';
import { generateCourse } from './course/generate';
import { SURFACE, surfaceAt } from './course/format';
import { loadProfile, saveProfile, type InputScheme } from './save/profile';
import { loadoutFromProfile, awardPoints, buyUpgrade } from './sim/progression';
import { showUpgradeScreen } from './ui/upgrade';
import { renderCourseGallery } from './dev/courses';
import { CURATED_COURSES } from './course/curated';
import type { ClubId, HoleState, ShotIntent } from './sim/types';
import type { CameraMode } from './render/cameraRig';

const CURATED: CuratedEntry[] = CURATED_COURSES;

async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get('dev') === 'courses') {
    renderCourseGallery(document.body);
    return;
  }

  await initPhysics();
  const instant = params.has('instant');
  const canvas = document.querySelector('#game-canvas') as HTMLCanvasElement;
  const hudRoot = document.querySelector('#hud') as HTMLElement;
  const screenRoot = document.createElement('div');
  screenRoot.id = 'screens';
  screenRoot.style.cssText = 'position:fixed;inset:0;z-index:10;';
  document.body.appendChild(screenRoot);
  const scoreStrip = document.createElement('div');
  scoreStrip.id = 'scorestrip';
  scoreStrip.style.cssText =
    'position:fixed;top:54px;left:50%;transform:translateX(-50%);width:min(94vw,560px);pointer-events:none;display:none;z-index:5;';
  document.body.appendChild(scoreStrip);

  let profile = loadProfile(localStorage);
  let loadout = loadoutFromProfile(profile);
  let scheme: InputScheme = profile.settings.inputScheme;

  let round: Round | null = null;
  let active: { update(dt: number): void; teardown(): void } | null = null;

  // Per-hole hooks updated by mountHole; read dynamically by the boot-level __golfTest.
  let holeHooks: {
    getState(): { phase: string; strokes: number; ballPos: { x: number; y: number; z: number }; holedOut: boolean; lie: number; distToPin: number; club: string } | null;
    swing(intent: Partial<ShotIntent>): void;
    placeBall(x: number, z: number): void;
    pin(): { x: number; z: number } | null;
  } | null = null;

  // Set up __golfTest once at boot time; per-hole hooks delegate via holeHooks.
  (window as unknown as Record<string, unknown>).__golfTest = {
    getState: () => holeHooks?.getState() ?? null,
    swing: (intent: Partial<ShotIntent>) => holeHooks?.swing(intent),
    placeBall: (x: number, z: number) => holeHooks?.placeBall(x, z),
    get pin() { return holeHooks?.pin() ?? null; },
    loadHole: (seed: number) => {
      location.search = `?round=${seed}${instant ? '&instant=1' : ''}`;
    },
    roundState: () => {
      const r = round;
      return r
        ? {
            phase: r.phase,
            index: r.index,
            total: r.card.holes.reduce((s, h) => s + (h.strokes ?? 0), 0),
            pars: r.card.holes.map((h) => h.par),
          }
        : null;
    },
    nextHole: () => {
      const r = round;
      if (r && r.phase === 'hole-complete') {
        document.querySelector<HTMLElement>('#hole-next')?.click();
      }
    },
    profileState: () => ({ skillPoints: profile.skillPoints, driverPower: profile.clubLevels.driver.power }),
    grantPoints: (n: number) => {
      profile = { ...profile, skillPoints: profile.skillPoints + n };
      saveProfile(localStorage, profile);
    },
    ready: true,
  };

  function clearScreens() {
    screenRoot.innerHTML = '';
    screenRoot.style.pointerEvents = 'none';
  }
  function screen() {
    screenRoot.style.pointerEvents = 'auto';
    return screenRoot;
  }

  function toMenu() {
    active?.teardown();
    active = null;
    scoreStrip.style.display = 'none';
    showMenu(screen(), {
      onPlay: () => showCourseSelect(screen(), CURATED, startRound),
      onUpgrade: () => openUpgrade(),
      onSettings: () => {
        /* settings panel toggles in-hole; from menu just go back */
        toMenu();
      },
    });
  }

  function openUpgrade() {
    showUpgradeScreen(screen(), profile, {
      onBuy: (club, stat) => {
        const next = buyUpgrade(profile, club, stat);
        if (next) {
          profile = next;
          loadout = loadoutFromProfile(profile);
          saveProfile(localStorage, profile);
          openUpgrade(); // re-render with new balance/levels
        }
      },
      onClose: toMenu,
    });
  }

  function startRound(seed: number) {
    clearScreens();
    scoreStrip.style.display = 'block';
    round = new Round(generateCourse(seed), {
      onStateChange: () => {},
      setBallPosition: () => {},
      setAimDir: () => {},
      frameBall: () => {},
      onLanding: () => {},
      onHoleComplete: (index, _strokes, card) => {
        renderScorecard(scoreStrip, card, -1);
        showHoleComplete(screen(), index, card.holes[index]!.strokes!, card.holes[index]!.par, () => {
          clearScreens();
          round!.nextHole();
          if (round!.phase === 'round-complete') return; // onRoundComplete handles it
          mountCurrentHole();
        });
      },
      onRoundComplete: (card) => {
        scoreStrip.style.display = 'none';
        const avgDifficulty = round!.course.holes.reduce((s, h) => s + h.difficulty, 0) / round!.course.holes.length;
        const rel = card.holes.reduce((s, h) => s + ((h.strokes ?? 0) - h.par), 0);
        const earned = awardPoints(avgDifficulty, rel);
        profile = { ...profile, skillPoints: profile.skillPoints + earned };
        const key = `seed:${round!.course.seed}`;
        const total = card.holes.reduce((s, h) => s + (h.strokes ?? 0), 0);
        if (profile.bestScores[key] === undefined || total < profile.bestScores[key]!) {
          profile = { ...profile, bestScores: { ...profile.bestScores, [key]: total } };
        }
        saveProfile(localStorage, profile);
        showRoundSummary(screen(), card, earned, toMenu);
      },
    }, loadout);
    mountCurrentHole();
  }

  function mountCurrentHole() {
    active?.teardown();
    active = mountHole();
  }

  /**
   * Mounts the in-hole loop against round.game. Returns update+teardown.
   * This body is the M2 main loop: scene/hud/meters/input/camera, but driven by
   * the Round's current Game and reporting hole-out via round.onHoleSettled().
   */
  function mountHole() {
    const game = round!.game;
    const hole = game.hole.hole;
    const scene = createScene(canvas, hole);
    const hud = createHud(hudRoot);
    const threeClick = new ThreeClickMeter();
    const holdRelease = new HoldReleaseMeter();
    const meter = () => (scheme === 'holdRelease' ? holdRelease : threeClick);

    // Re-bind the Game's view to this scene/hud (Round created the Game with
    // app-level passthroughs; here we attach the concrete renderer).
    game.rebindView({
      onStateChange: (phase: GamePhase, h: HoleState, club: ClubId) => hud.update(phase, h, club),
      setBallPosition: (p) => {
        scene.setBallPosition(p);
        if (game.phase === 'flying') scene.trailPush(p);
      },
      setAimDir: (yaw) => scene.setAimDir(yaw),
      frameBall: () => scene.frameBall(),
      onLanding: (p) => scene.markLanding(p),
    });

    const settings = createSettingsPanel(hudRoot, scheme, (next) => {
      scheme = next;
      threeClick.reset();
      holdRelease.reset();
      saveProfile(localStorage, { ...profile, settings: { inputScheme: next } });
      hud.setMeter(0, 'ready', scheme);
    });
    hud.onGear(() => settings.toggle());
    hud.onClubSelect((club) => game.setClub(club));
    game.syncToView(); // re-emit current state to freshly-mounted scene/hud

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

    const clubKeys: Record<string, ClubId> = { '1': 'driver', '2': 'iron7', '3': 'sandWedge', '4': 'putter' };
    let spaceHeld = false;

    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') game.adjustAim(-0.03);
      if (e.key === 'ArrowRight') game.adjustAim(0.03);
      if (e.key === ' ' && !spaceHeld) {
        e.preventDefault();
        spaceHeld = true;
        pressDown();
      }
      const c = clubKeys[e.key];
      if (c) game.setClub(c);
    }

    function onKeyup(e: KeyboardEvent) {
      if (e.key === ' ') {
        spaceHeld = false;
        pressUp();
      }
    }

    function onResize() {
      scene.resize();
    }

    window.addEventListener('keydown', onKeydown);
    window.addEventListener('keyup', onKeyup);
    canvas.addEventListener('pointerdown', pressDown);
    canvas.addEventListener('pointerup', pressUp);
    window.addEventListener('resize', onResize);

    let last = performance.now();
    let raf = 0;
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
      // hole-out detection → tell the Round (once)
      if (game.phase === 'holed' && round!.phase === 'playing') {
        round!.onHoleSettled();
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // Wire per-hole hooks so the boot-level __golfTest can delegate to the current game.
    holeHooks = {
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
      pin: () => ({ x: hole.pin.x, z: hole.pin.z }),
    };

    return {
      update: () => {},
      teardown: () => {
        cancelAnimationFrame(raf);
        scene.dispose();
        holeHooks = null;
        window.removeEventListener('keydown', onKeydown);
        window.removeEventListener('keyup', onKeyup);
        canvas.removeEventListener('pointerdown', pressDown);
        canvas.removeEventListener('pointerup', pressUp);
        window.removeEventListener('resize', onResize);
        settings.destroy();
      },
    };
  }

  toMenu();
  if (params.has('round')) startRound(Number(params.get('round')));
}

void boot();
