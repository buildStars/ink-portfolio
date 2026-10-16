import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { lam, mulberry32 } from './paint';

/**
 * 太湖石（峰石）：讲究「瘦、漏、透、皱」——身形细高、上大下小，石身上有穿透的孔洞和凹窝，表面起皱。
 * 用有向距离场（SDF）拼出石身、挖出孔洞，再用 Marching Cubes 生成网格；孔洞里压暗，水墨画面里就是一个个墨点。
 * 坐标：立在 y = 0 的地面上，高约 2.3~2.6m。
 */

type V3 = [number, number, number];

const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);

function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

function ellipsoid(x: number, y: number, z: number, c: V3, r: V3) {
  const px = x - c[0], py = y - c[1], pz = z - c[2];
  const k0 = len3(px / r[0], py / r[1], pz / r[2]);
  const k1 = len3(px / (r[0] * r[0]), py / (r[1] * r[1]), pz / (r[2] * r[2]));
  return k1 === 0 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1;
}

/** 点到线段的距离减半径：穿石而过的孔洞 */
function capsule(x: number, y: number, z: number, a: V3, b: V3, r: number) {
  const pax = x - a[0], pay = y - a[1], paz = z - a[2];
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  return len3(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}

// 三维值噪声：给石面起皱
const PERM = new Uint8Array(512);
{
  const rnd = mulberry32(2024);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
const lattice = (x: number, y: number, z: number) => PERM[PERM[PERM[x & 255] + (y & 255)] + (z & 255)] / 127.5 - 1;
const fade = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function vnoise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);
  const a = lerp(lerp(lattice(ix, iy, iz), lattice(ix + 1, iy, iz), fx), lerp(lattice(ix, iy + 1, iz), lattice(ix + 1, iy + 1, iz), fx), fy);
  const b = lerp(lerp(lattice(ix, iy, iz + 1), lattice(ix + 1, iy, iz + 1), fx), lerp(lattice(ix, iy + 1, iz + 1), lattice(ix + 1, iy + 1, iz + 1), fx), fy);
  return lerp(a, b, fz);
}

interface Blob { c: V3; r: V3 }
interface Hole { a: V3; b: V3; r: number }
interface Pit { c: V3; r: number }

interface StoneSpec {
  height: number;
  lean: number;
  blobs: Blob[];
  holes: Hole[];
  pits: Pit[];
  off: number; // 噪声偏移：同一套噪声，两块石头的皱纹不一样
}

/** 按种子定出一块峰石的形：沿着微弯的脊线叠几团椭球，腰细、顶部外挑 */
function makeSpec(seed: number): StoneSpec {
  const rnd = mulberry32(seed);
  const height = 2.3 + rnd() * 0.3;
  const lean = (rnd() < 0.5 ? -1 : 1) * (0.22 + rnd() * 0.16);
  const spine = (t: number): V3 => [lean * t * t + Math.sin(t * 5 + seed) * 0.05, 0.12 + t * (height - 0.3), Math.cos(t * 4 + seed) * 0.05];
  const widths = [0.48, 0.36, 0.25, 0.3, 0.4, 0.24];
  const blobs: Blob[] = widths.map((w, i) => {
    const t = i / (widths.length - 1);
    const s = w * (0.9 + rnd() * 0.2);
    const c = spine(t);
    return { c: [c[0] + (rnd() - 0.5) * 0.1, c[1], c[2]], r: [s, ((height - 0.3) / widths.length) * 0.95, s * (0.62 + rnd() * 0.15)] };
  });
  // 顶部向一侧挑出的一团：头重脚轻，是峰石最有姿态的地方
  const top = spine(0.78);
  const side = lean > 0 ? 1 : -1;
  blobs.push({ c: [top[0] + side * 0.4, top[1] + 0.08, top[2]], r: [0.3, 0.17, 0.2] });

  // 穿透的孔洞：大多横穿，两个斜穿
  const holes: Hole[] = [];
  for (let i = 0; i < 6; i++) {
    const c = spine(0.16 + (i / 5) * 0.72 + (rnd() - 0.5) * 0.06);
    const th = rnd() * Math.PI;
    const tilt = (i % 3 === 2 ? 0.9 : 0.3) * (rnd() - 0.5);
    const d: V3 = [Math.cos(th) * Math.cos(tilt), Math.sin(tilt), Math.sin(th) * Math.cos(tilt) * 1.6];
    const n = len3(d[0], d[1], d[2]);
    const o: V3 = [c[0] + (rnd() - 0.5) * 0.12, c[1], c[2]];
    holes.push({ a: [o[0] - (d[0] / n) * 1.2, o[1] - (d[1] / n) * 1.2, o[2] - (d[2] / n) * 1.2], b: [o[0] + (d[0] / n) * 1.2, o[1] + (d[1] / n) * 1.2, o[2] + (d[2] / n) * 1.2], r: 0.09 + rnd() * 0.05 });
  }
  // 不穿透的凹窝
  const pits: Pit[] = [];
  for (let i = 0; i < 12; i++) {
    const t = 0.08 + rnd() * 0.84;
    const c = spine(t);
    const w = widths[Math.min(widths.length - 1, Math.round(t * (widths.length - 1)))];
    const a = rnd() * Math.PI * 2;
    pits.push({ c: [c[0] + Math.cos(a) * w * 0.95, c[1] + (rnd() - 0.5) * 0.1, c[2] + Math.sin(a) * w * 0.7], r: 0.07 + rnd() * 0.06 });
  }
  return { height, lean, blobs, holes, pits, off: seed * 13.7 };
}

function stoneSDF(s: StoneSpec, x: number, y: number, z: number) {
  // 远离石身的空白区域直接返回，省掉大部分计算
  const hull = capsule(x, y, z, [0, -0.2, 0], [s.lean, s.height, 0], 0.78);
  if (hull > 0.2) return hull;

  let d = 1e9;
  for (const b of s.blobs) d = smin(d, ellipsoid(x, y, z, b.c, b.r), 0.2);
  // 皱：几层噪声让石面起伏、起棱；纵向拉长的一层像雨水冲出的竖向沟槽
  const o = s.off;
  d += 0.055 * vnoise(x * 2.4 + o, y * 2.4, z * 2.4) + 0.035 * vnoise(x * 5.5, y * 5.5 + o, z * 5.5) + 0.015 * vnoise(x * 12 + o, y * 12, z * 12);
  d += 0.03 * vnoise(x * 9 + o, y * 2.2, z * 9);
  for (const h of s.holes) d = smax(d, -capsule(x, y, z, h.a, h.b, h.r), 0.06);
  for (const p of s.pits) d = smax(d, -len3(x - p.c[0], y - p.c[1], z - p.c[2]) + p.r, 0.04);
  return Math.max(d, -y); // 切平底面，立在地上
}

/** 离孔洞、凹窝多近：越近越暗，孔里就是一点浓墨 */
function cavity(s: StoneSpec, x: number, y: number, z: number) {
  let m = 1e9;
  for (const h of s.holes) m = Math.min(m, capsule(x, y, z, h.a, h.b, h.r));
  for (const p of s.pits) m = Math.min(m, len3(x - p.c[0], y - p.c[1], z - p.c[2]) - p.r);
  return m;
}

function buildGeometry(seed: number, res: number) {
  const s = makeSpec(seed);
  const half = res / 2;
  const S = s.height / 2 + 0.12; // 采样立方体半边长
  const C: V3 = [s.lean / 2, s.height / 2 - 0.02, 0];
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, 120000);
  mc.isolation = 0;
  const f = mc.field;
  for (let k = 0; k < res; k++) {
    const z = C[2] + (S * (k - half)) / half;
    for (let j = 0; j < res; j++) {
      const y = C[1] + (S * (j - half)) / half;
      for (let i = 0; i < res; i++) f[i + j * res + k * res * res] = -stoneSDF(s, C[0] + (S * (i - half)) / half, y, z);
    }
  }
  mc.update();
  const n = mc.count;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mc.positionArray.slice(0, n * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(mc.normalArray.slice(0, n * 3), 3));
  geo.scale(S, S, S);
  geo.translate(C[0], C[1], C[2]);
  mc.geometry.dispose();

  // 顶点色：石色 + 斑驳 + 孔洞压暗
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const base = new THREE.Color(0xb3ada2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const dark = 1 - THREE.MathUtils.smoothstep(cavity(s, x, y, z), 0.0, 0.16);
    const mottle = 0.9 + 0.1 * vnoise(x * 3 + 50, y * 3, z * 3);
    const v = mottle * (1 - 0.62 * dark) * (0.82 + 0.18 * Math.min(1, y / 0.6)); // 根部略深，像沾了土
    col[i * 3] = base.r * v;
    col[i * 3 + 1] = base.g * v;
    col[i * 3 + 2] = base.b * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

/** 一块太湖峰石，seed 不同形态不同 */
export function taihuStone(seed: number, lowQuality = false) {
  return new THREE.Mesh(buildGeometry(seed, lowQuality ? 48 : 64), lam(0xffffff, { vertexColors: true }));
}
