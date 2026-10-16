import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { drawShanShui, mountainRange, soloMountain, tree as ssTree } from './shanshui';

/** 程序化水墨素材：所有山水花木都由 Canvas 现画，不依赖图片文件 */

export const FONT_BRUSH = '"Ma Shan Zheng"';
export const FONT_SERIF = '"Songti SC", "STSong", "SimSun", "Noto Serif SC", serif';
export const PAPER = 0xece6d8;
export const CINNABAR = 0xb8281d;

export type Rnd = () => number;
type Ctx = CanvasRenderingContext2D;

export function mulberry32(seed: number): Rnd {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function loadFonts(text: string) {
  const chars = [...new Set(text)].join('');
  const timeout = new Promise((r) => setTimeout(r, 8000));
  await Promise.race([document.fonts.load(`64px ${FONT_BRUSH}`, chars).catch(() => {}), timeout]);
}

export function canvasTex(w: number, h: number, draw: (g: Ctx, w: number, h: number) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export const lam = (color: THREE.ColorRepresentation, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, ...extra });

export function place<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number, parent: THREE.Object3D): T {
  obj.position.set(x, y, z);
  parent.add(obj);
  return obj;
}

/** 透明贴图的平面（树、云、鸟） */
export function billboard(tex: THREE.Texture, w: number, h: number, opts: THREE.MeshBasicMaterialParameters = {}) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, ...opts }),
  );
}

// ---------- 山 ----------
export function inkMountains(g: Ctx, x0: number, y0: number, w: number, h: number, rnd: Rnd, dark = 1) {
  const bumps = Array.from({ length: 3 + ((rnd() * 3) | 0) }, () => ({
    c: 0.12 + rnd() * 0.76,
    a: 0.3 + rnd() * 0.5,
    s: 0.05 + rnd() * 0.13,
  }));
  const ph = [rnd() * 9, rnd() * 9];
  const ridge = (u: number) => {
    let v = 0;
    for (const b of bumps) v = Math.max(v, b.a * Math.exp(-(((u - b.c) / b.s) ** 2)));
    v += 0.025 * Math.sin(u * 37 + ph[0]) + 0.012 * Math.sin(u * 91 + ph[1]);
    v *= Math.pow(Math.sin(u * Math.PI), 0.4);
    return y0 + h * (0.97 - v);
  };
  const path = new Path2D();
  path.moveTo(x0, y0 + h);
  for (let i = 0; i <= 240; i++) path.lineTo(x0 + (i / 240) * w, ridge(i / 240));
  path.lineTo(x0 + w, y0 + h);
  path.closePath();
  let top = Infinity;
  for (let i = 0; i <= 60; i++) top = Math.min(top, ridge(i / 60));
  const gr = g.createLinearGradient(0, top, 0, y0 + h);
  gr.addColorStop(0, `rgba(25,25,25,${0.85 * dark})`);
  gr.addColorStop(0.45, `rgba(55,55,55,${0.42 * dark})`);
  gr.addColorStop(1, 'rgba(90,90,90,0)');
  g.save();
  g.fillStyle = gr;
  g.fill(path);
  g.clip(path);
  for (let k = 1; k < 34; k++) {
    g.beginPath();
    g.setLineDash([4 + rnd() * 30, 3 + rnd() * 20]);
    g.lineWidth = 0.8 + rnd() * 2.2;
    g.strokeStyle = `rgba(15,15,15,${0.38 * dark * (1 - k / 34)})`;
    const off = k * h * 0.018 + rnd() * 4;
    for (let i = 0; i <= 120; i++) {
      const u = i / 120;
      g.lineTo(x0 + u * w, ridge(u) + off + Math.sin(u * 50 + k) * 2);
    }
    g.stroke();
  }
  g.restore();
  g.setLineDash([]);
  g.beginPath();
  g.lineWidth = 2.2;
  g.strokeStyle = `rgba(15,15,15,${0.9 * dark})`;
  for (let i = 0; i <= 240; i++) {
    const u = i / 240;
    g.lineTo(x0 + u * w, ridge(u) + (rnd() - 0.5) * 1.2);
  }
  g.stroke();
  g.fillStyle = `rgba(10,10,10,${0.8 * dark})`;
  for (let i = 0; i < 70; i++) {
    const u = 0.05 + rnd() * 0.9;
    g.beginPath();
    g.ellipse(x0 + u * w, ridge(u) + rnd() * 6, 1.5 + rnd() * 2.5, 1 + rnd() * 1.5, rnd() * 3, 0, 7);
    g.fill();
  }
}

/**
 * 远山贴片：面向 face 点，越远越淡。
 * 山形来自 shan-shui-inf：近中景带植被与皴法，远景（opacity 低）不带植被；山脚渐隐入雾。
 */
export function mountain(seed: number, x: number, z: number, w: number, h: number, opacity: number, face: THREE.Vector2, baseY = -0.35) {
  const far = opacity < 0.4;
  const tex = canvasTex(1024, 512, (g, cw, ch) =>
    drawShanShui(g, mountainRange(seed, far ? 4 : 3, !far), 0, 0, cw, ch, { base: 0, ink: far ? 1.6 : 2.2, fade: 0.22 }),
  );
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity }),
  );
  m.position.set(x, baseY + h / 2, z);
  m.rotation.y = Math.atan2(face.x - x, face.y - z);
  m.renderOrder = -1;
  return m;
}

// ---------- 字与印 ----------
export function seal(g: Ctx, x: number, y: number, s: number, chars: string, seed = 1) {
  const rnd = mulberry32(seed);
  const j = () => (rnd() - 0.5) * s * 0.04;
  g.save();
  g.fillStyle = '#b8281d';
  g.beginPath();
  g.moveTo(x + j(), y + j());
  g.lineTo(x + s + j(), y + j());
  g.lineTo(x + s + j(), y + s + j());
  g.lineTo(x + j(), y + s + j());
  g.closePath();
  g.fill();
  g.fillStyle = '#f3ecdc';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const c = [...chars];
  if (c.length === 1) {
    g.font = `${s * 0.7}px ${FONT_BRUSH}`;
    g.fillText(c[0], x + s / 2, y + s / 2 + s * 0.04);
  } else {
    g.font = `${s * 0.42}px ${FONT_BRUSH}`;
    const cells = [
      [0.72, 0.28],
      [0.72, 0.72],
      [0.28, 0.28],
      [0.28, 0.72],
    ];
    c.slice(0, 4).forEach((ch, i) => g.fillText(ch, x + s * cells[i][0], y + s * cells[i][1] + s * 0.03));
  }
  g.restore();
}

export function vtext(g: Ctx, str: string, x: number, y: number, step: number, font: string, color: string) {
  g.font = font;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  [...str].forEach((ch, i) => g.fillText(ch, x, y + i * step));
}

/** 竖排文字自动缩放到给定高度 */
export function fitVertical(str: string, maxH: number, maxSize: number) {
  const n = Math.max([...str].length, 1);
  const size = Math.min(maxSize, (maxH / n) * 0.92);
  return { size, step: size * 1.06 };
}

// ---------- 花木 ----------
export function plumTex(seed: number) {
  return canvasTex(768, 768, (g, w, h) => {
    const rnd = mulberry32(seed);
    g.lineCap = 'round';
    const blossom = (x: number, y: number) => {
      for (let i = 0; i < 2; i++) {
        const bx = x + (rnd() - 0.5) * 18;
        const by = y + (rnd() - 0.5) * 18;
        g.fillStyle = `rgba(${(195 + rnd() * 30) | 0},${(28 + rnd() * 20) | 0},${(22 + rnd() * 14) | 0},0.92)`;
        g.beginPath();
        g.arc(bx, by, 5 + rnd() * 5, 0, 7);
        g.fill();
        g.fillStyle = 'rgba(20,20,20,0.9)';
        g.fillRect(bx - 1, by - 1, 2, 2);
      }
    };
    const branch = (x: number, y: number, a: number, len: number, wd: number, depth: number) => {
      if (depth === 0 || len < 10) return blossom(x, y);
      const ex = x + Math.cos(a) * len;
      const ey = y + Math.sin(a) * len;
      g.strokeStyle = 'rgba(18,18,18,0.95)';
      g.lineWidth = wd;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len * 0.5 + (rnd() - 0.5) * 16, y + Math.sin(a) * len * 0.5 + (rnd() - 0.5) * 16);
      g.lineTo(ex, ey);
      g.stroke();
      if (rnd() < 0.55) blossom(ex, ey);
      branch(ex, ey, a - 0.3 - rnd() * 0.5, len * 0.74, wd * 0.68, depth - 1);
      if (rnd() < 0.85) branch(ex, ey, a + 0.2 + rnd() * 0.55, len * 0.66, wd * 0.62, depth - 1);
    };
    branch(w * 0.35, h, -1.3, 190, 26, 7);
  });
}

export function bambooTex(seed: number) {
  return canvasTex(512, 1024, (g, w, h) => {
    const rnd = mulberry32(seed);
    for (let s = 0; s < 5; s++) {
      const x = w * (0.12 + s * 0.18 + rnd() * 0.05);
      g.strokeStyle = `rgba(30,30,30,${0.45 + s * 0.1})`;
      g.lineWidth = 9 + rnd() * 7;
      for (let y = h; y > h * 0.04; y -= 90 + rnd() * 40) {
        g.beginPath();
        g.moveTo(x, y - 5);
        g.lineTo(x + (rnd() - 0.5) * 3, y - 82);
        g.stroke();
      }
      for (let k = 0; k < 12; k++) {
        const ly = h * (0.04 + rnd() * 0.55);
        const right = rnd() < 0.5;
        const len = 50 + rnd() * 60;
        g.save();
        g.translate(x, ly);
        g.rotate(right ? 0.25 + rnd() * 0.6 : Math.PI - 0.25 - rnd() * 0.6);
        g.fillStyle = `rgba(20,20,20,${0.7 + rnd() * 0.25})`;
        g.beginPath();
        g.ellipse(len / 2, 0, len / 2, 4 + rnd() * 3, 0, 0, 7);
        g.fill();
        g.restore();
      }
    }
  });
}

export function willowTex(seed: number) {
  return canvasTex(512, 1024, (g, w, h) => {
    const rnd = mulberry32(seed);
    g.strokeStyle = 'rgba(20,20,20,0.95)';
    g.lineCap = 'round';
    g.lineWidth = 26;
    g.beginPath();
    g.moveTo(w * 0.42, h);
    g.bezierCurveTo(w * 0.52, h * 0.75, w * 0.3, h * 0.55, w * 0.46, h * 0.3);
    g.stroke();
    const tips: [number, number][] = [];
    for (let i = 0; i < 8; i++) {
      const sx = w * 0.46, sy = h * (0.3 + rnd() * 0.18);
      const ex = w * (0.04 + rnd() * 0.92), ey = h * (0.04 + rnd() * 0.18);
      g.lineWidth = 4 + rnd() * 7;
      g.beginPath();
      g.moveTo(sx, sy);
      g.quadraticCurveTo((sx + ex) / 2, ey - 40, ex, ey);
      g.stroke();
      tips.push([ex, ey]);
      for (let k = 0; k < 3; k++) {
        const t = 0.3 + rnd() * 0.6;
        tips.push([sx + (ex - sx) * t, sy + (ey - sy) * t - 20 * t]);
      }
    }
    for (const [x, y] of tips) {
      for (let s = 0; s < 8; s++) {
        const len = h * (0.22 + rnd() * 0.45);
        const dx = (rnd() - 0.5) * 70;
        const x0 = x + (rnd() - 0.5) * 30;
        g.lineWidth = 1.3;
        g.strokeStyle = `rgba(25,25,25,${0.3 + rnd() * 0.45})`;
        g.beginPath();
        g.moveTo(x0, y);
        g.bezierCurveTo(x0 + dx * 0.3, y + len * 0.3, x0 + dx, y + len * 0.6, x0 + dx * 1.2, y + len);
        g.stroke();
        for (let t = 0.15; t < 1; t += 0.07) {
          const lx = x0 + dx * 1.2 * t * t, ly = y + len * t;
          g.beginPath();
          g.moveTo(lx, ly);
          g.lineTo(lx + 3, ly + 10);
          g.stroke();
        }
      }
    }
  });
}

/** 松：shan-shui-inf 的两种松（虬松 tree04、直松 tree05）轮换 */
export function pineTex(seed: number) {
  return canvasTex(512, 768, (g, w, h) => drawShanShui(g, ssTree(seed % 2 ? 4 : 5, seed, 260, 7), 0, 0, w, h, { ink: 1.8 }));
}

/** 画心里的小幅山水（挂轴、屏风、横幅用）：wide 为横幅连山，否则为一座独山配水纹 */
export function inkLandscape(g: Ctx, x0: number, y0: number, w: number, h: number, seed: number, wide = false, paper = '#f4efe1') {
  drawShanShui(g, wide ? mountainRange(seed, 2) : soloMountain(seed), x0, y0, w, h, { paper, base: wide ? 0 : 50, ink: 1.6 });
}

/** 旧版手绘松（保留备用） */
export function pineTexLegacy(seed: number) {
  return canvasTex(512, 768, (g, w, h) => {
    const rnd = mulberry32(seed);
    g.lineCap = 'round';
    const cluster = (cx: number, cy: number, r0: number) => {
      g.fillStyle = 'rgba(40,40,40,0.22)';
      g.beginPath();
      g.ellipse(cx, cy - r0 * 0.25, r0 * 1.1, r0 * 0.38, 0, 0, 7);
      g.fill();
      g.lineWidth = 1.6;
      for (let k = 0; k < 30; k++) {
        const a = Math.PI + (k / 29) * Math.PI + (rnd() - 0.5) * 0.12;
        const r = r0 * (0.8 + rnd() * 0.45);
        g.strokeStyle = `rgba(15,15,15,${0.55 + rnd() * 0.4})`;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.5);
        g.stroke();
      }
    };
    const pts: [number, number][] = [];
    let x = w * 0.5, y = h;
    g.strokeStyle = 'rgba(20,20,20,0.95)';
    g.lineWidth = 20;
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i < 6; i++) {
      x += (rnd() - 0.5) * 70;
      y -= h * 0.13;
      g.lineTo(x, y);
      pts.push([x, y]);
    }
    g.stroke();
    for (const [bx, by] of pts.slice(1)) {
      for (const dir of [-1, 1]) {
        if (rnd() < 0.3) continue;
        const len = 60 + rnd() * 120;
        const ex = bx + dir * len, ey = by - 10 - rnd() * 40;
        g.strokeStyle = 'rgba(20,20,20,0.95)';
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(bx, by);
        g.quadraticCurveTo((bx + ex) / 2, by - 30, ex, ey);
        g.stroke();
        cluster(ex, ey, 34 + rnd() * 14);
        cluster((bx + ex) / 2, (by + ey) / 2 - 14, 26 + rnd() * 10);
      }
    }
    cluster(x, y, 40);
  });
}

export function reedTex(seed: number) {
  return canvasTex(512, 512, (g, w, h) => {
    const rnd = mulberry32(seed);
    g.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const x = 20 + rnd() * (w - 40), top = h * (0.15 + rnd() * 0.45), bend = (rnd() - 0.3) * 60;
      g.strokeStyle = `rgba(25,25,25,${0.4 + rnd() * 0.5})`;
      g.lineWidth = 1.2 + rnd() * 1.6;
      g.beginPath();
      g.moveTo(x, h);
      g.quadraticCurveTo(x + bend * 0.3, (h + top) / 2, x + bend, top);
      g.stroke();
      if (rnd() < 0.5) {
        g.fillStyle = 'rgba(60,60,60,0.5)';
        g.beginPath();
        g.ellipse(x + bend, top - 12, 4, 16, bend * 0.004, 0, 7);
        g.fill();
      }
    }
  });
}

export function cloudTex(seed: number, count = 4) {
  return canvasTex(1024, 256, (g) => {
    const rnd = mulberry32(seed);
    g.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const cx = 120 + (i * 800) / Math.max(count - 1, 1) + (rnd() - 0.5) * 60;
      const cy = 110 + rnd() * 80;
      const r = 18 + rnd() * 18;
      g.fillStyle = 'rgba(250,247,240,0.95)';
      g.strokeStyle = 'rgba(30,30,30,0.85)';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(cx, cy, r * 3, r * 0.9, 0, Math.PI, 0);
      g.fill();
      for (const [dx, rr] of [[-r * 1.4, r], [0, r * 1.3], [r * 1.4, r * 0.9]]) {
        g.beginPath();
        for (let a = 0; a < Math.PI * 3.2; a += 0.1) {
          const rad = rr * (1 - a / (Math.PI * 3.6));
          g.lineTo(cx + dx + Math.cos(a + Math.PI) * rad, cy - rr * 0.3 + Math.sin(a + Math.PI) * rad);
        }
        g.stroke();
      }
      g.beginPath();
      g.moveTo(cx - r * 3, cy);
      g.quadraticCurveTo(cx, cy + r * 0.5, cx + r * 3, cy);
      g.stroke();
    }
  });
}

/** 天上的淡墨云：几团晕开的淡墨叠成云身，上缘轻勾一笔，一端卷出云头 */
export function skyCloudTex(seed: number) {
  return canvasTex(1024, 384, (g, w, h) => {
    const rnd = mulberry32(seed);
    const n = 5 + ((rnd() * 3) | 0);
    const puffs: [number, number, number][] = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const r = 62 + Math.sin(u * Math.PI) * 70 + rnd() * 24;
      puffs.push([w * (0.16 + 0.68 * u) + (rnd() - 0.5) * 40, h * 0.66 - Math.sin(u * Math.PI) * h * 0.2 + (rnd() - 0.5) * 20, r]);
    }
    // 云身：淡墨晕染
    for (const [cx, cy, r] of puffs) {
      const gr = g.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
      gr.addColorStop(0, 'rgba(150,150,150,0.30)');
      gr.addColorStop(0.65, 'rgba(165,165,165,0.2)');
      gr.addColorStop(1, 'rgba(180,180,180,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, cy, r, 0, 7);
      g.fill();
    }
    // 上缘：每团只勾上半圈
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(30,30,30,0.6)';
    for (const [cx, cy, r] of puffs) {
      g.lineWidth = 2 + rnd() * 1.5;
      g.beginPath();
      g.arc(cx, cy, r * 0.8, Math.PI * (1.12 + rnd() * 0.06), Math.PI * (1.82 + rnd() * 0.06));
      g.stroke();
    }
    // 底边一笔
    const first = puffs[0];
    const last = puffs[n - 1];
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(first[0] - first[2] * 0.5, h * 0.74);
    g.quadraticCurveTo(w / 2, h * 0.79, last[0] + last[2] * 0.4, h * 0.73);
    g.stroke();
    // 云头：一端向内卷
    const [hx, hy, hr] = rnd() < 0.5 ? first : last;
    const dir = hx < w / 2 ? -1 : 1;
    g.lineWidth = 3;
    g.beginPath();
    for (let a = 0; a < Math.PI * 3; a += 0.1) {
      const rr = hr * 0.5 * (1 - a / (Math.PI * 3.4));
      g.lineTo(hx + dir * hr * 0.35 + dir * Math.cos(a) * rr, hy + h * 0.04 + Math.sin(a) * rr * 0.7);
    }
    g.stroke();
  });
}

export function birdsTex(seed: number) {
  return canvasTex(512, 256, (g) => {
    const rnd = mulberry32(seed);
    g.strokeStyle = 'rgba(25,25,25,0.85)';
    g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const x = 40 + rnd() * 420, y = 40 + rnd() * 170, s = 6 + rnd() * 9;
      g.lineWidth = 1.5 + rnd();
      g.beginPath();
      g.moveTo(x - s, y - s * 0.4);
      g.quadraticCurveTo(x - s * 0.4, y - s * 0.5, x, y);
      g.quadraticCurveTo(x + s * 0.4, y - s * 0.6, x + s, y - s * 0.5);
      g.stroke();
    }
  });
}

let lakeCache: THREE.CanvasTexture | null = null;
export function lakeTex() {
  if (lakeCache) return lakeCache;
  lakeCache = canvasTex(512, 512, (g, w, h) => {
    const rnd = mulberry32(4);
    g.fillStyle = '#dedad0';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * w, y = rnd() * h, l = 10 + rnd() * 40;
      g.strokeStyle = `rgba(60,60,60,${0.12 + rnd() * 0.2})`;
      g.lineWidth = 1 + rnd();
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + l / 2, y - 3, x + l, y);
      g.stroke();
    }
  });
  lakeCache.wrapS = lakeCache.wrapT = THREE.RepeatWrapping;
  lakeCache.repeat.set(40, 40);
  return lakeCache;
}

export function lake(size: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: lakeTex() }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** 太湖石 / 山石：随机变形的多面体 */
export function rockGeometry(seed: number, stretchY = 1.6, detail = 2) {
  const base = new THREE.IcosahedronGeometry(0.9, detail);
  base.deleteAttribute('normal');
  base.deleteAttribute('uv');
  const geo = mergeVertices(base);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const rnd = mulberry32(seed);
  const [a, b, c, d] = [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    // 连续噪声：相邻顶点位移一致，表面不会裂开
    const f = 1 + 0.22 * Math.sin(n.x * 2.7 + a) * Math.sin(n.y * 3.1 + b) * Math.sin(n.z * 2.3 + c) + 0.08 * Math.sin(n.x * 6 + n.z * 5 + d);
    v.multiplyScalar(f);
    v.y *= stretchY;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------- 人物线稿 ----------
type Pt = [number, number];

function smoothPath(g: Ctx, pts: Pt[], close: boolean) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    g.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
  }
  const last = pts[pts.length - 1];
  g.lineTo(last[0], last[1]);
  if (close) g.closePath();
}

/** 一笔墨线：主笔 + 略偏移的细笔，模拟毛笔的飞白 */
function inkLine(g: Ctx, pts: Pt[], width: number, alpha = 0.92, close = false, fill?: string) {
  smoothPath(g, pts, close);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  g.strokeStyle = `rgba(18,18,18,${alpha})`;
  g.lineWidth = width;
  g.stroke();
  g.save();
  g.translate(0.8, 0.6);
  smoothPath(g, pts, close);
  g.strokeStyle = `rgba(18,18,18,${alpha * 0.35})`;
  g.lineWidth = width * 0.45;
  g.stroke();
  g.restore();
}

/**
 * 占位人物：现代休闲装，一手插兜一手挥手。wave = 0 / 1 是挥手的两帧。
 * 想换成自己的形象，在 content.ts 里填 site.portrait 即可，不需要改这里。
 */
export function figureTex(wave: 0 | 1) {
  return canvasTex(512, 1024, (g) => {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const skin = '#f4efe4';
    const cloth = '#f6f2e8';
    const pants = '#8f8b84';
    const hair = 'rgba(38,36,34,0.92)';

    // 脚下墨晕
    g.fillStyle = 'rgba(30,30,30,0.16)';
    g.beginPath();
    g.ellipse(256, 1004, 130, 14, 0, 0, 7);
    g.fill();

    // 长裤
    inkLine(g, [[194, 528], [197, 650], [201, 800], [205, 958], [244, 958], [247, 800], [252, 640], [256, 606], [260, 640], [265, 800], [270, 958], [310, 958], [314, 800], [318, 650], [322, 528]], 5, 0.92, true, pants);
    inkLine(g, [[198, 546], [318, 546]], 3, 0.55);
    inkLine(g, [[206, 562], [222, 602]], 2.5, 0.55);
    inkLine(g, [[310, 562], [294, 602]], 2.5, 0.55);
    inkLine(g, [[214, 762], [232, 772]], 2, 0.45);
    inkLine(g, [[284, 772], [302, 762]], 2, 0.45);

    // 鞋
    inkLine(g, [[205, 956], [202, 984], [172, 995], [172, 1006], [246, 1008], [246, 960]], 4.5, 0.92, true, cloth);
    inkLine(g, [[270, 960], [270, 1008], [344, 1006], [344, 995], [314, 984], [310, 956]], 4.5, 0.92, true, cloth);
    inkLine(g, [[174, 1000], [244, 1002]], 2.5, 0.55);
    inkLine(g, [[272, 1002], [342, 1000]], 2.5, 0.55);

    // 左臂自然下垂（先画，袖子会盖住上端）
    inkLine(g, [[160, 330], [164, 440], [178, 522], [200, 522], [204, 440], [200, 330]], 4.5, 0.92, true, skin);
    inkLine(g, [[178, 520], [172, 548], [182, 568], [198, 566], [206, 544], [200, 520]], 4.5, 0.92, true, skin);

    // 上衣（T 恤，右袖抬起）
    inkLine(g, [[236, 250], [190, 264], [148, 352], [206, 362], [202, 430], [194, 530], [256, 537], [322, 530], [320, 430], [322, 322], [366, 292], [352, 246], [302, 258], [276, 250]], 5, 0.92, true, cloth);
    inkLine(g, [[216, 394], [226, 432]], 2, 0.45);
    inkLine(g, [[302, 410], [294, 452]], 2, 0.45);
    inkLine(g, [[236, 502], [276, 508]], 2, 0.4);
    inkLine(g, [[236, 252], [256, 272], [276, 252]], 4, 0.9);

    // 右上臂
    inkLine(g, [[354, 250], [388, 246], [398, 262], [392, 284], [364, 290]], 4.5, 0.92, true, skin);

    // 手肘
    g.fillStyle = skin;
    g.beginPath();
    g.arc(393, 267, 13, 0, 7);
    g.fill();

    // 前臂 + 手：绕手肘摆动
    g.save();
    g.translate(392, 266);
    g.rotate(wave ? 0.3 : -0.06);
    g.translate(-392, -266);
    inkLine(g, [[381, 262], [389, 198], [415, 200], [405, 276]], 4.5, 0.92, true, skin);
    // 手指：粗墨线打底、细肤色线压中间，形成带轮廓的圆头手指
    const finger = (pts: Pt[]) => {
      smoothPath(g, pts, false);
      g.strokeStyle = 'rgba(18,18,18,0.92)';
      g.lineWidth = 13;
      g.stroke();
      smoothPath(g, pts, false);
      g.strokeStyle = skin;
      g.lineWidth = 6;
      g.stroke();
    };
    finger([[395, 156], [391, 128]]);
    finger([[404, 150], [403, 120]]);
    finger([[413, 150], [416, 122]]);
    finger([[421, 158], [428, 134]]);
    finger([[390, 182], [374, 166]]);
    inkLine(g, [[388, 202], [384, 172], [390, 150], [408, 142], [424, 152], [426, 180], [416, 202]], 4.5, 0.92, true, skin);
    g.restore();

    // 脖子与头
    inkLine(g, [[244, 226], [243, 254]], 4);
    inkLine(g, [[268, 226], [269, 254]], 4);
    g.fillStyle = skin;
    g.beginPath();
    g.ellipse(256, 170, 50, 60, 0, 0, 7);
    g.fill();
    g.strokeStyle = 'rgba(18,18,18,0.92)';
    g.lineWidth = 5;
    g.stroke();
    inkLine(g, [[208, 166], [198, 178], [203, 196], [210, 200]], 4);
    inkLine(g, [[304, 166], [314, 178], [309, 196], [302, 200]], 4);
    inkLine(g, [[206, 178], [204, 140], [222, 110], [256, 98], [292, 106], [310, 132], [306, 178], [298, 150], [282, 132], [258, 126], [236, 134], [214, 156]], 4, 0.92, true, hair);

    // 笑眼、微笑、腮红
    inkLine(g, [[228, 184], [238, 175], [248, 184]], 3.5);
    inkLine(g, [[264, 184], [274, 175], [284, 184]], 3.5);
    inkLine(g, [[242, 207], [256, 215], [270, 207]], 3.5);
    g.fillStyle = 'rgba(205,70,55,0.35)';
    for (const x of [226, 286]) {
      g.beginPath();
      g.ellipse(x, 199, 10, 6, 0, 0, 7);
      g.fill();
    }
  });
}

// ---------- 园林花木：兰草、芭蕉、灌木、锦鲤 ----------

/** 两头尖、中间宽的一片叶子（沿二次曲线） */
function taperLeaf(g: Ctx, p0: Pt, p1: Pt, p2: Pt, w0: number, fill: string, outline = 0) {
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const u = 1 - t;
    const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
    const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
    const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
    const dy = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
    const len = Math.hypot(dx, dy) || 1;
    const wd = w0 * Math.sin(Math.PI * Math.pow(t, 0.6));
    left.push([x - (dy / len) * wd, y + (dx / len) * wd]);
    right.push([x + (dy / len) * wd, y - (dx / len) * wd]);
  }
  g.beginPath();
  left.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  right.reverse().forEach(([x, y]) => g.lineTo(x, y));
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (outline) {
    g.strokeStyle = 'rgba(18,18,18,0.85)';
    g.lineWidth = outline;
    g.stroke();
  }
}

export function orchidTex(seed: number) {
  return canvasTex(512, 320, (g, w, h) => {
    const rnd = mulberry32(seed);
    for (let i = 0; i < 20; i++) {
      const x0 = w / 2 + (rnd() - 0.5) * 70;
      const dir = rnd() < 0.5 ? -1 : 1;
      const len = 120 + rnd() * 170;
      const reach = 40 + rnd() * 190;
      taperLeaf(g, [x0, h], [x0 + dir * reach * 0.35, h - len], [x0 + dir * reach, h - len * (0.35 + rnd() * 0.5)], 3 + rnd() * 4, `rgba(20,20,20,${0.6 + rnd() * 0.35})`);
    }
  });
}

export function bananaTex(seed: number) {
  return canvasTex(512, 640, (g, w, h) => {
    const rnd = mulberry32(seed);
    taperLeaf(g, [w / 2, h], [w / 2 - 6, h * 0.75], [w / 2 - 4, h * 0.5], 22, 'rgba(40,40,40,0.75)', 2);
    const base: Pt = [w / 2 - 4, h * 0.52];
    const leaves = 7;
    for (let i = 0; i < leaves; i++) {
      const a = -Math.PI / 2 + (i - (leaves - 1) / 2) * 0.42 + (rnd() - 0.5) * 0.15;
      const len = 210 + rnd() * 90;
      const tip: Pt = [base[0] + Math.cos(a) * len, base[1] + Math.sin(a) * len * 0.9 + (Math.abs(a + Math.PI / 2) > 0.6 ? 80 : 0)];
      const ctrl: Pt = [base[0] + Math.cos(a) * len * 0.55, base[1] + Math.sin(a) * len * 0.75 - 30];
      taperLeaf(g, base, ctrl, tip, 34 + rnd() * 18, `rgba(55,55,55,${0.35 + rnd() * 0.2})`, 2);
      // 叶脉
      g.strokeStyle = 'rgba(20,20,20,0.5)';
      g.lineWidth = 1.2;
      for (let t = 0.12; t < 0.95; t += 0.06) {
        const u = 1 - t;
        const x = u * u * base[0] + 2 * u * t * ctrl[0] + t * t * tip[0];
        const y = u * u * base[1] + 2 * u * t * ctrl[1] + t * t * tip[1];
        const off = 30 * Math.sin(Math.PI * Math.pow(t, 0.6));
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a + 0.9) * off, y + Math.sin(a + 0.9) * off);
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a - 0.9) * off, y + Math.sin(a - 0.9) * off);
        g.stroke();
      }
      smoothPath(g, [base, ctrl, tip], false);
      g.strokeStyle = 'rgba(20,20,20,0.85)';
      g.lineWidth = 2.5;
      g.stroke();
      // 芭蕉叶常见的撕裂
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        const t = 0.4 + rnd() * 0.45;
        const u = 1 - t;
        const x = u * u * base[0] + 2 * u * t * ctrl[0] + t * t * tip[0];
        const y = u * u * base[1] + 2 * u * t * ctrl[1] + t * t * tip[1];
        const side = rnd() < 0.5 ? 0.9 : -0.9;
        g.beginPath();
        g.moveTo(x + Math.cos(a + side) * 8, y + Math.sin(a + side) * 8);
        g.lineTo(x + Math.cos(a + side) * 40, y + Math.sin(a + side) * 40);
        g.stroke();
      }
      g.restore();
    }
  });
}

export function shrubTex(seed: number) {
  return canvasTex(512, 320, (g, w, h) => {
    const rnd = mulberry32(seed);
    for (let i = 0; i < 520; i++) {
      const a = rnd() * Math.PI;
      const r = Math.sqrt(rnd());
      const x = w / 2 + Math.cos(a) * r * (w / 2 - 24);
      const y = h - 8 - Math.sin(a) * r * (h - 30);
      const shade = 0.25 + (y / h) * 0.5;
      g.fillStyle = `rgba(20,20,20,${shade * (0.6 + rnd() * 0.4)})`;
      g.beginPath();
      g.ellipse(x, y, 6 + rnd() * 6, 3 + rnd() * 3, rnd() * Math.PI, 0, 7);
      g.fill();
    }
  });
}

/** 俯视的锦鲤，头朝贴图上方。kind 0 红白、1 橙色、2 白底黑斑 */
export function koiTex(kind: 0 | 1 | 2, seed: number) {
  return canvasTex(128, 256, (g) => {
    const rnd = mulberry32(seed);
    const fin = kind === 1 ? 'rgba(232,140,70,0.75)' : 'rgba(205,198,185,0.8)';
    g.fillStyle = fin;
    g.strokeStyle = 'rgba(18,18,18,0.7)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(64, 186);
    g.quadraticCurveTo(28, 226, 20, 252);
    g.quadraticCurveTo(64, 230, 108, 252);
    g.quadraticCurveTo(100, 226, 64, 186);
    g.fill();
    g.stroke();
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(64 + s * 30, 86, 16, 9, s * 0.6, 0, 7);
      g.fill();
      g.stroke();
    }
    const body = new Path2D();
    body.moveTo(64, 16);
    body.bezierCurveTo(100, 30, 98, 120, 64, 200);
    body.bezierCurveTo(30, 120, 28, 30, 64, 16);
    g.fillStyle = kind === 1 ? '#e8742a' : '#f4f1ea';
    g.fill(body);
    g.save();
    g.clip(body);
    const patch = kind === 0 ? '#cf3322' : kind === 2 ? '#2a2826' : '#f0a060';
    for (let i = 0; i < (kind === 1 ? 2 : 4); i++) {
      g.fillStyle = patch;
      g.beginPath();
      g.ellipse(52 + rnd() * 24, 34 + i * 38 + rnd() * 16, 14 + rnd() * 14, 12 + rnd() * 14, rnd() * 3, 0, 7);
      g.fill();
    }
    g.restore();
    g.lineWidth = 2;
    g.stroke(body);
    g.fillStyle = '#161616';
    for (const x of [53, 75]) {
      g.beginPath();
      g.arc(x, 40, 3, 0, 7);
      g.fill();
    }
  });
}

/** 红灯笼 */
export function lantern() {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 28, 18), lam(0xc4261b, { emissive: 0x6a0a05 }));
  body.scale.set(1, 1.2, 1);
  body.castShadow = true;
  grp.add(body);
  for (const y of [-0.24, 0.24]) place(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 16), lam(0x2a2622)), 0, y, 0, grp);
  place(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.6, 4), lam(0x222222)), 0, 0.55, 0, grp);
  place(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), lam(0xb02a1e)), 0, -0.38, 0, grp);
  return grp;
}

/** 渔舟 */
export function boat() {
  const grp = new THREE.Group();
  place(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 0.42), lam(0x2c2926)), 0, 0, 0, grp);
  const roof = place(
    new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 12, 1, true, 0, Math.PI), lam(0x3a3632, { side: THREE.DoubleSide })),
    -0.2, 0.08, 0, grp,
  );
  roof.rotation.z = Math.PI / 2;
  place(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.42, 8), lam(0x2a2723)), 0.55, 0.29, 0, grp);
  place(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.12, 12), lam(0x3c3833)), 0.55, 0.55, 0, grp);
  place(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.4, 4), lam(0x222222)), 0.85, 0.7, 0.05, grp).rotation.z = -0.6;
  return grp;
}

export const CN_NUM = ['壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾', '拾壹', '拾贰'];
