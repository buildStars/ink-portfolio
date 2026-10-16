import * as THREE from 'three';
import { Room } from './Room';
import { site, socials } from '../../content';
import {
  FONT_BRUSH, FONT_SERIF, bambooTex, billboard, canvasTex, fitVertical, inkLandscape, lam, lantern,
  mulberry32, pineTex, place, plumTex, seal, vtext,
} from '../paint';
import { bookshelf, guqin, incenseBurner, landscapeScrollTex } from '../roomDecor';

const PANEL_W = 0.92;
const SCREEN_Z = -2.4;

/** 社交媒体：书房里一架屏风，每扇是一个平台账号 */
export class Study extends Room {
  readonly id = 'social' as const;
  fogDensity = 0.008;
  fov = 55;
  dragAxis = 'x' as const;
  scrollSpeed = 0.004;
  private lamp: THREE.Object3D | null = null;
  private burner: ReturnType<typeof incenseBurner> | null = null;

  build() {
    const g = this.group;
    const rnd = mulberry32(91);
    const n = socials.length;
    const half = Math.max(0, (n * PANEL_W * 0.95) / 2 - 1.3);
    this.scrollMin = -half;
    this.scrollMax = half;

    // 地板
    const floorTex = canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = '#b9b1a3';
      c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 64) {
        c.fillStyle = `rgb(${(170 + rnd() * 20) | 0},${(160 + rnd() * 20) | 0},${(146 + rnd() * 20) | 0})`;
        c.fillRect(0, y + 2, w, 60);
        c.strokeStyle = 'rgba(60,50,40,0.25)';
        for (let k = 0; k < 4; k++) {
          const yy = y + 10 + rnd() * 44;
          c.beginPath();
          c.moveTo(0, yy);
          c.bezierCurveTo(w * 0.3, yy + 4, w * 0.7, yy - 4, w, yy);
          c.stroke();
        }
      }
    });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(3, 3);
    const floor = place(new THREE.Mesh(new THREE.PlaneGeometry(12, 10), lam(0xffffff, { map: floorTex })), 0, 0, 0, g);
    floor.rotation.x = -Math.PI / 2;

    // 墙：后墙开圆窗
    const wallMat = lam(0xf1ede4);
    const shape = new THREE.Shape();
    shape.moveTo(-6, 0);
    shape.lineTo(6, 0);
    shape.lineTo(6, 3.8);
    shape.lineTo(-6, 3.8);
    shape.closePath();
    const win = new THREE.Path();
    win.absarc(-3.1, 2.0, 1.15, 0, Math.PI * 2, true);
    shape.holes.push(win);
    place(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: false, curveSegments: 48 }), wallMat), 0, 0, -4.45, g);
    place(new THREE.Mesh(new THREE.RingGeometry(1.15, 1.27, 72), lam(0x3a3632)), -3.1, 2.0, -4.19, g);
    for (const [w, h, x, y] of [[0.05, 2.3, -3.1, 2.0], [2.3, 0.05, -3.1, 2.0]]) {
      place(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), lam(0x3a3632)), x, y, -4.3, g);
    }
    place(billboard(bambooTex(15), 3.2, 6.4), -3.3, 2.6, -6, g);
    place(billboard(plumTex(33), 3, 3), -1.8, 2.4, -7, g);
    for (const s of [-1, 1]) {
      const side = place(new THREE.Mesh(new THREE.PlaneGeometry(10, 3.8), wallMat), s * 6, 1.9, 0.5, g);
      side.rotation.y = -s * Math.PI / 2;
    }
    const ceil = place(new THREE.Mesh(new THREE.PlaneGeometry(12, 10), lam(0xd7d2c8)), 0, 3.8, 0, g);
    ceil.rotation.x = Math.PI / 2;
    for (let z = -4; z < 5; z += 1.5) place(new THREE.Mesh(new THREE.BoxGeometry(12, 0.16, 0.16), lam(0x3a3632)), 0, 3.7, z, g);
    place(new THREE.Mesh(new THREE.BoxGeometry(12, 0.25, 0.05), lam(0x77736b)), 0, 0.125, -4.18, g);

    // 右墙挂轴
    const hangTex = canvasTex(300, 760, (c, w, h) => {
      c.fillStyle = '#c4ccc6';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#f4efe1';
      c.fillRect(26, 70, w - 52, h - 150);
      vtext(c, site.tagline[0] ?? '', w / 2, 170, 100, `92px ${FONT_BRUSH}`, '#161616');
      seal(c, w / 2 + 40, h - 150, 40, '印', 77);
    });
    place(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.28), new THREE.MeshBasicMaterial({ map: hangTex })), 3.4, 2.15, -4.18, g);

    // 屏风
    socials.forEach((s, i) => {
      const x = (i - (n - 1) / 2) * PANEL_W * 0.95;
      const grp = place(new THREE.Group(), x, 0, SCREEN_Z + (i % 2 ? -0.13 : 0.13), g);
      grp.rotation.y = i % 2 ? -0.28 : 0.28;
      place(new THREE.Mesh(new THREE.BoxGeometry(PANEL_W, 2.1, 0.05), lam(0x2e2925)), 0, 1.2, 0, grp);
      for (const fx of [-0.36, 0.36]) place(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.3), lam(0x2e2925)), fx, 0.04, 0, grp);
      const tex = canvasTex(300, 700, (c, w, h) => {
        c.fillStyle = '#efe8d8';
        c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(60,55,50,0.4)';
        c.lineWidth = 3;
        c.strokeRect(16, 16, w - 32, h - 32);
        inkLandscape(c, 20, h * 0.42, w - 40, h * 0.45, 300 + i * 13, false, "#efe8d8");
        const { size, step } = fitVertical(s.platform, 330, 92);
        vtext(c, s.platform, w / 2 + 40, 70 + size / 2, step, `${size}px ${FONT_BRUSH}`, '#141414');
        c.font = `500 24px ${FONT_SERIF}`;
        c.fillStyle = '#3a3633';
        c.textAlign = 'center';
        c.fillText(s.handle, w / 2, h - 50);
        seal(c, w / 2 - 70, 80, 40, '印', 60 + i);
      });
      const paperMat = lam(0xffffff, { map: tex });
      const paper = place(new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W - 0.1, 1.98), paperMat), 0, 1.2, 0.03, grp);
      this.interactive(paper, `social:${i}`, `${s.platform} · ${s.handle}`, [paperMat]);
    });

    // 地毯
    const rugTex = canvasTex(512, 320, (c, w, h) => {
      c.fillStyle = '#8a847a';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#3a3633';
      c.lineWidth = 10;
      c.strokeRect(18, 18, w - 36, h - 36);
      c.lineWidth = 4;
      c.strokeRect(40, 40, w - 80, h - 80);
      c.fillStyle = '#a39d92';
      c.fillRect(60, 60, w - 120, h - 120);
    });
    const rug = place(new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.6), lam(0xffffff, { map: rugTex })), 0, 0.005, -1.2, g);
    rug.rotation.x = -Math.PI / 2;

    // 盆景
    place(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.32, 0.4), lam(0x5a554e)), -3.9, 0.16, -2.4, g);
    place(billboard(pineTex(44), 1.6, 2.4), -3.9, 1.5, -2.4, g);

    // 后墙左侧博古架
    place(bookshelf(), -5.1, 0, -3.98, g);

    // 屏风上方的山水横幅
    place(new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.88), new THREE.MeshBasicMaterial({ map: landscapeScrollTex(66) })), 0.5, 3.0, -4.17, g);
    for (const x of [-1.03, 2.03]) place(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.96, 8), lam(0x2c241d)), x, 3.0, -4.15, g);

    // 前景古琴与蒲团
    const qin = place(guqin(), -2.4, 0, 0.9, g);
    qin.rotation.y = 0.3;
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.1, 24), lam(0x6f6a62)), -2.25, 0.05, 1.55, g);

    // 屏风旁的香炉，青烟袅袅
    this.burner = incenseBurner();
    place(this.burner.group, 1.9, 0, -1.2, g);

    // 书案与文房（放在右前方，不挡屏风）
    const desk = place(new THREE.Group(), 3.1, 0, -0.9, g);
    desk.rotation.y = -0.5;
    const woodMat = lam(0x3b332c);
    place(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.85), woodMat), 0, 0.78, 0, desk);
    for (const [lx, lz] of [[-1.0, -0.35], [1.0, -0.35], [-1.0, 0.35], [1.0, 0.35]]) {
      place(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.74, 0.08), woodMat), lx, 0.37, lz, desk);
    }
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.12, 24), lam(0x6f6a62)), 0, 0.06, 0.85, desk);
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 16), lam(0x6b6660)), -0.75, 0.93, -0.15, desk);
    for (let k = 0; k < 5; k++) {
      const b = place(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.42, 6), lam(0x2a2622)), -0.75 + (k - 2) * 0.025, 1.08, -0.15 + (rnd() - 0.5) * 0.04, desk);
      b.rotation.z = (k - 2) * 0.08;
    }
    place(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.22), lam(0x2a2826)), -0.2, 0.845, 0.05, desk);
    const sheetTex = canvasTex(512, 352, (c, w, h) => {
      c.fillStyle = '#f6f1e4';
      c.fillRect(0, 0, w, h);
      c.font = `92px ${FONT_BRUSH}`;
      c.fillStyle = '#161616';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(site.title, w / 2, h / 2);
      seal(c, w - 90, h - 90, 46, '印', 88);
    });
    const sheet = place(new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.5), lam(0xffffff, { map: sheetTex })), 0.45, 0.825, 0.05, desk);
    sheet.rotation.x = -Math.PI / 2;
    place(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 0.04), lam(0x2a2622)), 0.45, 0.835, -0.17, desk);
    place(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.07), lam(0xb8281d)), 0.9, 0.865, 0.15, desk);

    this.lamp = place(lantern(), 4.3, 2.9, -2.6, g);
    this.lamp.scale.setScalar(1.3);
  }

  portalView() {
    const dist = this.isPortrait ? 6.6 : 4.6;
    return { pos: this.w(0, 1.75, dist), target: this.w(0, 1.35, SCREEN_Z) };
  }

  enter() {
    this.scroll = this.scrollMin;
    this.update(0, 0);
    this.ctx.rig.snap();
    this.ctx.rig.curPos.z += 2.5;
  }

  update(_dt: number, t: number) {
    const dist = this.isPortrait ? 6.6 : 4.6;
    this.ctx.rig.pos.copy(this.w(this.scroll, 1.75, dist));
    this.ctx.rig.target.copy(this.w(this.scroll * 0.9, 1.35, SCREEN_Z));
    if (this.lamp) this.lamp.rotation.z = Math.sin(t * 0.9) * 0.04;
    this.burner?.update(t);
  }

  click(key: string) {
    if (!key.startsWith('social:')) return;
    const s = socials[Number(key.slice(7))];
    this.ctx.openCard({ kicker: '社交', title: s.platform, meta: s.handle, body: [s.description], actions: [{ label: '前往主页', href: s.href }] });
  }
}
