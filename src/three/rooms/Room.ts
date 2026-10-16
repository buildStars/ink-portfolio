import * as THREE from 'three';
import { store, type CardData, type RoomId } from '../../store';
import type { Rig } from '../Rig';
import { CINNABAR } from '../paint';

/** 在房间起点往回滚多少（滚轮约 3 下）就退出回廊 */
const BACK_THRESHOLD = 300;
const BACK_RESET_MS = 700;

export interface RoomContext {
  scene: THREE.Scene;
  rig: Rig;
  camera: THREE.PerspectiveCamera;
  lowQuality: boolean;
  openCard(card: CardData): void;
  goTo(room: RoomId): void;
  /** 音频时钟上「此刻听到」的时间；琴音没在响时为 null */
  musicTime(): number | null;
}

/** 场景里的题签：用网页文字叠在 3D 画面上（不经过水墨滤镜，始终清晰），跟着 anchor 点移动 */
export interface SceneLabel {
  text: string;
  sub?: string;
  anchor: THREE.Vector3; // 世界坐标，题签的上边缘中点对齐到这里
}

/**
 * 每个「门后世界」都是一个 Room：自己搭场景、处理滚动和点击、告诉相机该去哪。
 * 所有房间在同一个 Three.js 场景里，按 X 方向错开摆放，只显示当前那一个。
 */
export abstract class Room {
  abstract readonly id: RoomId;
  readonly group = new THREE.Group();
  readonly interactives: THREE.Object3D[] = [];
  readonly labels: SceneLabel[] = [];
  fogDensity = 0.024;
  fov = 60;
  dragAxis: 'x' | 'y' = 'y';
  scrollSpeed = 0.01;
  scroll = 0;
  scrollMin = 0;
  scrollMax = 0;

  constructor(protected ctx: RoomContext, offsetX: number) {
    this.group.position.x = offsetX;
  }

  abstract build(): void;
  abstract enter(from: RoomId | null): void;
  abstract update(dt: number, t: number): void;

  get ox() {
    return this.group.position.x;
  }

  addScroll(delta: number) {
    const wasAtStart = this.atStart;
    this.scroll = THREE.MathUtils.clamp(this.scroll + delta * this.scrollSpeed, this.scrollMin, this.scrollMax);
    if (this.id === 'corridor') return;
    // 已在房间起点还继续往回滚：累积「退出力度」，够了就返回回廊；停顿一下会清零，避免误触
    if (delta < 0 && wasAtStart) {
      const now = performance.now();
      if (now - this.backAt > BACK_RESET_MS) this.backPressure = 0;
      this.backAt = now;
      this.backPressure += -delta;
      store.backProgress = Math.min(1, this.backPressure / BACK_THRESHOLD);
      if (this.backPressure >= BACK_THRESHOLD) {
        this.resetBack();
        this.ctx.goTo('corridor');
      }
    } else if (delta > 0) {
      this.resetBack();
    }
  }

  /** 是否停在房间起点（再往回滚就开始累积退出） */
  get atStart() {
    return this.scroll <= this.scrollMin + 1e-3;
  }

  /** 每帧调用：一段时间没有继续往回滚，就把退出进度清零 */
  tickBack() {
    if (store.backProgress > 0 && performance.now() - this.backAt > BACK_RESET_MS) this.resetBack();
  }

  private backPressure = 0;
  private backAt = 0;

  private resetBack() {
    this.backPressure = 0;
    store.backProgress = 0;
  }

  addDrag(dx: number, dy: number) {
    this.addScroll((this.dragAxis === 'y' ? -dy : -dx) * 2.5);
  }

  click(_key: string, _obj?: THREE.Object3D) {}

  /** 按网址里的条目打开详情（如 #/gallery/wedding）；没有这个条目返回 false */
  openItem(_item: string): boolean {
    return false;
  }

  onCardClosed() {}

  /** 从回廊的月洞门「透」进来时看到的视角（世界坐标），一般就是进入房间时的起始视角 */
  portalView(): { pos: THREE.Vector3; target: THREE.Vector3 } | null {
    return null;
  }

  /** 离开本房间前相机要走的一段路（例如穿过月洞门），没有则直接墨晕转场 */
  exitPath(_to: RoomId): { pos: THREE.Vector3; target: THREE.Vector3 } | null {
    return null;
  }

  setHover(obj: THREE.Object3D, on: boolean) {
    const mats = obj.userData.hl as (THREE.MeshLambertMaterial | THREE.MeshBasicMaterial)[] | undefined;
    mats?.forEach((m) => {
      if (m.userData.base === undefined) m.userData.base = m.color.getHex();
      m.color.setHex(on ? CINNABAR : m.userData.base);
    });
  }

  /** 注册可点击物体；hl 中的材质在悬停时变朱红 */
  protected interactive(obj: THREE.Object3D, key: string, label: string, hl: THREE.Material[] = []) {
    obj.userData.key = key;
    obj.userData.label = label;
    obj.userData.hl = hl;
    this.interactives.push(obj);
  }

  /** 房间局部坐标 → 世界坐标 */
  protected w(x: number, y: number, z: number) {
    return new THREE.Vector3(x + this.ox, y, z);
  }

  protected get isPortrait() {
    return this.ctx.camera.aspect < 1;
  }
}
