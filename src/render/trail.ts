// src/render/trail.ts
import * as THREE from 'three';
import type { Vec3 } from '../sim/types';

const MAX_POINTS = 90;

export class BallTrail {
  private points: THREE.Vector3[] = [];
  private line: THREE.Line;
  private marker: THREE.Mesh;
  private markerAge = Infinity;

  constructor(scene: THREE.Scene) {
    this.line = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 }),
    );
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.35, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    scene.add(this.line, this.marker);
  }

  push(p: Vec3): void {
    this.points.push(new THREE.Vector3(p.x, p.y + 0.12, p.z));
    if (this.points.length > MAX_POINTS) this.points.shift();
    this.line.geometry.setFromPoints(this.points);
  }

  markLanding(p: Vec3, groundY: number): void {
    this.marker.position.set(p.x, groundY + 0.05, p.z);
    this.markerAge = 0;
  }

  /** fade the landing pulse; call once per frame */
  update(dt: number): void {
    this.markerAge += dt;
    const mat = this.marker.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, 0.8 - this.markerAge * 0.8);
    const s = 1 + this.markerAge * 1.5;
    this.marker.scale.set(s, s, 1);
  }

  clear(): void {
    this.points = [];
    this.line.geometry.setFromPoints([]);
  }
}
