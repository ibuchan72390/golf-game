// src/render/scene.ts
import * as THREE from 'three';
import { heightAt, type HoleFile } from '../course/format';
import type { Vec3 } from '../sim/types';
import { buildTerrainMesh, makeGradientMap, outlineShell } from './terrain';
import { BallTrail } from './trail';
import { CameraFollower, cameraGoal, type CameraMode } from './cameraRig';

export interface GameScene {
  render(): void;
  setBallPosition(p: Vec3): void;
  setAimDir(yaw: number): void;
  /** snap camera straight to the current mode's goal (boot / instant mode) */
  frameBall(): void;
  /** damped camera follow toward the mode's goal — call every frame */
  updateCamera(dt: number, mode: CameraMode, velocity: Vec3 | null): void;
  trailPush(p: Vec3): void;
  trailClear(): void;
  markLanding(p: Vec3): void;
  resize(): void;
}

function makeSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#6fc3f0');
  grad.addColorStop(0.7, '#cdeefb');
  grad.addColorStop(1, '#ffe9c2');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1, 256);
  return new THREE.CanvasTexture(canvas);
}

export function createScene(canvas: HTMLCanvasElement, hole: HoleFile): GameScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = makeSkyTexture();
  scene.fog = new THREE.Fog(0xcdeefb, 220, 650);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xfff4d6, 1.5);
  sun.position.set(80, 100, 60);
  scene.add(sun);

  const gradientMap = makeGradientMap();
  scene.add(buildTerrainMesh(hole, gradientMap));

  const pinY = heightAt(hole, hole.pin.x, hole.pin.z);

  const cup = new THREE.Mesh(
    new THREE.CircleGeometry(0.3, 24),
    new THREE.MeshBasicMaterial({ color: 0x222222 }),
  );
  cup.rotation.x = -Math.PI / 2;
  cup.position.set(hole.pin.x, pinY + 0.02, hole.pin.z);
  scene.add(cup);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8),
    new THREE.MeshToonMaterial({ color: 0xeceff1, gradientMap }),
  );
  pole.position.set(hole.pin.x, pinY + 1.1, hole.pin.z);
  const poleOutline = outlineShell(pole, 1.4);
  poleOutline.position.copy(pole.position);
  scene.add(pole, poleOutline);

  const flag = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 0.7, 4),
    new THREE.MeshToonMaterial({ color: 0xff5252, gradientMap }),
  );
  flag.rotation.z = -Math.PI / 2;
  flag.position.set(hole.pin.x + 0.4, pinY + 1.9, hole.pin.z);
  scene.add(flag);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 12),
    new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap }),
  );
  scene.add(ball);
  const ballOutline = outlineShell(ball, 1.15);
  scene.add(ballOutline);

  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
  );
  blob.rotation.x = -Math.PI / 2;
  scene.add(blob);

  // Terrain-following dotted aim line (slope-aware on greens by construction)
  const AIM_POINTS = 24;
  const aimGeo = new THREE.BufferGeometry();
  const aimLine = new THREE.Line(
    aimGeo,
    new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.6, gapSize: 0.4 }),
  );
  scene.add(aimLine);

  const trail = new BallTrail(scene);
  const follower = new CameraFollower({ x: 0, y: 3, z: 8 }, { x: 0, y: 0, z: -20 });

  let aimYaw = 0;
  let ballPos: Vec3 = { ...hole.tee };

  function rebuildAimLine(): void {
    const pts: THREE.Vector3[] = [];
    const reach = 12;
    for (let i = 0; i <= AIM_POINTS; i++) {
      const d = (i / AIM_POINTS) * reach;
      const x = ballPos.x + Math.sin(aimYaw) * d;
      const z = ballPos.z - Math.cos(aimYaw) * d;
      pts.push(new THREE.Vector3(x, heightAt(hole, x, z) + 0.08, z));
    }
    aimGeo.setFromPoints(pts);
    aimLine.computeLineDistances();
  }

  const api: GameScene = {
    render: () => renderer.render(scene, camera),
    setBallPosition: (p) => {
      ballPos = { ...p };
      const groundY = heightAt(hole, p.x, p.z);
      const y = Math.max(p.y, groundY) + 0.12;
      ball.position.set(p.x, y, p.z);
      ballOutline.position.copy(ball.position);
      blob.position.set(p.x, groundY + 0.03, p.z);
      rebuildAimLine();
    },
    setAimDir: (yaw) => {
      aimYaw = yaw;
      rebuildAimLine();
    },
    frameBall: () => follower.snap(cameraGoal('aiming', ball.position, aimYaw, null)),
    updateCamera: (dt, mode, velocity) => {
      trail.update(dt);
      follower.update(dt, cameraGoal(mode, ball.position, aimYaw, velocity));
      camera.position.set(follower.pos.x, follower.pos.y, follower.pos.z);
      camera.lookAt(follower.look.x, follower.look.y, follower.look.z);
    },
    trailPush: (p) => trail.push(p),
    trailClear: () => trail.clear(),
    markLanding: (p) => trail.markLanding(p, heightAt(hole, p.x, p.z)),
    resize: () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    },
  };

  api.resize();
  api.setBallPosition(ballPos);
  return api;
}
