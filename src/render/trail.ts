// src/render/trail.ts
import * as THREE from 'three';
import type { Vec3 } from '../sim/types';

const MAX_POINTS = 90;

export class BallTrail {
  private positions = new Float32Array(MAX_POINTS * 3);
  private count = 0;
  private line: THREE.Line;
  private marker: THREE.Mesh;
  private markerAge = Infinity;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setDrawRange(0, 0);
    this.line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 }),
    );
    this.line.frustumCulled = false; // draw range changes every frame; skip stale bounding-sphere culling
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.35, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    scene.add(this.line, this.marker);
  }

  push(p: Vec3): void {
    if (this.count === MAX_POINTS) {
      this.positions.copyWithin(0, 3);
      this.count--;
    }
    const i = this.count * 3;
    this.positions[i] = p.x;
    this.positions[i + 1] = p.y + 0.12;
    this.positions[i + 2] = p.z;
    this.count++;
    const attr = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
    this.line.geometry.setDrawRange(0, this.count);
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
    this.count = 0;
    this.line.geometry.setDrawRange(0, 0);
  }

  dispose(): void {
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
    this.marker.geometry.dispose();
    (this.marker.material as THREE.Material).dispose();
  }
}
