import * as THREE from 'three';
import { billboard, canvasTex, koiTex, lakeTex, lam, mulberry32, place, rockGeometry } from './paint';

/** 园林造景部件：石灯、石桌石凳、花盆、锦鲤池（门外的太湖石在 taihu.ts） */

const STONE = 0xbab5ab;

/** 石灯笼，约 1.7m，灯室里透出暖光 */
export function stoneLantern() {
  const grp = new THREE.Group();
  const stone = lam(STONE);
  place(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.15, 6), stone), 0, 0.075, 0, grp);
  place(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.75, 6), stone), 0, 0.525, 0, grp);
  place(new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.2, 0.12, 6), stone), 0, 0.96, 0, grp);
  place(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), new THREE.MeshBasicMaterial({ color: 0xe8742a })), 0, 1.17, 0, grp);
  for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    place(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.06), stone), x * 0.15, 1.18, z * 0.15, grp);
  }
  place(new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.28, 6), stone), 0, 1.48, 0, grp);
  place(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), stone), 0, 1.66, 0, grp);
  return grp;
}

/** 石桌（刻棋盘）与四个鼓凳 */
export function stoneTableSet() {
  const grp = new THREE.Group();
  const stone = lam(STONE);
  const board = canvasTex(256, 256, (c, w) => {
    c.fillStyle = '#c9c4ba';
    c.fillRect(0, 0, w, w);
    c.strokeStyle = 'rgba(30,30,30,0.6)';
    c.lineWidth = 1.5;
    for (let i = 0; i < 13; i++) {
      const p = 32 + i * 16;
      c.beginPath();
      c.moveTo(32, p);
      c.lineTo(224, p);
      c.moveTo(p, 32);
      c.lineTo(p, 224);
      c.stroke();
    }
  });
  place(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 32), [stone, lam(0xffffff, { map: board }), stone]), 0, 0.78, 0, grp);
  place(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.74, 16), stone), 0, 0.37, 0, grp);
  const drum = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.17, 0), new THREE.Vector2(0.22, 0.21), new THREE.Vector2(0.17, 0.42), new THREE.Vector2(0, 0.42),
  ], 20);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    place(new THREE.Mesh(drum, stone), Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95, grp);
  }
  return grp;
}

/** 花盆 + 一株植物贴片 */
export function plantPot(tex: THREE.Texture, w: number, h: number) {
  const grp = new THREE.Group();
  const pot = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.22, 0), new THREE.Vector2(0.3, 0.32), new THREE.Vector2(0.34, 0.42), new THREE.Vector2(0.3, 0.44), new THREE.Vector2(0, 0.44),
  ], 24);
  place(new THREE.Mesh(pot, lam(0x8a847a)), 0, 0, 0, grp);
  place(billboard(tex, w, h), 0, 0.4 + h / 2, 0, grp);
  return grp;
}

interface Koi {
  obj: THREE.Group;
  r: number;
  speed: number;
  ph: number;
}

/** 椭圆锦鲤池：石砌池壁、水面、荷叶荷花、游动的锦鲤 */
export class KoiPond {
  readonly group = new THREE.Group();
  private fish: Koi[] = [];

  constructor(readonly rx: number, readonly rz: number) {
    const g = this.group;
    const rnd = mulberry32(61);

    const wall = place(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.5, 64, 1, true), lam(0x6f6a62, { side: THREE.BackSide })), 0, -0.24, 0, g);
    wall.scale.set(rx, 1, rz);
    const water = lakeTex().clone();
    water.repeat.set(rx * 0.8, rz * 0.8);
    water.needsUpdate = true;
    const surface = place(new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ map: water, color: 0xd2cec4 })), 0, -0.14, 0, g);
    surface.rotation.x = -Math.PI / 2;
    surface.scale.set(rx, rz, 1);

    // 池沿石
    const rim = lam(0xb0aba1);
    const n = Math.round((rx + rz) * 5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = place(new THREE.Mesh(rockGeometry(300 + i, 0.55, 2), rim), Math.cos(a) * (rx + 0.08), 0.04, Math.sin(a) * (rz + 0.08), g);
      r.scale.setScalar(0.32 + rnd() * 0.2);
      r.rotation.y = rnd() * 6;
    }

    // 荷叶与荷花
    const padMat = lam(0x5a6e48, { side: THREE.DoubleSide });
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 0.35 + rnd() * 0.55;
      const pad = place(new THREE.Mesh(new THREE.CircleGeometry(0.2 + rnd() * 0.15, 20, 0.3, Math.PI * 2 - 0.3), padMat), Math.cos(a) * rx * d, -0.125, Math.sin(a) * rz * d, g);
      pad.rotation.set(-Math.PI / 2, 0, rnd() * 6);
      if (i % 3 === 0) {
        const flower = place(new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), lam(0xe07a8a)), pad.position.x, -0.07, pad.position.z, g);
        flower.scale.set(1, 0.75, 1);
      }
    }

    // 锦鲤
    const kinds: (0 | 1 | 2)[] = [0, 0, 1, 2, 0, 1];
    kinds.forEach((kind, i) => {
      const obj = place(new THREE.Group(), 0, -0.12, 0, g);
      const body = place(new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.72), new THREE.MeshBasicMaterial({ map: koiTex(kind, 70 + i), transparent: true, depthWrite: false })), 0, 0, 0, obj);
      body.rotation.x = -Math.PI / 2;
      this.fish.push({ obj, r: 0.35 + rnd() * 0.45, speed: (0.18 + rnd() * 0.22) * (i % 2 ? 1 : -1), ph: rnd() * 6 });
    });
  }

  update(t: number) {
    for (const f of this.fish) {
      const a = f.ph + t * f.speed;
      const wob = 1 + Math.sin(a * 3 + f.ph) * 0.12;
      const x = Math.cos(a) * this.rx * f.r * wob;
      const z = Math.sin(a) * this.rz * f.r * wob;
      const vx = -Math.sin(a) * this.rx * f.speed;
      const vz = Math.cos(a) * this.rz * f.speed;
      f.obj.position.x = x;
      f.obj.position.z = z;
      f.obj.rotation.y = Math.atan2(-vx, -vz) + Math.sin(t * 7 + f.ph) * 0.12;
    }
  }
}
