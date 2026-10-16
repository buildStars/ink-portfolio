import * as THREE from 'three';
import { FONT_BRUSH, bambooTex, canvasTex, lam, mulberry32, place, seal, vtext } from './paint';

/** 回廊墙面装饰：漏窗、书条石（诗句碑刻）、挂轴、花几盆景 */

type Ctx = CanvasRenderingContext2D;
export type WindowShape = 'hexagon' | 'octagon' | 'fan' | 'begonia';
export type LatticePattern = 'ice' | 'wan';

function shapePath(shape: WindowShape, cx: number, cy: number, r: number) {
  const p = new Path2D();
  if (shape === 'hexagon' || shape === 'octagon') {
    const n = shape === 'hexagon' ? 6 : 8;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2 + (shape === 'hexagon' ? 0 : Math.PI / 8);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i) p.lineTo(x, y);
      else p.moveTo(x, y);
    }
  } else if (shape === 'fan') {
    // 扇面：圆环的一段
    const a0 = Math.PI * 1.18;
    const a1 = Math.PI * 1.82;
    const oy = cy + r * 0.95;
    p.arc(cx, oy, r * 1.55, a0, a1);
    p.arc(cx, oy, r * 0.55, a1, a0, true);
  } else {
    // 海棠：四瓣
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const rr = r * (0.8 + 0.2 * Math.abs(Math.cos(a * 2)));
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i) p.lineTo(x, y);
      else p.moveTo(x, y);
    }
  }
  p.closePath();
  return p;
}

function drawLattice(g: Ctx, pattern: LatticePattern, w: number, h: number, seed: number) {
  const rnd = mulberry32(seed);
  g.strokeStyle = '#2f2b27';
  g.lineCap = 'round';
  if (pattern === 'wan') {
    // 万字纹：方格里交错的折线
    g.lineWidth = 7;
    const s = 48;
    for (let y = 0; y < h; y += s) {
      for (let x = 0; x < w; x += s) {
        const k = ((x + y) / s) % 2;
        g.beginPath();
        if (k) {
          g.moveTo(x, y + s / 2);
          g.lineTo(x + s / 2, y + s / 2);
          g.lineTo(x + s / 2, y);
          g.moveTo(x + s / 2, y + s / 2);
          g.lineTo(x + s / 2, y + s);
        } else {
          g.moveTo(x + s / 2, y);
          g.lineTo(x + s / 2, y + s / 2);
          g.lineTo(x + s, y + s / 2);
          g.moveTo(x + s / 2, y + s / 2);
          g.lineTo(x, y + s / 2);
        }
        g.stroke();
      }
    }
  } else {
    // 冰裂纹：抖动网格上的点，各连向最近的几个点
    g.lineWidth = 6;
    const pts: [number, number][] = [];
    const s = 70;
    for (let y = -s; y < h + s; y += s) for (let x = -s; x < w + s; x += s) pts.push([x + (rnd() - 0.5) * s * 0.8, y + (rnd() - 0.5) * s * 0.8]);
    for (const [x, y] of pts) {
      const near = pts
        .map((q) => [q, Math.hypot(q[0] - x, q[1] - y)] as const)
        .filter(([, d]) => d > 1)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 3);
      for (const [[qx, qy]] of near) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(qx, qy);
        g.stroke();
      }
    }
  }
}

/** 漏窗：窗框 + 花格，窗外透亮（墙后不开洞，用浅灰底表现进深） */
export function leakWindowTex(shape: WindowShape, pattern: LatticePattern, seed: number) {
  return canvasTex(512, 512, (g, w, h) => {
    const path = shapePath(shape, w / 2, h / 2, w * 0.4);
    g.save();
    g.clip(path);
    const gr = g.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.45);
    gr.addColorStop(0, '#f2efe8');
    gr.addColorStop(1, '#c9c5bc');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    drawLattice(g, pattern, w, h, seed);
    g.restore();
    g.lineJoin = 'round';
    g.strokeStyle = '#5d5a54';
    g.lineWidth = 26;
    g.stroke(path);
    g.strokeStyle = '#2f2b27';
    g.lineWidth = 4;
    g.stroke(path);
  });
}

/** 书条石：嵌在墙上的诗句碑刻（古诗，竖排，自右向左） */
export function poemTabletTex(lines: [string, string], credit: string, seed: number) {
  return canvasTex(1024, 360, (g, w, h) => {
    const rnd = mulberry32(seed);
    g.fillStyle = '#b5b0a6';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(60,55,50,${rnd() * 0.08})`;
      g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2 + rnd() * 3);
    }
    g.strokeStyle = 'rgba(40,36,32,0.7)';
    g.lineWidth = 6;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.lineWidth = 2;
    g.strokeRect(28, 28, w - 56, h - 56);
    const size = 52;
    const step = 56;
    const cols = [lines[0], lines[1]];
    cols.forEach((line, i) => vtext(g, line, w - 120 - i * 90, 70, step, `${size}px ${FONT_BRUSH}`, '#1e1c1a'));
    vtext(g, credit, w - 320, 80, 34, `30px ${FONT_BRUSH}`, '#3a3633');
    seal(g, w - 335, 80 + [...credit].length * 34 + 10, 34, '印', seed);
    // 碑面左侧留白处刻几道竖线，像拓片的界格
    g.strokeStyle = 'rgba(40,36,32,0.25)';
    g.lineWidth = 1.5;
    for (let x = 80; x < w - 380; x += 70) {
      g.beginPath();
      g.moveTo(x, 50);
      g.lineTo(x, h - 50);
      g.stroke();
    }
  });
}

/** 挂轴：墨竹或书法 */
export function hangingScrollTex(kind: 'bamboo' | 'calligraphy', text = '') {
  return canvasTex(320, 960, (g, w, h) => {
    g.fillStyle = '#c4ccc6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ddd8c8';
    g.fillRect(0, 96, w, 10);
    g.fillRect(0, h - 140, w, 10);
    g.fillStyle = '#f4efe1';
    g.fillRect(28, 130, w - 56, h - 300);
    if (kind === 'bamboo') {
      g.drawImage(bambooTex(77).image as HTMLCanvasElement, 34, 170, w - 68, h - 360);
      seal(g, w - 80, h - 230, 34, '印', 3);
    } else {
      const n = [...text].length;
      const size = Math.min(150, (h - 380) / n);
      vtext(g, text, w / 2, 160 + size / 2, size * 1.05, `${size}px ${FONT_BRUSH}`, '#141414');
      seal(g, w / 2 - 17, 170 + n * size * 1.05, 34, '印', 4);
    }
  });
}

/** 花几 + 盆景 */
export function flowerStand(plant: THREE.Texture) {
  const grp = new THREE.Group();
  const wood = lam(0x3b332c);
  place(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), wood), 0, 0.88, 0, grp);
  place(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.36), wood), 0, 0.2, 0, grp);
  for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    place(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.88, 0.04), wood), x * 0.18, 0.44, z * 0.18, grp);
  }
  place(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.16, 20), lam(0x8a847a)), 0, 0.98, 0, grp);
  const leaf = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.9),
    new THREE.MeshBasicMaterial({ map: plant, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  );
  place(leaf, 0, 1.5, 0, grp);
  return grp;
}
