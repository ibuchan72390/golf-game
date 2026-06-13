// src/dev/courses.ts
import { generateCourse } from '../course/generate';
import type { HoleFile, Surface } from '../course/format';

const CSS_COLORS: Record<Surface, string> = { 0: '#7ec850', 1: '#4f7a33', 2: '#9fdc6a', 3: '#e8d28a' };

function drawHole(hole: HoleFile, px: number): HTMLCanvasElement {
  const { width, depth, cellSize } = hole.grid;
  const canvas = document.createElement('canvas');
  canvas.width = width * px;
  canvas.height = depth * px;
  const ctx = canvas.getContext('2d')!;
  for (let iz = 0; iz < depth; iz++) {
    for (let ix = 0; ix < width; ix++) {
      ctx.fillStyle = CSS_COLORS[hole.surfaces[iz * width + ix]!];
      ctx.fillRect(ix * px, iz * px, px, px);
    }
  }
  const dot = (x: number, z: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc((x / cellSize + width / 2) * px, (-z / cellSize) * px, 3, 0, Math.PI * 2);
    ctx.fill();
  };
  dot(hole.tee.x, hole.tee.z, '#ffffff');
  dot(hole.pin.x, hole.pin.z, '#ef5350');
  return canvas;
}

export function renderCourseGallery(root: HTMLElement, seeds = [1, 2, 3, 4]): void {
  root.innerHTML = '';
  root.style.cssText = 'background:#263238;min-height:100vh;padding:16px;';
  for (const seed of seeds) {
    const course = generateCourse(seed);
    const rowWrap = document.createElement('div');
    rowWrap.style.cssText = 'margin-bottom:18px;';
    const label = document.createElement('div');
    label.textContent = `course ${seed} · par ${course.holes.reduce((s, h) => s + h.par, 0)}`;
    label.style.cssText = 'color:#eceff1;font:13px system-ui;margin-bottom:6px;';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;align-items:flex-start;overflow-x:auto;';
    course.holes.forEach((h, i) => {
      const cell = document.createElement('div');
      const c = drawHole(h, 1);
      c.style.cssText = 'width:70px;height:auto;image-rendering:pixelated;border:1px solid #455a64;';
      const cap = document.createElement('div');
      cap.textContent = `${i + 1} · P${h.par}`;
      cap.style.cssText = 'color:#90a4ae;font:10px system-ui;text-align:center;';
      cell.append(c, cap);
      row.appendChild(cell);
    });
    rowWrap.append(label, row);
    root.appendChild(rowWrap);
  }
}
