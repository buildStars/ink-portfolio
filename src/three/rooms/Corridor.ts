import * as THREE from 'three';
import gsap from 'gsap';
import { Room } from './Room';
import { store, type RoomId } from '../../store';
import { about, rooms, site } from '../../content';
import {
  FONT_BRUSH, FONT_SERIF, bambooTex, bananaTex, billboard, birdsTex, boat, canvasTex, figureTex, fitVertical, lake,
  lam, lantern, mountain, mulberry32, orchidTex, pineTex, place, plumTex, rockGeometry, seal, shrubTex, skyCloudTex, vtext, willowTex,
} from '../paint';
import { KoiPond, plantPot, stoneLantern, stoneTableSet } from '../garden';
import { taihuStone } from '../taihu';
import { GuqinPlayer } from '../guqinPlayer';
import type { PlayedNote } from '../../audio/AudioEngine';
import { type LatticePattern, type WindowShape, flowerStand, hangingScrollTex, leakWindowTex, poemTabletTex } from '../wallDecor';

const W = 4.2;
const H = 3.3;
const Z0 = 6;
const Z1 = -60;
const L = Z0 - Z1;
const MID = (Z0 + Z1) / 2;
const CAM_X = 0.55;
const CAM_Y = 1.55;

// 入口：门外 → 推门 → 院子（人物 + 欢迎语）→ 回廊，一路滚动连续前进
const OUT_Z = 31.5; // 门外起点
const GATE_Z = 24; // 大门
const OPEN_LEN = 4; // 推门阶段的滚动量：这段里镜头只缓慢前移，门随之打开
const OPEN_END_Z = OUT_Z - OPEN_LEN * 0.6;
const FIG_Z = 16.5; // 人物
const END_Z = -30; // 回廊尽头
const POND = { x: 4.3, z: 11.5, rx: 2.4, rz: 3.0 }; // 院内锦鲤池
// 门口提示：电脑上引导点一下大门（点击才能让浏览器放行琴声，滚轮不行）；手机上滑本身就能放行
const GATE_HINT = matchMedia('(pointer: coarse)').matches ? '上滑 · 推开大门' : '点击大门或向下滚动 · 推门入园';
const camZ = (s: number) => (s < OPEN_LEN ? OUT_Z - s * 0.6 : OPEN_END_Z - (s - OPEN_LEN));
const scrollAt = (z: number) => OPEN_LEN + (OPEN_END_Z - z);

type GateRoom = Exclude<RoomId, 'corridor'>;
const GATES: { id: GateRoom; z: number }[] = [
  { id: 'gallery', z: -4 },
  { id: 'about', z: -12 },
  { id: 'contact', z: -20 },
  { id: 'social', z: -28 },
];

// 月洞门「立体书」：走近时，门所在的那段墙像书页一样翻出来、转向来客；镜头本身不转
const PANEL_W = 2.8; // 门板宽
const PANEL_H = 2.95; // 门板高（顶上压一道瓦檐，整体低于廊顶横梁）
const PANEL_D = 0.24; // 门板厚
const RING_Y = 1.2; // 门洞圆心高度
const VIEW_D = 4.8; // 门翻到最正时，视点距门的距离
const TILT_MAX = THREE.MathUtils.degToRad(58); // 最大翻出角度
const DWELL = 3; // 门翻到最正时停步的滚动量（约 3 下滚轮）
const GATE_T = GATES.map((g) => scrollAt(g.z + VIEW_D)); // 不含停步段时，走到各门正对位置的滚动值

/** 滚动值 → 沿路前进量 t（扣掉停步段）、正停在哪道门前 */
function walk(s: number) {
  let offset = 0;
  for (let i = 0; i < GATES.length; i++) {
    const start = GATE_T[i] + offset;
    if (s < start) break;
    if (s < start + DWELL) return { t: GATE_T[i], gate: i };
    offset += DWELL;
  }
  return { t: s - offset, gate: -1 };
}

/** 镜头在 z 处时，第 i 道门翻出的程度（0~1）：约 11m 外开始翻、正对位置最大、走到跟前时合回墙面 */
function tiltAt(i: number, z: number) {
  const S = THREE.MathUtils.smoothstep;
  const d = z - GATES[i].z;
  return (1 - S(d, VIEW_D, 11)) * S(d, 1, VIEW_D);
}
/** 第 i 道门停步段内进度 u 对应的滚动值 */
const dwellScroll = (i: number, u: number) => GATE_T[i] + i * DWELL + u * DWELL;

export interface Portal {
  id: GateRoom;
  rt: THREE.WebGLRenderTarget;
  center: THREE.Vector3;
  frameInverse: THREE.Matrix4;
}

/** 门翻到最正时，视点到门的距离；门后房间的「虚拟窗」就放在其起始视角前方这么远 */
export const PORTAL_D = 4.4;

interface GatePanel {
  pivot: THREE.Group; // 铰链（靠入口一侧的门板边缘）
  frame: THREE.Object3D; // 门洞坐标系，+z 为门板朝向
  disc: THREE.Mesh; // 门洞里的透景圆盘
  tilt: number; // 当前翻出程度（平滑后）
}

/** 回廊：粉墙月洞门在左，湖山在右，每道门通往一个板块 */
export class Corridor extends Room {
  readonly id = 'corridor' as const;
  scrollMax = scrollAt(END_Z) + DWELL * GATES.length;
  private lanterns: THREE.Object3D[] = [];
  private doorL = new THREE.Group();
  private doorR = new THREE.Group();
  private figure!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private figureFrames: THREE.Texture[] = [];
  private welcomeMat!: THREE.MeshBasicMaterial;
  private pond!: KoiPond;
  private qinPlayer!: GuqinPlayer;
  private skyClouds: { obj: THREE.Object3D; x0: number; speed: number }[] = [];
  /** 月洞门透景：每道门一块渲染目标；res 是主画面的像素尺寸（着色器按屏幕坐标取样） */
  readonly portals: Portal[] = [];
  readonly portalRes = new THREE.Vector2(1, 1);
  private gatePanels: GatePanel[] = [];
  private tween: gsap.core.Tween | null = null;

  build() {
    const g = this.group;
    const shadows = !this.ctx.lowQuality;

    // 地面石板
    const floorTex = canvasTex(512, 512, (c, w, h) => {
      const rnd = mulberry32(3);
      c.fillStyle = '#7d786e';
      c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 128) {
        let x = -rnd() * 120;
        while (x < w) {
          const sw = 120 + rnd() * 140;
          const v = (196 + rnd() * 20) | 0;
          c.fillStyle = `rgb(${v},${v - 4},${v - 14})`;
          c.fillRect(x + 3, y + 3, sw - 6, 122);
          x += sw;
        }
      }
    });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(W / 2, L / 2);
    const floor = place(new THREE.Mesh(new THREE.PlaneGeometry(W, L), lam(0xffffff, { map: floorTex })), 0, 0, MID, g);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = shadows;

    // 粉墙 + 月洞门
    const plaster = canvasTex(512, 512, (c, w, h) => {
      const rnd = mulberry32(11);
      c.fillStyle = '#f3f0e8';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 28; i++) {
        const x = rnd() * w, y = rnd() * h, r = 30 + rnd() * 120;
        const gr = c.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(90,85,75,${0.03 + rnd() * 0.05})`);
        gr.addColorStop(1, 'rgba(90,85,75,0)');
        c.fillStyle = gr;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      }
    });
    plaster.wrapS = plaster.wrapT = THREE.RepeatWrapping;
    plaster.repeat.set(0.25, 0.25);
    // 粉墙本身是完整的一面墙；月洞门做成单独的门板贴在墙前，走近时翻出来（见 buildGatePanels）
    const wallTex = plaster.clone();
    wallTex.repeat.set(L / 4, 0.9);
    const wall = place(new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.6, L), lam(0xffffff, { map: wallTex })), -W / 2 - 0.15, 1.8, MID, g);
    wall.receiveShadow = shadows;
    place(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, L), lam(0x77736b)), -W / 2 + 0.02, 0.16, MID, g);

    this.buildGatePanels(g, plaster);

    // 屋顶梁椽
    const rafterTex = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#d7d2c8';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#4a4540';
      c.fillRect(0, 0, w, 70);
    });
    rafterTex.wrapS = rafterTex.wrapT = THREE.RepeatWrapping;
    rafterTex.repeat.set(1, L / 0.45);
    const ceil = place(new THREE.Mesh(new THREE.PlaneGeometry(W, L), lam(0xffffff, { map: rafterTex })), 0, H, MID, g);
    ceil.rotation.x = Math.PI / 2;
    place(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, L), lam(0x3a3632)), W / 2 - 0.15, H - 0.15, MID, g);
    place(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, L), lam(0x3a3632)), -W / 2 + 0.08, H - 0.1, MID, g);

    // 柱、横梁、挂落、美人靠
    const colMat = lam(0x34302c);
    const colGeo = new THREE.CylinderGeometry(0.11, 0.12, H, 16);
    const beamGeo = new THREE.BoxGeometry(W, 0.16, 0.14);
    const baseGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.12, 16);
    const baseMat = lam(0x8a857c);
    for (let z = Z0 - 1; z > Z1; z -= 3) {
      place(new THREE.Mesh(colGeo, colMat), W / 2 - 0.15, H / 2, z, g).castShadow = shadows;
      place(new THREE.Mesh(beamGeo, colMat), 0, H - 0.1, z, g);
      place(new THREE.Mesh(baseGeo, baseMat), W / 2 - 0.15, 0.06, z, g);
    }
    const fretTex = canvasTex(512, 96, (c, w, h) => {
      c.strokeStyle = '#2f2b27';
      c.lineWidth = 7;
      c.strokeRect(4, 4, w - 8, h - 8);
      c.lineWidth = 5;
      for (let x = 16; x < w - 16; x += 48) {
        c.strokeRect(x, 18, 32, h - 36);
        c.beginPath();
        c.moveTo(x + 16, 18);
        c.lineTo(x + 16, h / 2);
        c.stroke();
      }
    });
    fretTex.wrapS = THREE.RepeatWrapping;
    fretTex.repeat.set(L / 3, 1);
    const fret = place(
      new THREE.Mesh(new THREE.PlaneGeometry(L, 0.34), lam(0xffffff, { map: fretTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide })),
      W / 2 - 0.15, H - 0.47, MID, g,
    );
    fret.rotation.y = -Math.PI / 2;
    fret.castShadow = shadows;
    const woodMat = lam(0x3d3833);
    place(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, L), woodMat), W / 2 - 0.22, 0.46, MID, g).castShadow = shadows;
    place(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, L), lam(0x46413b)), W / 2 - 0.39, 0.24, MID, g).castShadow = shadows;
    const slatCount = Math.floor(L / 0.16);
    const slats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.52, 0.03), woodMat, slatCount);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.38));
    const one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < slatCount; i++) {
      m4.compose(new THREE.Vector3(W / 2 - 0.02, 0.7, Z0 - 0.1 - i * 0.16), q, one);
      slats.setMatrixAt(i, m4);
    }
    slats.castShadow = shadows;
    g.add(slats);
    const rail = place(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, L, 8), woodMat), W / 2 + 0.08, 0.93, MID, g);
    rail.rotation.x = Math.PI / 2;
    rail.castShadow = shadows;

    // 红灯笼
    for (const z of [0.5, -8.5, -16.5, -24.5]) {
      const l = place(lantern(), W / 2 - 0.55, 2.45, z, g);
      this.lanterns.push(l);
    }

    // 入口匾额
    const heroTex = canvasTex(768, 256, (c, w, h) => {
      c.fillStyle = '#2b2622';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#7a7166';
      c.lineWidth = 8;
      c.strokeRect(14, 14, w - 28, h - 28);
      c.font = `150px ${FONT_BRUSH}`;
      c.fillStyle = '#f1e8d2';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(site.title, w / 2 - 20, h / 2 + 10);
      seal(c, w - 110, h / 2 - 60, 64, site.seal, 9);
    });
    place(new THREE.Mesh(new THREE.PlaneGeometry(1.95, 0.65), lam(0xffffff, { map: heroTex })), 0, 2.62, 0.2, g);
    for (const x of [-0.75, 0.75]) place(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.38, 4), lam(0x222222)), x, H - 0.2, 0.2, g);

    this.buildWallDecor(g);

    // 湖、远山、柳、舟、飞鸟
    place(lake(600), 0, -0.35, -100, g);
    const face = new THREE.Vector2(0, 6);
    g.add(mountain(31, 70, -170, 180, 70, 0.28, face));
    g.add(mountain(17, 40, -95, 90, 36, 0.5, face));
    g.add(mountain(5, 22, -48, 42, 17, 0.8, face));
    g.add(mountain(44, 60, -60, 50, 18, 0.65, face));
    const willow = place(billboard(willowTex(7), 4, 8), W / 2 + 2.6, 3.6, 0.6, g);
    willow.rotation.y = -0.35;
    const b = place(boat(), 9, -0.28, -24, g);
    b.rotation.y = 0.5;
    b.scale.setScalar(1.3);
    const birds = place(billboard(birdsTex(13), 16, 8, { fog: false, opacity: 0.8 }), 22, 15, -50, g);
    birds.rotation.y = -0.35;

    // 天上的淡墨云：门楼上方、院子上空、回廊外湖面上空，缓缓飘动
    const cloudTexs = [skyCloudTex(3), skyCloudTex(11), skyCloudTex(29), skyCloudTex(47)];
    // [x, y, z, 宽, 不透明度]
    const clouds: [number, number, number, number, number][] = [
      // 门外看：门楼屋顶上方
      [-3.5, 8.6, 19.5, 6.5, 0.9],
      [4.5, 9.9, 17, 7, 0.85],
      // 院子里看：头顶与回廊屋顶上空
      [-10, 9.5, 12, 9, 0.9],
      [7, 11, 8, 11, 0.85],
      [-6, 11, -12, 11, 0.85],
      [8, 13, -18, 12, 0.8],
      [0, 15.5, -26, 13, 0.75],
      // 回廊外：湖面上空
      [18, 8, -30, 12, 0.8],
      [14, 7.5, -40, 12, 0.8],
      [27, 9.5, -56, 15, 0.7],
      [30, 10.5, -46, 15, 0.7],
      [12, 13, -58, 16, 0.6],
      [45, 12, -70, 20, 0.55],
    ];
    clouds.forEach(([x, y, z, wd, op], i) => {
      const obj = place(billboard(cloudTexs[i % cloudTexs.length], wd, wd * 0.375, { fog: false, opacity: op, side: THREE.FrontSide }), x, y, z, g);
      this.skyClouds.push({ obj, x0: x, speed: 0.04 + (i % 3) * 0.015 });
    });

    this.buildEntrance(g);
  }

  /**
   * 月洞门门板：门洞、门环、匾额、透景圆盘都装在一块可转动的门板上。
   * 铰链在靠入口一侧，门板绕它向廊道翻出，正面转向走来的人。
   */
  private buildGatePanels(g: THREE.Group, plaster: THREE.Texture) {
    const shape = new THREE.Shape();
    shape.moveTo(-PANEL_W / 2, 0);
    shape.lineTo(PANEL_W / 2, 0);
    shape.lineTo(PANEL_W / 2, PANEL_H);
    shape.lineTo(-PANEL_W / 2, PANEL_H);
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, RING_Y, 1.15, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const panelGeo = new THREE.ExtrudeGeometry(shape, { depth: PANEL_D, bevelEnabled: false, curveSegments: 64 });
    const panelMat = lam(0xffffff, { map: plaster });
    const edgeMat = lam(0x3a3632);
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const face = Math.PI / 2; // 平面朝 +x（廊道）
    const cz = -PANEL_W / 2; // 门板中心在铰链局部坐标里的 z

    GATES.forEach((gt, i) => {
      const name = rooms[gt.id].gate;
      const pivot = place(new THREE.Group(), -W / 2 + 0.005, 0, gt.z + PANEL_W / 2, g);

      const body = place(new THREE.Mesh(panelGeo, panelMat), 0, 0, cz, pivot);
      body.rotation.y = face;
      body.castShadow = !this.ctx.lowQuality; // 翻出时在墙上、地上投下影子，立体感更明显
      // 瓦檐与两侧墨边，让门板读起来像一张立起的卡片
      place(new THREE.Mesh(new THREE.BoxGeometry(PANEL_D + 0.08, 0.08, PANEL_W + 0.08), edgeMat), PANEL_D / 2, PANEL_H + 0.04, cz, pivot);
      for (const s of [-1, 1]) {
        place(new THREE.Mesh(new THREE.BoxGeometry(PANEL_D + 0.02, PANEL_H, 0.05), edgeMat), PANEL_D / 2, PANEL_H / 2, cz + s * (PANEL_W / 2 - 0.02), pivot);
      }

      const ringMat = lam(0x5d5a54);
      place(new THREE.Mesh(new THREE.RingGeometry(1.15, 1.29, 96), ringMat), PANEL_D + 0.004, RING_Y, cz, pivot).rotation.y = face;
      const pt = canvasTex(512, 168, (c, w, h) => {
        c.fillStyle = '#2d2824';
        c.fillRect(0, 0, w, h);
        c.strokeStyle = '#6d655c';
        c.lineWidth = 6;
        c.strokeRect(10, 10, w - 20, h - 20);
        c.font = `${name.length > 3 ? 92 : 108}px ${FONT_BRUSH}`;
        c.fillStyle = '#efe6cf';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(name, w / 2 - 18, h / 2 + 6);
        seal(c, w - 74, h / 2 - 24, 46, '印', i + 2);
      });
      const plaque = place(new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.36), lam(0xffffff, { map: pt })), PANEL_D + 0.01, 2.73, cz, pivot);
      plaque.rotation.y = face;
      const hit = place(new THREE.Mesh(new THREE.CircleGeometry(1.2, 48), hitMat), PANEL_D + 0.012, RING_Y, cz, pivot);
      hit.rotation.y = face;
      const label = `${name} · 点击进入`;
      this.interactive(hit, `gate:${gt.id}`, label, [ringMat]);
      this.interactive(plaque, `gate:${gt.id}`, label, [ringMat]);

      // 透景圆盘：嵌在门洞深处，按屏幕坐标贴上门后房间的实时画面（由 Experience 每帧渲染）
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
      const disc = place(
        new THREE.Mesh(
          new THREE.CircleGeometry(1.16, 64),
          new THREE.ShaderMaterial({
            uniforms: { map: { value: rt.texture }, res: { value: this.portalRes } },
            vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            fragmentShader: 'uniform sampler2D map; uniform vec2 res; void main() { gl_FragColor = texture2D(map, gl_FragCoord.xy / res); }',
          }),
        ),
        0.03, RING_Y, cz, pivot,
      );
      disc.rotation.y = face;
      // 门洞坐标系：原点在门板正面、与视线同高，+z 指向门板朝向
      const frame = place(new THREE.Object3D(), PANEL_D, CAM_Y, cz, pivot);
      frame.rotation.y = face;

      this.portals.push({ id: gt.id, rt, center: new THREE.Vector3(), frameInverse: new THREE.Matrix4() });
      this.gatePanels.push({ pivot, frame, disc, tilt: 0 });
    });
  }

  /** 按当前翻出程度摆好门板，并同步透景用的门洞坐标 */
  private syncGatePanels() {
    this.gatePanels.forEach((p, i) => {
      p.pivot.rotation.y = -TILT_MAX * p.tilt;
      p.pivot.updateWorldMatrix(true, true);
      this.portals[i].frameInverse.copy(p.frame.matrixWorld).invert();
      p.disc.getWorldPosition(this.portals[i].center);
    });
  }

  /** 第 i 道门板正面的朝向（世界坐标） */
  private panelNormal(i: number) {
    return new THREE.Vector3(1, 0, 0).applyQuaternion(this.gatePanels[i].pivot.getWorldQuaternion(new THREE.Quaternion()));
  }

  /** 回廊左墙：门与门之间轮流布置漏窗、书条石、挂轴、花几盆景 */
  private buildWallDecor(g: THREE.Group) {
    const wx = -W / 2 + 0.015;
    const onWall = (mesh: THREE.Object3D, y: number, z: number) => {
      place(mesh, wx, y, z, g).rotation.y = Math.PI / 2;
      return mesh;
    };
    const plane = (tex: THREE.Texture, w: number, h: number, transparent = false) =>
      new THREE.Mesh(new THREE.PlaneGeometry(w, h), lam(0xffffff, { map: tex, transparent, alphaTest: transparent ? 0.05 : 0 }));

    // 漏窗
    const windows: [number, WindowShape, LatticePattern, number][] = [
      [1.8, 'hexagon', 'ice', 1.45],
      [-24, 'fan', 'wan', 1.7],
      [-32, 'begonia', 'ice', 1.5],
      [-48, 'octagon', 'wan', 1.5],
    ];
    windows.forEach(([z, shape, pattern, size], i) => onWall(plane(leakWindowTex(shape, pattern, 10 + i), size, size, true), 1.72, z));

    // 书条石：古人诗句
    const tablets: [number, [string, string], string][] = [
      [-6.9, ['行到水穷处', '坐看云起时'], '王维句'],
      [-9.1, ['采菊东篱下', '悠然见南山'], '陶渊明句'],
      [-38.9, ['明月松间照', '清泉石上流'], '王维句'],
      [-41.1, ['山中何所有', '岭上多白云'], '陶弘景句'],
    ];
    tablets.forEach(([z, lines, credit], i) => onWall(plane(poemTabletTex(lines, credit, 20 + i), 1.9, 0.67), 1.45, z));

    // 挂轴一对：墨竹、书法
    const rodMat = lam(0x2c241d);
    const scrolls: [number, THREE.Texture][] = [
      [-15.35, hangingScrollTex('bamboo')],
      [-16.65, hangingScrollTex('calligraphy', '宁静致远')],
    ];
    for (const [z, tex] of scrolls) {
      onWall(plane(tex, 0.75, 2.25), 1.8, z);
      for (const y of [2.93, 0.67]) {
        const rod = place(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.84, 8), rodMat), wx + 0.03, y, z, g);
        rod.rotation.x = Math.PI / 2;
      }
    }

    // 花几盆景、墙脚盆栽
    const bonsai = pineTex(52);
    place(flowerStand(bonsai), -W / 2 + 0.35, 0, -24, g);
    const orchid = orchidTex(6);
    for (const z of [1.8, -10.0, -21.9, -29.9]) place(plantPot(orchid, 0.9, 0.56), -W / 2 + 0.32, 0, z + (z === 1.8 ? 0.9 : 0), g).scale.setScalar(0.8);
  }

  /** 大门（朱漆双扉 + 黑瓦门楼）与门内小院（人物 + 欢迎语） */
  private buildEntrance(g: THREE.Group) {
    const Z = GATE_Z;
    const wallMat = lam(0xf1ede4);
    const tileMat = lam(0x3a3632);
    const stoneMat = lam(0xbdb8ae);
    const woodMat = lam(0x2e2925);

    // 门外广场
    const plaza = place(new THREE.Mesh(new THREE.PlaneGeometry(60, 40), lam(0xd6d1c6)), 0, -0.005, Z + 20, g);
    plaza.rotation.x = -Math.PI / 2;

    // 台基与台阶
    place(new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.24, 2.6), stoneMat), 0, 0.12, Z, g);
    for (const dz of [1.5, -1.5]) place(new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 0.4), stoneMat), 0, 0.06, Z + dz, g);

    // 门垛、门额、门框、门槛
    for (const s of [-1, 1]) {
      place(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 1.1), lam(0x9a958b)), s * 1.95, 0.44, Z, g);
      place(new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.5, 1.0), wallMat), s * 1.95, 2.0, Z, g);
      place(new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.8, 0.2), woodMat), s * 1.55, 1.64, Z + 0.1, g);
    }
    place(new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.9, 1.0), wallMat), 0, 3.55, Z, g);
    place(new THREE.Mesh(new THREE.BoxGeometry(3.24, 0.14, 0.2), woodMat), 0, 3.05, Z + 0.1, g);
    place(new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.22, 0.25), woodMat), 0, 0.35, Z, g);

    // 两扇朱漆门：铰链在外侧，向院内开
    const doorMat = lam(0xb3261c);
    const studMat = lam(0xc29a4a);
    const ringMat = lam(0x5e4a2a);
    const studGeo = new THREE.SphereGeometry(0.035, 8, 6);
    const m4 = new THREE.Matrix4();
    for (const [pivot, s] of [[this.doorL, 1], [this.doorR, -1]] as const) {
      place(pivot, -s * 1.5, 0, Z - 0.05, g);
      const leaf = place(new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.54, 0.1), doorMat), s * 0.75, 1.73, 0, pivot);
      const studs = new THREE.InstancedMesh(studGeo, studMat, 35);
      let k = 0;
      for (let col = 0; col < 5; col++) {
        for (let row = 0; row < 7; row++) studs.setMatrixAt(k++, m4.makeTranslation(s * (0.25 + col * 0.25), 0.9 + row * 0.3, 0.055));
      }
      pivot.add(studs);
      place(new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), ringMat), s * 1.3, 1.75, 0.056, pivot);
      place(new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.014, 8, 24), ringMat), s * 1.3, 1.62, 0.07, pivot);
      this.interactive(leaf, 'door', `${site.gatePlaque} · 推门入园`, [ringMat]);
    }

    // 匾额
    const plaqueTex = canvasTex(640, 220, (c, w, h) => {
      c.fillStyle = '#26292a';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#8a7a52';
      c.lineWidth = 8;
      c.strokeRect(12, 12, w - 24, h - 24);
      c.font = `150px ${FONT_BRUSH}`;
      c.fillStyle = '#d9c48a';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(site.gatePlaque, w / 2, h / 2 + 8);
      seal(c, w - 92, h - 92, 52, '印', 12);
    });
    place(new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.65), lam(0xffffff, { map: plaqueTex })), 0, 3.55, Z + 0.505, g);

    // 对联：上联在右，下联在左
    [site.couplet[0] ?? '', site.couplet[1] ?? ''].forEach((text, i) => {
      // 条幅下沿要高过门边的抱鼓石，七言联的末字才不会被挡住
      const tex = canvasTex(160, 688, (c, w, h) => {
        c.fillStyle = '#b8281d';
        c.fillRect(0, 0, w, h);
        const { size, step } = fitVertical(text, h - 64, 120);
        vtext(c, text, w / 2, 32 + size / 2, step, `${size}px ${FONT_BRUSH}`, '#161616');
      });
      place(new THREE.Mesh(new THREE.PlaneGeometry(0.42, 1.8), lam(0xffffff, { map: tex })), i === 0 ? 1.95 : -1.95, 2.12, Z + 0.505, g);
    });

    // 门楼屋顶：坡顶、檐口、瓦当、正脊、鸱吻、翘角
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-1.25, 0);
    roofShape.lineTo(1.25, 0);
    roofShape.lineTo(0, 1.05);
    roofShape.closePath();
    const roof = place(new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 6.6, bevelEnabled: false }), lam(0x4a4642)), -3.3, 4.0, Z, g);
    roof.rotation.y = Math.PI / 2;
    for (const s of [-1, 1]) place(new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.1, 0.12), tileMat), 0, 4.0, Z + s * 1.25, g);
    const tileEnds = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 10), tileMat, 33);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    const one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < 33; i++) tileEnds.setMatrixAt(i, m4.compose(new THREE.Vector3(-3.2 + i * 0.2, 3.97, Z + 1.3), q, one));
    g.add(tileEnds);
    place(new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.22, 0.26), tileMat), 0, 5.1, Z, g);
    for (const s of [-1, 1]) {
      const curl = place(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 8, 16, Math.PI), tileMat), s * 3.35, 5.22, Z, g);
      curl.rotation.z = s * 0.5;
      for (const dz of [-1.2, 1.2]) {
        const corner = place(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.16), tileMat), s * 3.35, 4.05, Z + dz, g);
        corner.rotation.z = s * 0.4;
      }
    }

    // 抱鼓石、门灯
    for (const s of [-1, 1]) {
      place(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.45, 0.7), stoneMat), s * 1.78, 0.47, Z + 0.85, g);
      const drum = place(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 24), stoneMat), s * 1.78, 1.05, Z + 0.85, g);
      drum.rotation.z = Math.PI / 2;
      this.lanterns.push(place(lantern(), s * 1.45, 3.3, Z + 1.15, g));
    }

    // 院墙：前墙两翼、两侧、靠回廊一侧
    const wall = (w: number, d: number, x: number, z: number) => {
      place(new THREE.Mesh(new THREE.BoxGeometry(w, 3.0, d), wallMat), x, 1.5, z, g);
      place(new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.14, d + 0.3), tileMat), x, 3.07, z, g);
      const ridge = w > d ? new THREE.BoxGeometry(w + 0.1, 0.12, 0.25) : new THREE.BoxGeometry(0.25, 0.12, d + 0.1);
      place(new THREE.Mesh(ridge, tileMat), x, 3.2, z, g);
    };
    for (const s of [-1, 1]) {
      wall(7.1, 0.4, s * 5.95, Z);
      wall(0.4, Z - Z0, s * 9.5, (Z + Z0) / 2);
    }
    wall(7.1, 0.4, -5.95, Z0);
    wall(7.2, 0.4, 5.9, Z0);
    place(new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.36, 0.3), tileMat), 0, H + 0.05, Z0, g);

    // 院内地面
    const paveTex = canvasTex(512, 512, (c, w, h) => {
      const rnd = mulberry32(17);
      c.fillStyle = '#86817a';
      c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 256) {
        for (let x = 0; x < w; x += 256) {
          const v = (198 + rnd() * 16) | 0;
          c.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
          c.fillRect(x + 4, y + 4, 248, 248);
        }
      }
    });
    paveTex.wrapS = paveTex.wrapT = THREE.RepeatWrapping;
    paveTex.repeat.set(0.5, 0.5);
    // 地面形状在 XY 平面里画（y = -z），给鱼池挖一个椭圆洞，再放平
    const paveShape = new THREE.Shape();
    paveShape.moveTo(-9.5, -Z);
    paveShape.lineTo(9.5, -Z);
    paveShape.lineTo(9.5, -Z0);
    paveShape.lineTo(-9.5, -Z0);
    paveShape.closePath();
    const hole = new THREE.Path();
    hole.absellipse(POND.x, -POND.z, POND.rx, POND.rz, 0, Math.PI * 2, true, 0);
    paveShape.holes.push(hole);
    const pave = place(new THREE.Mesh(new THREE.ShapeGeometry(paveShape, 48), lam(0xffffff, { map: paveTex })), 0, 0.002, 0, g);
    pave.rotation.x = -Math.PI / 2;

    // 锦鲤池
    this.pond = new KoiPond(POND.rx, POND.rz);
    place(this.pond.group, POND.x, 0, POND.z, g);

    // 石雕：石灯笼夹道、石桌石凳
    for (const [x, z] of [[-2.1, 20.5], [1.95, 20.5], [-2.1, 9.4], [1.95, 9.4]]) place(stoneLantern(), x, 0, z, g);
    const table = place(stoneTableSet(), -5.9, 0, 8.6, g);
    table.rotation.y = 0.3;

    // 院中抚琴：石台斜对着来路，进门就能看见他的正侧面
    this.qinPlayer = new GuqinPlayer(!this.ctx.lowQuality);
    place(this.qinPlayer.group, -4.6, 0, 14.4, g).rotation.y = 0.73;
    this.interactive(this.qinPlayer.hit, 'qin', '园中抚琴 · 点击看看');

    // 院内花木
    place(billboard(plumTex(27), 3.8, 3.8), 5.6, 1.9, 19, g);
    place(billboard(pineTex(31), 3.6, 5.4), -6, 2.7, 19.5, g);
    place(billboard(bambooTex(9), 2.6, 5.2), 8.4, 2.6, 7.4, g);
    place(billboard(plumTex(35), 3.6, 3.6), -6.9, 1.8, 11.9, g);
    const pondWillow = place(billboard(willowTex(23), 3.6, 7.2), POND.x + 2.9, 3.6, POND.z - 0.6, g);
    pondWillow.scale.x = -1;
    const banana = bananaTex(5);
    for (const [x, z] of [[-8.3, 15.5], [8.4, 16.5], [-8.4, 8.3]]) place(billboard(banana, 2.6, 3.25), x, 1.6, z, g);
    const shrub = shrubTex(8);
    for (const [x, z, s] of [[7, 13.8, 1.1], [-7.6, 20.6, 1], [-7.2, 16.8, 0.8], [7.6, 21.6, 0.9], [-8.6, 12, 0.9], [2.9, 7.4, 0.8], [-3.2, 7.4, 0.8]]) {
      place(billboard(shrub, 1.7 * s, 1.06 * s), x, 0.53 * s, z, g);
    }
    const orchid = orchidTex(4);
    for (let z = 7.2; z < Z - 0.6; z += 1.7) {
      for (const s of [-1, 1]) place(billboard(orchid, 1.8, 1.12), s * 8.9, 0.56, z, g);
    }
    for (const x of [-7.6, -5.6, -3.6, 3.6, 5.6, 7.6]) place(billboard(orchid, 1.8, 1.12), x, 0.56, Z - 0.6, g);
    // 池边草丛
    for (const a of [0.4, 1.3, 2.3, 3.6, 4.4, 5.4]) {
      place(billboard(orchid, 1.0, 0.62), POND.x + Math.cos(a) * (POND.rx + 0.35), 0.31, POND.z + Math.sin(a) * (POND.rz + 0.35), g);
    }
    const bonsai = pineTex(44);
    for (const s of [-1, 1]) {
      place(plantPot(bonsai, 1.1, 1.6), s * 3.2, 0, Z - 1.4, g);
      place(plantPot(orchid, 1.0, 0.62), s * 3.3, 0, Z0 + 0.9, g);
    }

    // 门外：一对太湖峰石（脚下几丛兰草）、两株垂柳
    for (const s of [-1, 1] as const) {
      const rock = place(taihuStone(s < 0 ? 7 : 12, this.ctx.lowQuality), s * 3.1, 0, Z + 2.4, g);
      rock.rotation.y = s * 0.5;
      rock.scale.setScalar(1.12);
      rock.castShadow = !this.ctx.lowQuality;
      for (const [dx, dz, k] of [[-0.55, 0.45, 0.9], [0.5, 0.55, 0.7], [0.1, -0.5, 0.8]]) {
        place(billboard(orchid, 1.2 * k, 0.75 * k), s * 3.1 + dx * s, 0.37 * k, Z + 2.4 + dz, g);
      }
    }
    const wt = willowTex(19);
    for (const s of [-1, 1]) {
      const wl = place(billboard(wt, 3.6, 7.2), s * 4.6, 3.6, Z + 1.6, g);
      wl.scale.x = s;
    }

    // 人物：默认占位线稿，两帧交替挥手；content.ts 里填了 portrait 就换成你的形象
    this.figureFrames = [figureTex(0), figureTex(1)];
    const figMat = new THREE.MeshBasicMaterial({ map: this.figureFrames[0], transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.figure = place(new THREE.Mesh(new THREE.PlaneGeometry(1.06, 2.12), figMat), -1.25, 1.06, FIG_Z, g);
    if (site.portrait) {
      new THREE.TextureLoader().load(site.portrait, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const img = tex.image as { width: number; height: number };
        this.figureFrames = [tex];
        figMat.map = tex;
        this.figure.scale.x = (img.width / img.height) / 0.5;
      });
    }
    this.interactive(this.figure, 'figure', `${site.name} · 点击打个招呼`);

    // 欢迎语：悬在人物身后，走近时淡出
    const welcomeTex = canvasTex(1024, 400, (c, w) => {
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `200px ${FONT_BRUSH}`;
      c.fillStyle = '#141414';
      c.fillText(site.welcome, w / 2 - 40, 170);
      seal(c, w - 150, 70, 104, site.seal, 21);
      c.font = `500 44px ${FONT_SERIF}`;
      c.fillStyle = '#3a3633';
      c.fillText(`我是${site.name} · ${site.role}`, w / 2, 336);
    });
    this.welcomeMat = new THREE.MeshBasicMaterial({ map: welcomeTex, transparent: true, depthWrite: false, fog: false });
    place(new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.72), this.welcomeMat), 0.35, 3.15, FIG_Z - 0.9, g);
  }

  enter(from: RoomId | null) {
    const rig = this.ctx.rig;
    this.tween?.kill();
    const gi = GATES.findIndex((gt) => gt.id === from);
    const gate = GATES[gi];
    if (gate) {
      // 从门里出来：门板保持翻开，镜头从门洞里退出来、落回廊道上的正对位置，继续滚动即可前行
      this.scroll = dwellScroll(gi, 1);
      this.update(0, 0);
      const n = this.panelNormal(gi);
      const c = this.portals[gi].center;
      rig.curPos.copy(c).addScaledVector(n, 0.3);
      rig.curTarget.copy(c).addScaledVector(n, 6);
      return;
    } else {
      this.scroll = 0;
      rig.curPos.set(0, 2.1, OUT_Z + 6);
      rig.curTarget.set(0, 2.3, GATE_Z - 4);
    }
    this.update(0, 0);
  }

  addScroll(delta: number) {
    this.tween?.kill();
    super.addScroll(delta);
  }

  update(dt: number, t: number) {
    const rig = this.ctx.rig;
    const S = THREE.MathUtils.smoothstep;
    const step = walk(this.scroll);
    const z = camZ(step.t);
    // 院子里镜头居中对称，进回廊后逐渐偏向右侧
    const b = S(-z, -12, -5);
    // 站在门外时略抬头，多露出门楼上方的天空；往前走逐渐放平
    const lift = 1.5 * S(z, OPEN_END_Z - 3, OUT_Z);
    rig.pos.set(CAM_X * b, CAM_Y, z);
    rig.target.set(-0.5 * b, 1.9 - 0.15 * b + lift, z - 15.5);

    // 门板翻出：按滚动位置算目标角度，再平滑跟随（与镜头的跟随速度一致）；dt = 0 时直接到位
    const k = dt > 0 ? 1 - Math.exp(-dt * 3.5) : 1;
    let peak = -1;
    let peakTilt = 0;
    this.gatePanels.forEach((p, i) => {
      p.tilt += (tiltAt(i, z) - p.tilt) * k;
      if (p.tilt > peakTilt) {
        peakTilt = p.tilt;
        peak = i;
      }
    });
    this.syncGatePanels();
    if (this.isPortrait && peak >= 0) {
      // 竖屏太窄，单靠门板翻转门会落在画面外：退半步、略偏头看向门
      rig.pos.x += 0.85 * peakTilt;
      rig.pos.z += 1.0 * peakTilt;
      rig.target.lerp(this.portals[peak].center, peakTilt);
    }

    // 门的开合、欢迎语的淡出都跟随镜头实际位置，滚动多快都保持同步
    const cz = rig.curPos.z;
    const open = S(-cz, -(OUT_Z - 0.2), -(OPEN_END_Z + 0.3));
    this.doorL.rotation.y = open * 1.45;
    this.doorR.rotation.y = -open * 1.45;
    if (open > 0.35 && !store.doorOpen) store.doorOpen = true; // 门推开了：琴声从这一刻起
    this.welcomeMat.opacity = S(cz, FIG_Z + 1, FIG_Z + 4.5);

    const fw = this.figure.position;
    this.figure.rotation.y = Math.atan2(rig.curPos.x - fw.x, cz - fw.z);
    if (this.figureFrames.length > 1) this.figure.material.map = this.figureFrames[Math.floor(t * 2.4) % 2];

    const hint =
      peakTilt > 0.6
        ? `「${rooms[GATES[peak].id].gate}」· 点击月洞门进入，继续滚动前行`
        : cz > OPEN_END_Z + 0.4
          ? GATE_HINT
          : cz > Z0
            ? '继续前行 · 进入回廊'
            : null;
    if (store.hint !== hint) store.hint = hint;

    this.lanterns.forEach((l, i) => (l.rotation.z = Math.sin(t * 0.9 + i * 1.7) * 0.04));
    this.pond.update(t);
    this.qinPlayer.update(dt, this.ctx.musicTime(), t);
    // 云左右缓慢来回飘，不会飘出画面
    this.skyClouds.forEach((c, i) => (c.obj.position.x = c.x0 + Math.sin(t * c.speed + i * 1.7) * 2.5));
  }

  click(key: string) {
    if (key.startsWith('gate:')) {
      this.ctx.goTo(key.slice(5) as RoomId);
    } else if (key === 'door') {
      this.tween?.kill();
      this.tween = gsap.to(this, { scroll: Math.max(this.scroll, scrollAt(FIG_Z + 4.5)), duration: 3.4, ease: 'power2.inOut' });
    } else if (key === 'qin') {
      this.ctx.openCard({
        kicker: '园中抚琴',
        title: '《墨园小品》',
        meta: '古琴 · 正调',
        body: [
          '你听到的琴声，是此刻在浏览器里实时合成的，他的手跟着每一个音在动。',
          '曲子按古琴曲的章法写成：散起、主题、泛音、对比、再现、尾声。',
        ],
        actions: [{ label: store.musicPlaying ? '关闭琴音' : '开启琴音', music: true }],
      });
    } else if (key === 'figure') {
      this.ctx.openCard({
        kicker: site.welcome,
        title: `你好，我是${site.name}`,
        meta: site.role,
        body: about.bio,
        actions: [{ label: '去看看「关于我」', room: 'about' }],
      });
    }
  }

  /** 音频引擎排好一个音时，由 Experience 转进来 */
  feedNote(n: PlayedNote) {
    this.qinPlayer?.feed(n);
  }

  exitPath(to: RoomId) {
    const i = GATES.findIndex((gt) => gt.id === to);
    if (i < 0) return null;
    // 沿门板当前的朝向飞进门洞（门板翻到哪个角度都对得上）
    const n = this.panelNormal(i);
    const c = this.portals[i].center;
    return {
      pos: c.clone().addScaledVector(n, 0.18),
      target: c.clone().addScaledVector(n, -6),
    };
  }
}
