import * as THREE from 'three';
import type { PlayedNote } from '../audio/AudioEngine';
import { lam, place } from './paint';
import { incenseBurner } from './roomDecor';

/**
 * 院中抚琴：石台、琴桌、古琴、焚香，一位着长袍的抚琴者。
 * 手的动作跟着正在播放的琴音走——右手在岳山边拨弦，左手按到这个音在弦上的位置，
 * 滑音时沿弦滑动，吟时轻轻颤动，泛音时点一下就抬起；琴音关着时就「无声地弹」。
 * 抚琴者面朝局部 +z，琴横放在面前，琴首（岳山）在他右手边（局部 −x）。
 */

const OPEN = [36, 38, 41, 43, 45, 48, 50]; // 正调七弦散音：C2 D2 F2 G2 A2 C3 D3
const TABLE_H = 0.66; // 琴桌面高度
const QIN_TOP = TABLE_H + 0.066; // 琴面高度
const STR_Y = QIN_TOP + 0.006; // 弦的高度
const QIN_Z = 0.42; // 琴的中线到人的距离
const HEAD_X = -0.56; // 岳山
const TAIL_X = 0.6; // 龙龈
const STR_L = TAIL_X - HEAD_X;
const HUI = [1 / 8, 1 / 6, 1 / 5, 1 / 4, 1 / 3, 2 / 5, 1 / 2, 3 / 5, 2 / 3, 3 / 4, 4 / 5, 5 / 6, 7 / 8];
const LEAD = 0.06; // 手比声音提前动一点，看起来才像是「弹出来」的
const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const smooth = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};
/** 第 i 根弦（0 = 一弦，离人最远）的位置 */
const strZ = (i: number) => QIN_Z + 0.065 - (i * 0.13) / 6;
/** 能弹出这个音的最高一根弦 */
function stringFor(midi: number) {
  let s = 0;
  for (let i = 0; i < 7; i++) if (OPEN[i] <= midi) s = i;
  return s;
}
/** 按弦位置：有效弦长按音程缩短 */
const pressX = (midi: number, s: number) => HEAD_X + STR_L * Math.pow(2, -Math.max(0, midi - OPEN[s]) / 12);
/** 泛音：找一根能在 1/4 处（高两个八度）或其它节点出这个音的弦 */
function harmonicSpot(midi: number) {
  const ratios: [number, number][] = [[24, 1 / 4], [19, 1 / 3], [12, 1 / 2], [28, 1 / 5], [31, 1 / 6]];
  for (const [semi, frac] of ratios) {
    for (let s = 0; s < 7; s++) if (midi - OPEN[s] === semi) return { s, x: HEAD_X + STR_L * frac };
  }
  return { s: stringFor(midi - 24), x: HEAD_X + STR_L / 4 };
}

/** 把一段圆柱摆在 a、b 两点之间（圆柱几何体高 1，+y 端对着 b） */
function span(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a);
  const len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len || 1));
}

/** 一条手臂：上臂 + 宽袖 + 手，用两节反向运动学（IK）让手落到目标点 */
class Arm {
  private upper: THREE.Mesh;
  private elbow: THREE.Mesh;
  private sleeve: THREE.Mesh;
  private forearm: THREE.Mesh;
  private hand: THREE.Mesh;
  private pole: THREE.Vector3;

  constructor(parent: THREE.Object3D, side: 1 | -1, robe: THREE.Material, robeDS: THREE.Material, skin: THREE.Material, shadows: boolean) {
    this.upper = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 1, 10), robe);
    this.elbow = new THREE.Mesh(new THREE.SphereGeometry(0.066, 12, 8), robe);
    this.sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.068, 1, 16, 1, true), robeDS); // 广袖：到袖口略张开
    this.forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 1, 8), skin); // 袖口外露出的手腕
    this.hand = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 8), skin);
    this.hand.scale.set(0.9, 0.55, 1.45);
    for (const m of [this.upper, this.elbow, this.sleeve, this.forearm, this.hand]) {
      m.castShadow = shadows;
      parent.add(m);
    }
    // 手肘的朝向：向外、向下、略向后
    this.pole = new THREE.Vector3(side * 0.9, -0.7, -0.25).normalize();
  }

  pose(S: THREE.Vector3, T: THREE.Vector3) {
    const l1 = 0.3;
    const l2 = 0.32;
    const d = T.clone().sub(S);
    const dist = THREE.MathUtils.clamp(d.length(), 0.1, l1 + l2 - 0.002);
    const dir = d.normalize();
    const perp = this.pole.clone().addScaledVector(dir, -this.pole.dot(dir)).normalize();
    const a = Math.acos(THREE.MathUtils.clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1));
    const E = S.clone().addScaledVector(dir, l1 * Math.cos(a)).addScaledVector(perp, l1 * Math.sin(a));
    const W = S.clone().addScaledVector(dir, dist);
    span(this.upper, S, E);
    this.elbow.position.copy(E);
    const cuff = E.clone().lerp(W, 0.7);
    span(this.sleeve, E, cuff);
    span(this.forearm, cuff, W);
    this.hand.position.copy(W);
    this.hand.quaternion.setFromUnitVectors(FWD, W.clone().sub(E).normalize());
  }
}

interface LeftPlan {
  at: number; // 出声时刻（动画时钟）
  until: number;
  s: number;
  harm: boolean;
  press: boolean;
  x0: number;
  x1: number | null; // 滑音终点
  slideAt: number;
  vib: boolean;
}

export class GuqinPlayer {
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  private body = new THREE.Group();
  private head = new THREE.Group();
  private right: Arm;
  private left: Arm;
  private shoulderR = new THREE.Vector3(-0.19, 0.44, 0.02);
  private shoulderL = new THREE.Vector3(0.19, 0.44, 0.02);
  private burner = incenseBurner();
  private queue: PlayedNote[] = [];
  private mimeNext = 0;
  // 右手
  private pluckAt = -99;
  private pluckS = 3;
  private rPos: THREE.Vector3;
  private rFrom = new THREE.Vector3();
  private rHover = new THREE.Vector3(HEAD_X + 0.13, STR_Y + 0.07, strZ(3) - 0.03);
  // 左手
  private lPlan: LeftPlan | null = null;
  private lPos: THREE.Vector3;
  private lRest = new THREE.Vector3(0.3, STR_Y + 0.05, QIN_Z - 0.1);

  constructor(shadows = true) {
    const robe = lam(0xebe6da);
    const robeDS = lam(0xebe6da, { side: THREE.DoubleSide });
    const dark = lam(0x2f2b27);
    const skin = lam(0xf0e8da);
    const hair = lam(0x1d1b19);
    const wood = lam(0x3b332c);
    const stone = lam(0xb5b0a6);
    const lacquer = lam(0x2b2420);
    const silk = lam(0xe9e1c9);
    const cast = (m: THREE.Mesh) => {
      m.castShadow = shadows;
      return m;
    };

    // 石台
    place(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 2.0), stone), 0, 0.07, 0.25, this.group).receiveShadow = shadows;
    const stage = place(new THREE.Group(), 0, 0.14, 0, this.group);

    // 琴桌
    place(cast(new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.045, 0.4), wood)), 0.02, TABLE_H - 0.0225, QIN_Z, stage);
    for (const [x, z] of [[-0.64, -0.15], [0.68, -0.15], [-0.64, 0.15], [0.68, 0.15]]) {
      place(cast(new THREE.Mesh(new THREE.BoxGeometry(0.05, TABLE_H - 0.045, 0.05), wood)), x, (TABLE_H - 0.045) / 2, QIN_Z + z, stage);
    }

    // 古琴：琴首宽、过琴肩后渐窄，圆角漆身
    const outline = new THREE.Shape();
    const pts: [number, number][] = [
      [-0.66, -0.09], [-0.62, -0.105], [-0.48, -0.105], [-0.44, -0.095], [0.66, -0.078],
      [0.66, 0.078], [-0.44, 0.095], [-0.48, 0.105], [-0.62, 0.105], [-0.66, 0.09],
    ];
    pts.forEach(([x, y], i) => (i ? outline.lineTo(x, y) : outline.moveTo(x, y)));
    outline.closePath();
    const qin = place(
      cast(new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 }), lacquer)),
      0, TABLE_H + 0.008, QIN_Z, stage,
    );
    qin.rotation.x = -Math.PI / 2;
    place(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.012, 0.19), lam(0x6b5a48)), HEAD_X, QIN_TOP + 0.006, QIN_Z, stage); // 岳山
    place(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.15), lam(0x6b5a48)), TAIL_X + 0.03, QIN_TOP + 0.005, QIN_Z, stage); // 龙龈
    for (let i = 0; i < 7; i++) {
      place(new THREE.Mesh(new THREE.BoxGeometry(STR_L + 0.06, 0.0025, 0.0025), silk), (HEAD_X + TAIL_X + 0.03) / 2, STR_Y, strZ(i), stage);
    }
    const huiMat = new THREE.MeshBasicMaterial({ color: 0xf2efe6 });
    for (const f of HUI) {
      const dot = place(new THREE.Mesh(new THREE.CircleGeometry(0.0065, 10), huiMat), HEAD_X + STR_L * f, QIN_TOP + 0.001, QIN_Z + 0.088, stage);
      dot.rotation.x = -Math.PI / 2;
    }
    // 朱红琴穗，从桌边垂下
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 4), dark), -0.73, TABLE_H - 0.06, QIN_Z + 0.05, stage);
    place(new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.11, 10), lam(0xb8281d)), -0.73, TABLE_H - 0.18, QIN_Z + 0.05, stage).rotation.x = Math.PI;

    // 抚琴者：袍摆与腿（大多藏在琴桌后），上身、头随呼吸微动
    // 袍摆：从腰到地面自然撒开，下缘一道深色滚边
    const skirt = new THREE.LatheGeometry(
      [[0, 0.52], [0.21, 0.52], [0.24, 0.44], [0.29, 0.28], [0.34, 0.1], [0.37, 0.01], [0, 0.01]].map(([r, y]) => new THREE.Vector2(r, y)).reverse(),
      24,
    );
    place(cast(new THREE.Mesh(skirt, robe)), 0, 0, 0.02, stage);
    place(new THREE.Mesh(new THREE.TorusGeometry(0.365, 0.016, 6, 32), dark), 0, 0.03, 0.02, stage).rotation.x = Math.PI / 2;
    place(cast(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.4), robe)), 0, 0.5, 0.16, stage);
    place(this.body, 0, 0.52, 0, stage);
    place(cast(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.46, 18), robe)), 0, 0.23, 0, this.body);
    for (const s of [-1, 1]) {
      place(cast(new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8), robe)), s * 0.17, 0.44, 0, this.body);
      // 交领：胸前两道深色斜襟
      const lapel = place(new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.24, 0.01), dark), s * 0.045, 0.36, 0.17, this.body);
      lapel.rotation.z = s * 0.45;
    }
    const sash = place(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.024, 6, 24), dark), 0, 0.05, 0, this.body);
    sash.rotation.x = Math.PI / 2;
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.09, 10), skin), 0, 0.5, 0.01, this.body);
    place(this.head, 0, 0.6, 0.01, this.body);
    const face = place(cast(new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), skin)), 0, 0, 0, this.head);
    face.scale.set(1, 1.12, 1);
    const cap = place(new THREE.Mesh(new THREE.SphereGeometry(0.106, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair), 0, 0.01, -0.012, this.head);
    cap.rotation.x = -0.35;
    place(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), hair), 0, 0.12, -0.03, this.head); // 发髻
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.2, 5), lam(0x8a7a5a)), 0, 0.13, -0.03, this.head).rotation.z = Math.PI / 2; // 簪

    this.right = new Arm(stage, -1, robe, robeDS, skin, shadows);
    this.left = new Arm(stage, 1, robe, robeDS, skin, shadows);
    this.rPos = this.rHover.clone();
    this.lPos = this.lRest.clone();

    // 香炉
    place(this.burner.group, 1.0, 0, 0.9, stage).scale.setScalar(0.85);

    // 点击区域
    this.hit = place(
      new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 1.4), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })),
      0, 0.9, 0.25, this.group,
    );
  }

  /** 音频引擎排好一个音时调用（when 为音频时钟上的出声时刻） */
  feed(n: PlayedNote) {
    this.queue.push(n);
    if (this.queue.length > 64) this.queue.shift();
  }

  /**
   * heard：音频时钟上「此刻听到」的时间；琴音没在响时为 null，此时自己无声地弹。
   * t：动画时钟（秒）。
   */
  update(dt: number, heard: number | null, t: number) {
    if (heard !== null) {
      const offset = t - heard; // 音频时钟 → 动画时钟
      while (this.queue.length && this.queue[0].when - LEAD <= heard) {
        const n = this.queue.shift()!;
        if (n.when < heard - 0.4) continue; // 太旧的（比如人不在院子里时排的）直接丢掉
        this.trigger(n, n.when + offset);
      }
      this.mimeNext = t + 1;
    } else {
      this.queue.length = 0;
      if (t >= this.mimeNext) {
        this.trigger(this.mimeNote(), t + LEAD);
        this.mimeNext = t + rand(0.7, 1.8);
      }
    }

    // 右手：从当前位置落到弦上 → 向身体方向拨过 → 抬回悬停
    const k = t - (this.pluckAt - LEAD);
    const contact = new THREE.Vector3(HEAD_X + 0.1, STR_Y + 0.004, strZ(this.pluckS));
    const through = contact.clone().add(new THREE.Vector3(0, 0.01, -0.04));
    let pluckEnv = 0;
    if (k >= 0 && k < 0.5) {
      if (k < LEAD) this.rPos.lerpVectors(this.rFrom, contact, smooth(k / LEAD));
      else if (k < LEAD + 0.06) this.rPos.lerpVectors(contact, through, (k - LEAD) / 0.06);
      else this.rPos.lerpVectors(through, this.rHover, smooth((k - LEAD - 0.06) / 0.35));
      pluckEnv = Math.exp(-Math.max(0, k - LEAD) * 6);
    } else {
      this.rPos.lerp(this.rHover, 1 - Math.exp(-dt * 6));
    }

    // 左手：按在音位上；滑音沿弦滑过去；吟时轻颤；泛音点一下就抬起；散音或空闲时回到休息位
    const p = this.lPlan;
    let target = this.lRest;
    let exact = false;
    if (p && t < p.until + 0.3) {
      if (p.harm) {
        const touching = t < p.at + 0.12;
        target = new THREE.Vector3(p.x0, STR_Y + (touching ? 0.004 : 0.05), strZ(p.s));
      } else if (p.press) {
        let x = p.x0;
        if (p.x1 !== null && t > p.slideAt) x = THREE.MathUtils.lerp(p.x0, p.x1, smooth((t - p.slideAt) / 0.4));
        if (p.vib && t > p.at + 0.3) {
          x += 0.008 * Math.sin(2 * Math.PI * 4 * (t - p.at)) * Math.exp(-(t - p.at) * 0.6);
          exact = true;
        }
        target = new THREE.Vector3(x, STR_Y + 0.006, strZ(p.s));
      }
    }
    if (exact) this.lPos.copy(target);
    else this.lPos.lerp(target, 1 - Math.exp(-dt * 16));

    // 身体：缓缓呼吸、轻晃，拨弦时略向右手倾；头看向左手
    this.body.rotation.set(0.16 + 0.015 * Math.sin(t * 0.4), 0.04 * Math.sin(t * 0.23), 0.025 * Math.sin(t * 0.31) - 0.02 * pluckEnv);
    this.body.updateMatrix();
    this.head.rotation.set(0.3 + 0.03 * Math.sin(t * 0.5), THREE.MathUtils.clamp(this.lPos.x * 0.35, -0.3, 0.3), 0);

    const toStage = (v: THREE.Vector3) => v.clone().applyMatrix4(this.body.matrix);
    this.right.pose(toStage(this.shoulderR), this.rPos);
    this.left.pose(toStage(this.shoulderL), this.lPos);
    this.burner.update(t);
  }

  private trigger(n: PlayedNote, at: number) {
    const melody = n.midis[n.midis.length - 1];
    this.rFrom.copy(this.rPos);
    this.pluckAt = at;
    if (n.harm) {
      const h = harmonicSpot(melody);
      this.pluckS = h.s;
      this.lPlan = { at, until: at + 0.5, s: h.s, harm: true, press: false, x0: h.x, x1: null, slideAt: 0, vib: false };
      return;
    }
    const s = stringFor(melody);
    this.pluckS = s;
    const press = melody > OPEN[s];
    this.lPlan = {
      at,
      until: at + n.dur,
      s,
      harm: false,
      press,
      x0: pressX(melody, s),
      x1: n.to !== null ? pressX(n.to, s) : null,
      slideAt: at + Math.min(n.dur * 0.45, 0.8),
      vib: n.vib && n.dur > 1 && n.to === null,
    };
  }

  /** 琴音关着时自己编的动作 */
  private mimeNote(): PlayedNote {
    const pool = [45, 48, 50, 53, 55, 57, 60, 62, 65, 67, 69];
    const midi = pool[(Math.random() * pool.length) | 0];
    const harm = Math.random() < 0.12;
    return {
      when: 0,
      midis: [harm ? midi + 12 : midi],
      harm,
      to: !harm && Math.random() < 0.2 ? midi + (Math.random() < 0.5 ? 2 : -2) : null,
      vib: Math.random() < 0.3,
      dur: rand(0.8, 2),
    };
  }
}
