import * as THREE from 'three';
import { Room } from './Room';
import { about, site } from '../../content';
import {
  FONT_BRUSH, FONT_SERIF, billboard, birdsTex, canvasTex, cloudTex, fitVertical, lam, mountain,
  mulberry32, pineTex, place, rockGeometry, seal, vtext,
} from '../paint';
import { incenseBurner, paifang, waterfallTex } from '../roomDecor';

interface SkyLantern {
  obj: THREE.Object3D;
  speed: number;
  ph: number;
  x: number;
}

/** 关于我：沿山路而上，经历是路边石碑，技能是升空的孔明灯，山顶亭子里是自我介绍 */
export class Summit extends Room {
  readonly id = 'about' as const;
  fogDensity = 0.03;
  fov = 58;
  scrollSpeed = 0.0006;
  scrollMax = 1;
  private curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 8),
    new THREE.Vector3(0.8, 0.5, 2),
    new THREE.Vector3(-0.6, 1.4, -5),
    new THREE.Vector3(0.9, 2.6, -12),
    new THREE.Vector3(-0.4, 3.8, -19),
    new THREE.Vector3(0.3, 4.8, -25),
    new THREE.Vector3(0, 5.2, -29),
  ]);
  private skyLanterns: SkyLantern[] = [];
  private peak = new THREE.Vector3(0, 5.2, -31.6);
  private burner: ReturnType<typeof incenseBurner> | null = null;

  build() {
    const g = this.group;
    const rnd = mulberry32(77);

    // 石阶
    const steps = 120;
    const stepMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.14, 0.42), lam(0x9a958b), steps);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      q.setFromEuler(e.set(0, Math.atan2(tan.x, tan.z), 0));
      m4.compose(new THREE.Vector3(p.x, p.y - 0.07, p.z), q, new THREE.Vector3(1 + rnd() * 0.15, 1, 1));
      stepMesh.setMatrixAt(i, m4);
    }
    g.add(stepMesh);

    // 山体：路下的大石 + 路边碎石
    const rockMat = lam(0xc4c0b6);
    for (let t = 0; t <= 1.001; t += 0.045) {
      const p = this.curve.getPointAt(Math.min(t, 1));
      const big = place(new THREE.Mesh(rockGeometry(100 + t * 1000, 0.9, 3), rockMat), p.x + (rnd() - 0.5), p.y - 1.55, p.z, g);
      big.scale.set(2.3 + rnd(), 1.4, 2.2 + rnd());
      big.rotation.y = rnd() * 6;
      for (const s of [-1, 1]) {
        if (rnd() < 0.45) continue;
        const r = place(new THREE.Mesh(rockGeometry(200 + t * 1000 + s, 1.2, 3), rockMat), p.x + s * (1.4 + rnd() * 1.6), p.y - 0.25, p.z + (rnd() - 0.5), g);
        r.scale.setScalar(0.35 + rnd() * 0.45);
      }
    }
    const peakRock = place(new THREE.Mesh(rockGeometry(5, 0.7, 3), rockMat), this.peak.x, this.peak.y - 1.9, this.peak.z, g);
    peakRock.scale.set(4.2, 1.9, 4.2);

    // 松
    const pines = [pineTex(12), pineTex(19), pineTex(23)];
    [[0.22, -1], [0.47, 1], [0.7, -1], [0.93, 1]].forEach(([t, s], i) => {
      const p = this.curve.getPointAt(t);
      place(billboard(pines[i % 3], 2.8, 4.2), p.x + s * 2.6, p.y + 1.7, p.z - 0.5, g);
    });
    place(billboard(pines[0], 4, 6), this.peak.x + 3.4, this.peak.y + 2.6, this.peak.z - 1.2, g);

    // 经历石碑
    const exps = about.experiences;
    exps.forEach((x, i) => {
      const t = 0.22 + (exps.length > 1 ? (i * 0.54) / (exps.length - 1) : 0.3);
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      const side = i % 2 ? 1 : -1;
      const normal = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
      const pos = p.clone().addScaledVector(normal, side * 1.55);
      const grp = place(new THREE.Group(), pos.x, p.y, pos.z, g);
      place(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 0.42), lam(0x8a857c)), 0, 0.11, 0, grp);
      const tex = canvasTex(256, 568, (c, w, h) => {
        c.fillStyle = '#c9c4b9';
        c.fillRect(0, 0, w, h);
        c.strokeStyle = '#6f6a62';
        c.lineWidth = 6;
        c.strokeRect(14, 14, w - 28, h - 28);
        c.font = `600 26px ${FONT_SERIF}`;
        c.fillStyle = '#2a2622';
        c.textAlign = 'center';
        c.fillText(x.period, w / 2, 62);
        const { size, step } = fitVertical(x.title, 330, 86);
        vtext(c, x.title, w / 2, 110 + size / 2, step, `${size}px ${FONT_BRUSH}`, '#161616');
        seal(c, w / 2 - 20, h - 82, 40, '印', i + 50);
      });
      const stone = lam(0xc9c4b9);
      const faceMat = lam(0xffffff, { map: tex });
      const body = place(new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.6, 0.16), [stone, stone, stone, stone, faceMat, stone]), 0, 1.02, 0, grp);
      const look = this.curve.getPointAt(Math.max(t - 0.08, 0));
      grp.lookAt(this.w(look.x, p.y, look.z));
      this.interactive(body, `exp:${i}`, `${x.period} · ${x.title}`, [faceMat]);
    });

    // 山路起点的牌坊
    {
      const t = 0.14;
      const p = this.curve.getPointAt(t);
      const back = this.curve.getPointAt(t - 0.06);
      const gate = place(paifang('高山仰止'), p.x, p.y - 0.05, p.z, g);
      gate.lookAt(this.w(back.x, p.y, back.z));
    }

    // 侧崖瀑布，脚下一团水雾
    const fall = place(billboard(waterfallTex(), 2.8, 8.4, { side: THREE.FrontSide, fog: false }), -8.5, 4.2, -15, g);
    fall.rotation.y = 0.35;
    // 两块山石分立瀑布左右、略靠后，当作崖壁，不挡水流
    place(new THREE.Mesh(rockGeometry(808, 1.4, 3), rockMat), -10.6, 3.2, -17.2, g).scale.set(1.6, 3.2, 1.0);
    place(new THREE.Mesh(rockGeometry(809, 1.4, 3), rockMat), -6.5, 3.0, -17.4, g).scale.set(1.3, 3.0, 1.0);
    place(billboard(cloudTex(91, 2), 5, 1.25), -8.3, 0.2, -13.6, g);

    // 近山顶一段路两侧的石栏杆
    const railMat = lam(0xb0aba1);
    for (const side of [-1, 1]) {
      let prev: THREE.Vector3 | null = null;
      for (let t = 0.8; t <= 0.995; t += 0.025) {
        const p = this.curve.getPointAt(t);
        const tan = this.curve.getTangentAt(t);
        const nrm = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
        const post = p.clone().addScaledVector(nrm, side * 0.9);
        place(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.62, 0.11), railMat), post.x, post.y + 0.31, post.z, g);
        if (prev) {
          const mid = prev.clone().add(post).multiplyScalar(0.5);
          const len = prev.distanceTo(post);
          const rail = place(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, len), railMat), mid.x, mid.y + 0.5, mid.z, g);
          rail.lookAt(this.w(post.x, post.y + 0.5, post.z));
        }
        prev = post;
      }
    }

    // 山亭
    const pav = place(new THREE.Group(), this.peak.x, this.peak.y, this.peak.z, g);
    place(new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.4, 6), lam(0xa8a397)), 0, 0.2, 0, pav);
    const colMat = lam(0x34302c);
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      place(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 2.3, 10), colMat), Math.cos(a) * 1.85, 1.55, Math.sin(a) * 1.85, pav);
    }
    const beam = place(new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.05, 0.2, 6, 1, true), lam(0x3a3632, { side: THREE.DoubleSide })), 0, 2.75, 0, pav);
    beam.rotation.y = Math.PI / 6;
    const roofMat = lam(0x4a4642);
    const roof = place(new THREE.Mesh(new THREE.ConeGeometry(3.0, 1.5, 6), roofMat), 0, 3.6, 0, pav);
    roof.rotation.y = Math.PI / 6;
    place(new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), roofMat), 0, 4.42, 0, pav);
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.7, 12), lam(0x9d988e)), 0, 0.75, 0, pav);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      place(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.4, 10), lam(0x9d988e)), Math.cos(a) * 0.85, 0.6, Math.sin(a) * 0.85, pav);
    }
    const plaqueTex = canvasTex(512, 168, (c, w, h) => {
      c.fillStyle = '#2d2824';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#6d655c';
      c.lineWidth = 6;
      c.strokeRect(10, 10, w - 20, h - 20);
      c.font = `104px ${FONT_BRUSH}`;
      c.fillStyle = '#efe6cf';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(about.pavilion, w / 2, h / 2 + 6);
    });
    const plaqueMat = lam(0xffffff, { map: plaqueTex });
    place(new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.42), plaqueMat), 0, 2.4, 1.62, pav);
    const hit = place(new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 4.6, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })), 0, 2.3, 0, pav);
    this.burner = incenseBurner();
    place(this.burner.group, -1.3, 0.4, 1.0, pav);
    this.interactive(hit, 'bio', `${about.pavilion} · 关于${site.name}`, [plaqueMat, roofMat]);

    // 孔明灯 = 技能
    about.skills.forEach((skill, i) => {
      const tex = canvasTex(512, 256, (c, w, h) => {
        c.fillStyle = '#c8462a';
        c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(60,20,10,0.5)';
        c.lineWidth = 3;
        for (let x = 0; x < w; x += 64) {
          c.beginPath();
          c.moveTo(x, 0);
          c.lineTo(x, h);
          c.stroke();
        }
        c.fillStyle = '#1a1210';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        let size = 64;
        c.font = `${size}px ${FONT_BRUSH}`;
        while (c.measureText(skill).width > 220 && size > 24) c.font = `${(size -= 4)}px ${FONT_BRUSH}`;
        c.fillText(skill, w * 0.25, h / 2);
        c.fillText(skill, w * 0.75, h / 2);
      });
      const grp = new THREE.Group();
      const shellMat = lam(0xffffff, { map: tex, side: THREE.DoubleSide, emissive: 0x4a0e04, fog: false });
      const shell = place(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.8, 18, 1, true), shellMat), 0, 0, 0, grp);
      place(new THREE.Mesh(new THREE.CircleGeometry(0.34, 18), lam(0xc8462a, { fog: false })), 0, 0.4, 0, grp).rotation.x = -Math.PI / 2;
      place(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a2a })), 0, -0.36, 0, grp);
      const side = i % 2 ? 1 : -1;
      const x = side * (2.2 + rnd() * 4.5);
      place(grp, x, rnd() * 12, 2 - rnd() * 26, g);
      this.interactive(shell, 'skills', skill, [shellMat]);
      this.skyLanterns.push({ obj: grp, speed: 0.12 + rnd() * 0.14, ph: rnd() * 6, x });
    });

    // 云海、远山、飞鸟
    const ct = [cloudTex(17, 3), cloudTex(29, 4)];
    for (let i = 0; i < 14; i++) {
      const s = 8 + rnd() * 8;
      const side = i % 2 ? 1 : -1;
      place(billboard(ct[i % 2], s, s / 4), side * (3 + rnd() * 14), -1.5 + rnd() * 2.5, 8 - rnd() * 50, g);
    }
    const face = new THREE.Vector2(0, 8);
    g.add(mountain(71, -40, -70, 90, 34, 0.5, face, -6));
    g.add(mountain(72, 45, -90, 110, 40, 0.38, face, -6));
    g.add(mountain(73, 0, -160, 240, 80, 0.2, face, -10));
    place(billboard(birdsTex(31), 14, 7, { fog: false, opacity: 0.8 }), -8, 12, -30, g);
  }

  private camAt(s: number) {
    const u = 0.02 + s * 0.84;
    const p = this.curve.getPointAt(u);
    const a = this.curve.getPointAt(Math.min(u + 0.1, 1));
    return { pos: this.w(p.x, p.y + 1.65, p.z), target: this.w(a.x, a.y + 1.45, a.z) };
  }

  portalView() {
    return this.camAt(0);
  }

  enter() {
    this.scroll = 0;
    this.update(0, 0);
    this.ctx.rig.snap();
    this.ctx.rig.curPos.y += 1.2;
    this.ctx.rig.curPos.z += 3;
  }

  update(_dt: number, t: number) {
    const { pos, target } = this.camAt(this.scroll);
    this.ctx.rig.pos.copy(pos);
    this.ctx.rig.target.copy(target);
    this.burner?.update(t);
    for (const l of this.skyLanterns) {
      l.obj.position.y += l.speed * Math.min(_dt, 0.05);
      if (l.obj.position.y > 16) l.obj.position.y = -1;
      l.obj.position.x = l.x + Math.sin(t * 0.4 + l.ph) * 0.4;
      l.obj.rotation.y = t * 0.2 + l.ph;
    }
  }

  click(key: string) {
    if (key === 'bio') {
      this.ctx.openCard({ kicker: '关于我', title: site.name, meta: site.role, body: about.bio, tags: about.skills });
    } else if (key === 'skills') {
      this.ctx.openCard({ kicker: '技能', title: '所习', body: ['每一盏孔明灯，都是一门手艺。'], tags: about.skills });
    } else if (key.startsWith('exp:')) {
      const x = about.experiences[Number(key.slice(4))];
      this.ctx.openCard({ kicker: '经历', title: x.title, meta: `${x.period} · ${x.place}`, body: [x.detail] });
    }
  }
}
