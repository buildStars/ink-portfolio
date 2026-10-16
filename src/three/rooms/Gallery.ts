import * as THREE from 'three';
import { Room } from './Room';
import { projects } from '../../content';
import {
  CN_NUM, FONT_BRUSH, billboard, birdsTex, boat, canvasTex, cloudTex, fitVertical,
  inkLandscape, lake, lam, mountain, mulberry32, place, seal, vtext,
} from '../paint';
import { stoneLantern } from '../garden';
import { lotusPatch, woodenDeck } from '../roomDecor';

const SPACING = 2.35;
const VIEW_DIST = 9.6;

/** 作品集：竹竿上挂一排挂轴，每幅一个项目 */
export class Gallery extends Room {
  readonly id = 'gallery' as const;
  fov = 46;
  dragAxis = 'x' as const;
  scrollSpeed = 0.006;
  private xs: number[] = [];
  private scrolls: THREE.Group[] = [];
  private leftEdge = 0;
  private rightEdge = 0;
  private selected = -1;

  build() {
    const g = this.group;
    const n = projects.length;
    this.xs = projects.map((_, i) => (i - (n - 1) / 2) * SPACING);
    this.leftEdge = this.xs[0] - 0.9;
    this.rightEdge = this.xs[n - 1] + 0.9;

    // 远景
    const face = new THREE.Vector2(0, 9);
    g.add(mountain(8, -30, -55, 70, 26, 0.6, face));
    g.add(mountain(27, 34, -80, 90, 34, 0.42, face));
    g.add(mountain(61, 0, -150, 220, 70, 0.22, face));
    place(lake(400), 0, -0.35, -100, g);
    place(new THREE.Mesh(new THREE.CircleGeometry(2.0, 48), new THREE.MeshBasicMaterial({ color: 0xc8301f, fog: false })), 17.5, 15.2, -34, g);
    place(billboard(birdsTex(13), 14, 7, { fog: false, opacity: 0.85 }), -6, 7.6, -22, g);
    const clouds = cloudTex(17);
    place(billboard(clouds, 6, 1.5), -3.2, 0.7, -2.5, g);
    place(billboard(clouds, 5.5, 1.375), 4.2, 0.5, -3.5, g);

    // 竹竿
    const span = this.xs[n - 1] - this.xs[0] + 2.4;
    const pole = place(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, span, 16), lam(0x4a5238)), (this.xs[0] + this.xs[n - 1]) / 2, 4.45, 0, g);
    pole.rotation.z = Math.PI / 2;
    const knotGeo = new THREE.TorusGeometry(0.062, 0.012, 6, 16);
    const knotMat = lam(0x2f3424);
    for (let x = -span / 2; x <= span / 2; x += 0.42) {
      place(new THREE.Mesh(knotGeo, knotMat), pole.position.x + x, 4.45, 0, g).rotation.y = Math.PI / 2;
    }
    // 水上木平台；竹竿由两根木柱撑起
    const deckL = this.leftEdge - 0.9;
    const deckR = this.rightEdge + 0.9;
    place(woodenDeck(deckR - deckL, 2.6), (deckL + deckR) / 2, 0.25, 0.2, g);
    const postMat = lam(0x3a3632);
    for (const x of [pole.position.x - span / 2 + 0.1, pole.position.x + span / 2 - 0.1]) {
      place(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.3), postMat), x, 0.36, 0, g);
      place(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 4.3, 10), postMat), x, 2.5, 0, g);
      place(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), postMat), x, 4.68, 0, g);
    }
    for (const x of [deckL + 0.45, deckR - 0.45]) place(stoneLantern(), x, 0.28, 0.9, g);

    // 前景荷塘、远处小船
    const mid = (this.leftEdge + this.rightEdge) / 2;
    // 荷塘铺在平台后方的水面上，从平台上方望过去正好入画
    place(lotusPatch(41, 44, 7, 1.8), mid, -0.35, -4.8, g);
    const skiff = place(boat(), mid + 11, -0.28, -22, g);
    skiff.rotation.y = -0.4;
    skiff.scale.setScalar(1.4);

    // 挂轴
    projects.forEach((p, i) => {
      const tex = canvasTex(400, 1000, (c, w, h) => {
        const rnd = mulberry32(101 + i * 97);
        c.fillStyle = '#c4ccc6';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#ddd8c8';
        c.fillRect(0, 110, w, 12);
        c.fillRect(0, h - 160, w, 12);
        c.fillStyle = '#f4efe1';
        c.fillRect(34, 150, w - 68, h - 330);
        inkLandscape(c, 40, 400, w - 150, 420, 101 + i * 97);
        const { size, step } = fitVertical(p.title, 340, 76);
        vtext(c, p.title, w - 72, 180 + size / 2, step, `${size}px ${FONT_BRUSH}`, '#161616');
        seal(c, w - 94, 180 + [...p.title].length * step + 8, 44, '印', i + 30);
      });
      const grp = place(new THREE.Group(), this.xs[i], 2.95, 0, g);
      grp.rotation.y = (mulberry32(i + 7)() - 0.5) * 0.1;
      const paper = place(new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.5), new THREE.MeshBasicMaterial({ map: tex, fog: false, side: THREE.DoubleSide })), 0, 0, 0, grp);
      const rodMat = lam(0x3a2f26);
      const rodBMat = lam(0x2c241d);
      const rod = place(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.06, 10), rodMat), 0, 1.25, 0.01, grp);
      rod.rotation.z = Math.PI / 2;
      const rodB = place(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.12, 10), rodBMat), 0, -1.26, 0.01, grp);
      rodB.rotation.z = Math.PI / 2;
      for (const s of [-1, 1]) {
        place(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 10), lam(0xcfc7b4)), s * 0.59, -1.26, 0.01, grp).rotation.z = Math.PI / 2;
      }
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.45, 1.27, 0.01), new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0.45, 1.27, 0.01),
      ]);
      grp.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x222222 })));
      this.interactive(paper, `project:${i}`, `《${p.title}》${p.summary}`, [rodMat, rodBMat]);
      this.labels.push({ text: p.title, sub: p.year, anchor: this.w(this.xs[i], 1.45, 0.08) });
      grp.userData.ph = i * 1.3;
      this.scrolls.push(grp);
    });
  }

  private panRange() {
    const halfW = VIEW_DIST * Math.tan(THREE.MathUtils.degToRad(this.fov / 2)) * this.ctx.camera.aspect;
    const center = (this.leftEdge + this.rightEdge) / 2;
    if (this.rightEdge - this.leftEdge <= halfW * 2) return [center, center];
    return [this.leftEdge + halfW, this.rightEdge - halfW];
  }

  portalView() {
    const [a] = this.panRange();
    return { pos: this.w(a, 3.0, VIEW_DIST), target: this.w(a, 3.15, 0) };
  }

  enter() {
    this.selected = -1;
    const [a, b] = this.panRange();
    this.scrollMin = a;
    this.scrollMax = b;
    this.scroll = a;
    this.update(0, 0);
    this.ctx.rig.snap();
    this.ctx.rig.curPos.z += 3;
  }

  update(_dt: number, t: number) {
    const [a, b] = this.panRange();
    this.scrollMin = a;
    this.scrollMax = b;
    this.scroll = THREE.MathUtils.clamp(this.scroll, a, b);
    const rig = this.ctx.rig;
    if (this.selected >= 0) {
      const sx = this.xs[this.selected];
      if (this.isPortrait) {
        rig.pos.copy(this.w(sx, 1.8, 7.4));
        rig.target.copy(this.w(sx, 1.8, 0));
      } else {
        rig.pos.copy(this.w(sx + 0.95, 2.95, 5.0));
        rig.target.copy(this.w(sx + 0.95, 2.95, 0));
      }
    } else {
      rig.pos.copy(this.w(this.scroll, 3.0, VIEW_DIST));
      rig.target.copy(this.w(this.scroll, 3.15, 0));
    }
    for (const s of this.scrolls) s.rotation.z = Math.sin(t * 0.8 + s.userData.ph) * 0.015;
  }

  addScroll(delta: number) {
    if (this.selected >= 0) return;
    super.addScroll(delta);
  }

  click(key: string) {
    if (!key.startsWith('project:')) return;
    const i = Number(key.slice(8));
    const p = projects[i];
    this.selected = i;
    this.scroll = THREE.MathUtils.clamp(this.xs[i], this.scrollMin, this.scrollMax);
    this.ctx.openCard({
      kicker: `作品 · ${CN_NUM[i] ?? i + 1}`,
      title: p.title,
      meta: p.year,
      body: p.description,
      tags: p.tags,
      actions: p.link ? [{ label: '打开项目', href: p.link }] : [],
      item: p.id,
    });
  }

  openItem(item: string) {
    const i = projects.findIndex((p) => p.id === item);
    if (i < 0) return false;
    this.click(`project:${i}`);
    return true;
  }

  onCardClosed() {
    this.selected = -1;
  }
}
