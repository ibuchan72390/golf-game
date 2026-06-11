// src/render/scene.ts
import * as THREE from 'three';
import type { Vec3 } from '../sim/types';

export interface GameScene {
  render(): void;
  setBallPosition(p: Vec3): void;
  setAimDir(yaw: number): void;
  /** snap camera behind the ball looking down the aim line */
  frameBall(): void;
  resize(): void;
}

export function createScene(canvas: HTMLCanvasElement, holePos: Vec3): GameScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xaee7f8);
  scene.fog = new THREE.Fog(0xaee7f8, 200, 600);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const sun = new THREE.DirectionalLight(0xfff4d6, 1.4);
  sun.position.set(60, 120, 40);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000),
    new THREE.MeshLambertMaterial({ color: 0x7ec850 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const cup = new THREE.Mesh(
    new THREE.CircleGeometry(0.3, 24),
    new THREE.MeshBasicMaterial({ color: 0x222222 }),
  );
  cup.rotation.x = -Math.PI / 2;
  cup.position.set(holePos.x, 0.01, holePos.z);
  scene.add(cup);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8),
    new THREE.MeshLambertMaterial({ color: 0xeceff1 }),
  );
  pole.position.set(holePos.x, 1.1, holePos.z);
  scene.add(pole);

  const flag = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 0.7, 4),
    new THREE.MeshLambertMaterial({ color: 0xff5252 }),
  );
  flag.rotation.z = -Math.PI / 2;
  flag.position.set(holePos.x + 0.4, 1.9, holePos.z);
  scene.add(flag);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 12), // oversized for visibility — cartoon ball
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
  );
  scene.add(ball);

  const aimLine = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 0.15, 0),
    6,
    0xffffff,
    1,
    0.5,
  );
  scene.add(aimLine);

  let aimYaw = 0;

  const api: GameScene = {
    render: () => renderer.render(scene, camera),
    setBallPosition: (p) => {
      ball.position.set(p.x, Math.max(p.y, 0) + 0.12, p.z);
      aimLine.position.set(p.x, 0.15, p.z);
    },
    setAimDir: (yaw) => {
      aimYaw = yaw;
      aimLine.setDirection(new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw)).normalize());
    },
    frameBall: () => {
      const back = new THREE.Vector3(-Math.sin(aimYaw), 0, Math.cos(aimYaw));
      camera.position.copy(ball.position).addScaledVector(back, 8).add(new THREE.Vector3(0, 3, 0));
      camera.lookAt(ball.position.x + Math.sin(aimYaw) * 20, 0, ball.position.z - Math.cos(aimYaw) * 20);
    },
    resize: () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    },
  };

  api.resize();
  return api;
}
