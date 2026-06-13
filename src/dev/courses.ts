// src/dev/courses.ts
import { generateHole } from '../course/generate';
import type { Surface } from '../course/format';

const CSS_COLORS: Record<Surface, string> = {
  0: '#7ec850', 1: '#4f7a33', 2: '#9fdc6a', 3: '#e8d28a',
};

export function renderCourseGallery(root: HTMLElement, count = 12): void {
  root.innerHTML = '';
  root.style.cssText = 'display:flex;flex-wrap:wrap;gap:16px;padding:16px;background:#263238;min-height:100vh;align-content:flex-start;';
  for (let seed = 1; seed <= count; seed++) {
    const hole = generateHole(seed, 3);
    const { width, depth } = hole.grid;
    const px = 2;
    const wrap = document.createElement('div');
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
      ctx.arc((x / hole.grid.cellSize + width / 2) * px, (-z / hole.grid.cellSize) * px, 4, 0, Math.PI * 2);
      ctx.fill();
    };
    dot(hole.tee.x, hole.tee.z, '#ffffff');
    dot(hole.pin.x, hole.pin.z, '#ef5350');
    const len = Math.hypot(hole.pin.x - hole.tee.x, hole.pin.z - hole.tee.z);
    const caption = document.createElement('div');
    caption.textContent = `seed ${seed} · ${len.toFixed(0)} m · diff ${hole.difficulty.toFixed(2)}`;
    caption.style.cssText = 'color:#eceff1;font:12px system-ui;margin-top:4px;text-align:center;';
    wrap.append(canvas, caption);
    root.appendChild(wrap);
  }
}
