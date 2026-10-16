import * as THREE from 'three';
import { Room } from './Room';
import { contacts } from '../../content';
import type { CardAction } from '../../store';
import {
  FONT_BRUSH, FONT_SERIF, billboard, birdsTex, boat, canvasTex, lake, lam, lantern, mountain,
  mulberry32, place, reedTex, rockGeometry, willowTex,
} from '../paint';
import { kiosk, lotusPatch } from '../roomDecor';

const START_Z = 8.5;

/** 联系：沿栈桥走向渡口，木牌是各种联系方式 */
export class Ferry extends Room {
  readonly id = 'contact' as const;
  fogDensity = 0.02;
  fov = 58;
  scrollMax = 23;
  private lamp: THREE.Object3D | null = null;
  private skiff: THREE.Object3D | null = null;

  build() {
    const g = this.group;
    const rnd = mulberry32(55);

    place(lake(500), 0, 0, -100, g);
    const shore = place(new THREE.Mesh(new THREE.PlaneGeometry(60, 30), lam(0xd2cdc2)), 0, 0.03, 21, g);
    shore.rotation.x = -Math.PI / 2;
    place(new THREE.Mesh(new THREE.BoxGeometry(60, 0.5, 0.6), lam(0x9a958b)), 0, 0.1, 6.1, g);

    // 栈桥
    const plankCount = 80;
    const planks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.07, 0.3), lam(0x8d867b), plankCount);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < plankCount; i++) {
      const z = 6.2 - i * 0.34;
      const wide = z < -17;
      q.setFromEuler(e.set(0, (rnd() - 0.5) * 0.03, 0));
      m4.compose(new THREE.Vector3(0, 0.45 + (rnd() - 0.5) * 0.02, z), q, new THREE.Vector3(wide ? 4 : 2.2 + rnd() * 0.1, 1, 1));
      planks.setMatrixAt(i, m4);
    }
    g.add(planks);
    const dark = lam(0x3a3632);
    for (const x of [-0.9, 0.9]) place(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 24), dark), x, 0.37, -5.8, g);
    const postGeo = new THREE.CylinderGeometry(0.08, 0.09, 1.6, 8);
    for (let z = 5.5; z > -18; z -= 2) {
      for (const x of [-1.15, 1.15]) place(new THREE.Mesh(postGeo, dark), x, 0.2, z, g);
    }
    for (const x of [-2, 2]) place(new THREE.Mesh(postGeo, dark), x, 0.2, -18.5, g);

    // 木牌
    const n = contacts.length;
    contacts.forEach((c, i) => {
      const side = i % 2 ? 1 : -1;
      const z = 3.5 - i * (n > 1 ? Math.min(4, 14 / (n - 1)) : 0);
      place(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.35, 8), dark), side * 1.25, 1.12, z, g);
      const tex = canvasTex(512, 210, (x, w, h) => {
        x.fillStyle = '#d8ccb4';
        x.fillRect(0, 0, w, h);
        x.strokeStyle = 'rgba(80,60,40,0.25)';
        x.lineWidth = 2;
        for (let k = 0; k < 9; k++) {
          const y = 14 + k * 22 + rnd() * 6;
          x.beginPath();
          x.moveTo(0, y);
          x.bezierCurveTo(w * 0.3, y + 6, w * 0.6, y - 6, w, y + 3);
          x.stroke();
        }
        x.strokeStyle = '#4a3f33';
        x.lineWidth = 8;
        x.strokeRect(4, 4, w - 8, h - 8);
        x.fillStyle = '#161616';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.font = `${c.label.length > 4 ? 72 : 96}px ${FONT_BRUSH}`;
        x.fillText(c.label, w / 2, 86);
        x.font = `500 26px ${FONT_SERIF}`;
        x.fillStyle = '#3a3633';
        x.fillText(c.value, w / 2, 162);
      });
      const wood = lam(0xb7aa92);
      const face = lam(0xffffff, { map: tex });
      const board = place(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.57, 0.06), [wood, wood, wood, wood, face, wood]), side * 1.25, 2.05, z, g);
      board.rotation.y = -side * 0.42;
      board.rotation.z = (rnd() - 0.5) * 0.08;
      this.interactive(board, `contact:${i}`, `${c.label} · ${c.value}`, [face]);
    });

    // 渡口：灯杆、渔舟
    // 灯杆立在平台右前角，灯笼挑向栈桥
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 2.8, 8), dark), 1.75, 1.85, -17.4, g);
    place(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), dark), 1.4, 3.2, -17.4, g);
    this.lamp = place(lantern(), 1.1, 2.55, -17.4, g);
    // 渡亭：偏左放，不挡对岸的塔
    place(kiosk('渡'), -0.9, 0.48, -19.4, g);
    for (const x of [-2, 2]) place(new THREE.Mesh(postGeo, dark), x, 0.2, -20.6, g);
    const b = place(boat(), 2.7, 0.08, -18.6, g);
    b.rotation.y = Math.PI / 2 - 0.2;
    b.scale.setScalar(1.4);

    // 对岸：岛与塔
    const isle = place(new THREE.Mesh(rockGeometry(66, 0.5, 3), lam(0xc4c0b6)), 7, 0.2, -62, g);
    isle.scale.set(6, 1.6, 4);
    const tower = place(new THREE.Group(), 7, 1, -62, g);
    let y = 0;
    for (let i = 0; i < 7; i++) {
      const r = 1.2 - i * 0.12;
      const hgt = 1.0 - i * 0.05;
      place(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.85, hgt, 8), lam(0xcfcac0)), 0, y + hgt / 2, 0, tower);
      place(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 1.35, 0.25, 8), lam(0x3a3632)), 0, y + hgt + 0.12, 0, tower);
      y += hgt + 0.25;
    }
    place(new THREE.Mesh(new THREE.ConeGeometry(0.15, 1.2, 8), lam(0x3a3632)), 0, y + 0.6, 0, tower);

    // 栈桥两侧荷塘、湖上漂着的小船
    place(lotusPatch(51, 30, 2.6, 4.5), -4.2, 0, -2, g);
    place(lotusPatch(52, 34, 3.2, 5), 4.6, 0, -9, g);
    this.skiff = place(boat(), -7, 0.05, -14, g);
    this.skiff.rotation.y = 0.3;
    this.skiff.scale.setScalar(1.2);

    // 岸边芦苇、垂柳，远山飞鸟
    const reeds = reedTex(8);
    place(billboard(reeds, 4, 4), -3.6, 1.6, 5.2, g);
    place(billboard(reeds, 3.4, 3.4), 3.8, 1.3, 4.6, g).rotation.y = 0.4;
    place(billboard(reeds, 3, 3), -2.6, 1.0, -9, g).rotation.y = -0.3;
    place(billboard(willowTex(3), 4.4, 8.8), -5.2, 4.4, 8.5, g).rotation.y = 0.3;
    const face = new THREE.Vector2(0, 9);
    g.add(mountain(81, -30, -70, 80, 30, 0.55, face, 0));
    g.add(mountain(82, 40, -95, 100, 38, 0.4, face, 0));
    g.add(mountain(83, 0, -170, 240, 80, 0.22, face, 0));
    place(billboard(birdsTex(41), 14, 7, { fog: false, opacity: 0.8 }), 10, 10, -40, g);
  }

  portalView() {
    return { pos: this.w(0, 2.1, START_Z), target: this.w(0, 1.9, START_Z - 10) };
  }

  enter() {
    this.scroll = 0;
    this.update(0, 0);
    this.ctx.rig.snap();
    this.ctx.rig.curPos.y += 0.8;
    this.ctx.rig.curPos.z += 4;
  }

  update(_dt: number, t: number) {
    const z = START_Z - this.scroll;
    this.ctx.rig.pos.copy(this.w(0, 2.1, z));
    this.ctx.rig.target.copy(this.w(0, 1.9, z - 10));
    if (this.lamp) this.lamp.rotation.z = Math.sin(t * 1.1) * 0.05;
    if (this.skiff) {
      this.skiff.position.x = -7 + Math.sin(t * 0.06) * 3;
      this.skiff.position.y = 0.05 + Math.sin(t * 1.3) * 0.02;
    }
  }

  click(key: string) {
    if (!key.startsWith('contact:')) return;
    const c = contacts[Number(key.slice(8))];
    const actions: CardAction[] = [];
    if (c.action === 'mail') actions.push({ label: '写邮件', href: c.href ?? `mailto:${c.value}` });
    if (c.action === 'copy') actions.push({ label: '复制', copy: c.value });
    if (c.action === 'link' && c.href) actions.push({ label: '打开', href: c.href });
    this.ctx.openCard({ kicker: '联系', title: c.label, meta: c.value, body: [c.note], actions });
  }
}
