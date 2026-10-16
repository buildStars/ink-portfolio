import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import gsap from 'gsap';
import { store, type CardData, type RoomId } from '../store';
import * as content from '../content';
import { InkShader } from './InkShader';
import { Rig } from './Rig';
import { PAPER, loadFonts } from './paint';
import type { Room, RoomContext } from './rooms/Room';
import { Corridor, PORTAL_D } from './rooms/Corridor';
import type { PlayedNote } from '../audio/AudioEngine';
import type { Route } from '../router';

/** 背景音乐对 3D 场景公开的部分：院中抚琴者据此让手跟着琴音动 */
export interface MusicSource {
  onNote(fn: (n: PlayedNote) => void): () => void;
  heardTime(): number | null;
}
import { Gallery } from './rooms/Gallery';
import { Summit } from './rooms/Summit';
import { Ferry } from './rooms/Ferry';
import { Study } from './rooms/Study';

/** 各房间：加载页上的进度字样、怎么搭（房间沿 X 方向错开摆放） */
const ROOMS: Record<RoomId, { text: string; make: (ctx: RoomContext) => Room }> = {
  corridor: { text: '铺纸', make: (ctx) => new Corridor(ctx, 0) },
  gallery: { text: '悬画', make: (ctx) => new Gallery(ctx, 400) },
  about: { text: '登山', make: (ctx) => new Summit(ctx, 800) },
  contact: { text: '泊舟', make: (ctx) => new Ferry(ctx, 1200) },
  social: { text: '理案', make: (ctx) => new Study(ctx, 1600) },
};
/** 后台搭房间的先后：回廊（分享链接进来时还没搭）、再按沿回廊遇到月洞门的顺序 */
const BUILD_ORDER: RoomId[] = ['corridor', 'gallery', 'about', 'contact', 'social'];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** 等浏览器空闲（3D 场景每帧都在画，空闲时段不多，最多等 0.25 秒；不支持的浏览器退回计时器） */
const idle = () =>
  new Promise<void>((r) => ('requestIdleCallback' in window ? requestIdleCallback(() => r(), { timeout: 250 }) : setTimeout(r, 0)));

/**
 * 加载途中让出主线程一下，好让加载页刷新进度。
 * 不能只等下一帧：标签页在后台、窗口被挡住时浏览器不再出帧，加载会一直停住。
 * 所以和一个短计时器赛跑；后台标签页里计时器也会被限速，改用不受限速的 MessageChannel。
 */
function breathe() {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    if (document.hidden) {
      const ch = new MessageChannel();
      ch.port1.onmessage = finish;
      ch.port2.postMessage(0);
      return;
    }
    requestAnimationFrame(finish);
    setTimeout(finish, 50);
  });
}

export class Experience {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private ink: ShaderPass;
  private rig: Rig;
  private ctx!: RoomContext;
  private rooms: Partial<Record<RoomId, Room>> = {};
  private pending = new Map<RoomId, Promise<Room>>(); // 正在搭的房间
  private lastInput = 0; // 访客最近一次滚动、拖动、按键的时间：后台搭房间时避开
  private current!: Room;
  private clock = new THREE.Clock();
  private raf = 0;
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private hovered: THREE.Object3D | null = null;
  private pointer = { down: false, id: -1, sx: 0, sy: 0, lx: 0, ly: 0, dragged: false };
  private lowQuality: boolean;
  private disposed = false;
  private music: MusicSource | null = null;
  // 题签图层：网页文字叠在画布上，跟着场景里的点移动
  private labelLayer = document.createElement('div');
  private labelEls: HTMLDivElement[] = [];
  private labelV = new THREE.Vector3();
  // 月洞门透景用的虚拟相机与临时变量
  private portalCam = new THREE.PerspectiveCamera();
  private portalAnchor = new THREE.Object3D();
  private portalMat = new THREE.Matrix4();
  private portalScale = new THREE.Vector3();
  private portalDir = new THREE.Vector3();
  private frustum = new THREE.Frustum();
  private frustumMat = new THREE.Matrix4();
  private portalSphere = new THREE.Sphere(new THREE.Vector3(), 1.3);

  constructor(private container: HTMLElement) {
    // 录宣传片（开发模式 ?promo）时强制高画质：录制窗口再小也按电脑画质渲染
    const promo = import.meta.env.DEV && new URLSearchParams(location.search).has('promo');
    this.lowQuality = !promo && (matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600);
    store.lowQuality = this.lowQuality;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = !this.lowQuality;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.labelLayer.className = 'scene-labels';
    container.appendChild(this.labelLayer);

    this.scene.background = new THREE.Color(PAPER);
    this.scene.fog = new THREE.FogExp2(PAPER, 0.024);
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 700);
    this.rig = new Rig(this.camera);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8f8b84, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(14, 18, -6);
    sun.target.position.set(0, 0, -12);
    sun.castShadow = !this.lowQuality;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 90 });
    sun.shadow.bias = -0.0004;
    this.scene.add(sun, sun.target);

    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.lowQuality ? 0 : 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ink = new ShaderPass(InkShader);
    this.composer.addPass(this.ink);
    this.onResize();
  }

  private pixelRatio() {
    return Math.min(devicePixelRatio, this.lowQuality ? 1.25 : 2);
  }

  /**
   * 加载：只先搭访客第一眼要看到的那一处（默认是大门与回廊，分享链接则是对应房间），
   * 其余房间进园后趁访客没在操作时在后台搭（buildRest），首屏能早一两秒出来。
   */
  async init(route: Route = { room: 'corridor' }) {
    store.progressText = '研墨';
    store.progress = 0.05;
    await loadFonts(JSON.stringify(content) + '印回廊画廊山巅渡口书房');
    store.progress = 0.3;

    this.ctx = {
      scene: this.scene,
      rig: this.rig,
      camera: this.camera,
      lowQuality: this.lowQuality,
      openCard: (card: CardData) => (store.card = card),
      goTo: (id: RoomId) => void this.goTo(id),
      musicTime: () => this.music?.heardTime() ?? null,
    };
    const first = await this.ensureRoom(route.room, true);
    if (this.disposed) return;

    this.onResize();
    this.switchRoom(first.id, null);
    this.bindEvents();
    this.clock.start();
    this.loop();
    store.progress = 1;
    store.phase = 'ready';
  }

  /** 搭好某个房间（只搭一次，重复调用拿到同一个结果）：建场景 → 预编译着色器、上传贴图 */
  private ensureRoom(id: RoomId, loading = false): Promise<Room> {
    const built = this.rooms[id];
    if (built) return Promise.resolve(built);
    let job = this.pending.get(id);
    if (!job) {
      job = this.buildRoom(id, loading);
      this.pending.set(id, job);
    }
    return job;
  }

  private async buildRoom(id: RoomId, loading: boolean) {
    const spec = ROOMS[id];
    if (loading) store.progressText = spec.text;
    await breathe();
    const room = spec.make(this.ctx);
    room.build();
    room.group.visible = false;
    this.scene.add(room.group);
    if (loading) {
      store.progressText = '落款';
      store.progress = 0.6;
      await breathe();
    }
    await this.warmUp(room, loading);
    // 预热完才登记：月洞门透景、转场只会用到已经编译好的房间
    this.rooms[id] = room;
    this.pending.delete(id);
    if (id === 'corridor') this.onResize(); // 给月洞门透景的渲染目标分配大小
    return room;
  }

  /** 进园后按访客沿回廊遇到月洞门的顺序，把其余房间搭好；访客正在滚动、拖动或转场时先等一等，免得卡顿 */
  private async buildRest() {
    await sleep(1200); // 先让进门的镜头动画走完
    let first = true;
    for (const id of BUILD_ORDER) {
      if (this.rooms[id]) continue;
      // 第一个要搭的不等访客停手：它最先出现在月洞门里，越早搭好越好
      while (!this.disposed && (store.transitioning || (!first && performance.now() - this.lastInput < 400))) await sleep(150);
      if (this.disposed) return;
      first = false;
      await idle();
      await this.ensureRoom(id);
    }
  }

  /** 接上背景音乐：排好的每个音都转给院中抚琴者 */
  setMusicSource(src: MusicSource) {
    this.music = src;
    src.onNote((n) => (this.rooms.corridor as Corridor | undefined)?.feedNote(n));
  }

  /**
   * 预热（借鉴 portfolio-itom）：把房间的着色器编译好、贴图传进显卡，
   * 第一次走进去时不会再因为现编译、现上传而卡一下。隐藏着的房间也能编译（按场景里的灯光）。
   */
  private async warmUp(room: Room, loading: boolean) {
    // 异步编译：支持 KHR_parallel_shader_compile 的浏览器不会阻塞主线程，加载动画不卡
    await this.renderer.compileAsync(room.group, this.camera, this.scene);
    if (loading) store.progressText = '润笔';
    const textures = new Set<THREE.Texture>();
    room.group.traverse((o) => {
      const mats = (o as THREE.Mesh).material;
      if (!mats) return;
      for (const m of Array.isArray(mats) ? mats : [mats]) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v);
        const uniforms = (m as THREE.ShaderMaterial).uniforms;
        if (uniforms) for (const u of Object.values(uniforms)) if (u.value instanceof THREE.Texture) textures.add(u.value);
      }
    });
    let n = 0;
    for (const t of textures) {
      if (t.isRenderTargetTexture) continue; // 门洞透景的渲染目标不需要预先上传
      this.renderer.initTexture(t);
      if (++n % 12 === 0) await breathe(); // 分批上传，让出主线程
    }
  }

  /**
   * 加载完成后进园：默认停在大门外，镜头缓缓推近；
   * 网址指向某个房间（分享链接、刷新页面）时直接进那个房间，跳过大门。
   */
  async enter(route: Route = { room: 'corridor' }) {
    const room = await this.ensureRoom(route.room); // 加载途中网址变了，就现搭要去的房间
    store.phase = 'entered';
    if (this.current === room) room.enter(null);
    else this.switchRoom(route.room, null);
    if (route.item) this.current.openItem(route.item);
    void this.buildRest();
  }

  /** 跟着网址走（浏览器前进后退、手动改网址）：换房间、开关作品详情 */
  async follow(route: Route) {
    if (store.phase !== 'entered') return;
    if (route.room !== this.current.id) {
      await this.goTo(route.room);
      if (this.current.id !== route.room) return; // 正在转场没去成：转场结束后 App 会再按网址同步一次
    }
    if (route.item) {
      if (store.card?.item !== route.item) this.current.openItem(route.item);
    } else if (store.card?.item) {
      store.card = null;
    }
  }

  async goTo(id: RoomId) {
    if (store.transitioning || id === this.current.id || store.phase !== 'entered') return;
    store.transitioning = true;
    store.card = null;
    this.setHovered(null);
    const exit = this.current.exitPath(id);
    const tl = gsap.timeline();
    this.ink.uniforms.uCenter.value.set(0.5, 0.5);
    if (exit) {
      this.rig.locked = true;
      tl.to(this.rig.curPos, { x: exit.pos.x, y: exit.pos.y, z: exit.pos.z, duration: 1.3, ease: 'power2.inOut' }, 0);
      tl.to(this.rig.curTarget, { x: exit.target.x, y: exit.target.y, z: exit.target.z, duration: 1.3, ease: 'power2.inOut' }, 0);
    }
    tl.to(this.ink.uniforms.uProgress, { value: 1, duration: 0.9, ease: 'power2.in' }, exit ? 0.6 : 0);
    await tl;
    await this.ensureRoom(id); // 访客走得比后台搭建快：趁墨晕盖住画面时现搭
    this.rig.locked = false;
    this.switchRoom(id, this.current.id);
    await gsap.to(this.ink.uniforms.uProgress, { value: 0, duration: 1.1, ease: 'power2.out', delay: 0.1 });
    store.transitioning = false;
  }

  cardClosed() {
    this.current?.onCardClosed();
  }

  private switchRoom(id: RoomId, from: RoomId | null) {
    const room = this.rooms[id];
    if (!room) return;
    if (this.current) this.current.group.visible = false;
    this.current = room;
    room.group.visible = true;
    (this.scene.fog as THREE.FogExp2).density = room.fogDensity;
    this.rig.fov = room.fov;
    this.camera.fov = room.fov;
    this.camera.updateProjectionMatrix();
    room.enter(from);
    this.buildLabels(room);
    store.room = id;
    if (id !== 'corridor') store.doorOpen = true; // 从分享链接直接进房间，也算进了园
  }

  // ---------- 输入 ----------
  private bindEvents() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onDown);
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp);
    addEventListener('pointercancel', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    addEventListener('keydown', this.onKey);
    addEventListener('resize', this.onResize);
  }

  private get interactive() {
    return store.phase === 'entered' && !store.transitioning;
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.lastInput = performance.now();
    if (!this.interactive) return;
    const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    this.current.addScroll(d);
  };

  private onDown = (e: PointerEvent) => {
    if (!this.interactive) return;
    Object.assign(this.pointer, { down: true, id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, dragged: false });
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') this.rig.look.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5);
    if (!this.interactive) return;
    const p = this.pointer;
    if (p.down && e.pointerId === p.id) {
      this.lastInput = performance.now();
      if (!p.dragged && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6) {
        p.dragged = true;
        this.setHovered(null);
      }
      if (p.dragged) this.current.addDrag(e.clientX - p.lx, e.clientY - p.ly);
      p.lx = e.clientX;
      p.ly = e.clientY;
      return;
    }
    if (e.pointerType === 'mouse' && e.target === this.renderer.domElement) {
      this.setHovered(this.pick(e.clientX, e.clientY), e.clientX, e.clientY);
    } else if (e.target !== this.renderer.domElement) {
      this.setHovered(null);
    }
  };

  private onUp = (e: PointerEvent) => {
    const p = this.pointer;
    if (!p.down || e.pointerId !== p.id) return;
    p.down = false;
    if (p.dragged || !this.interactive || e.type === 'pointercancel') return;
    const hit = this.pick(e.clientX, e.clientY);
    if (hit) this.current.click(hit.userData.key, hit);
    else if (store.card) store.card = null;
  };

  private onKey = (e: KeyboardEvent) => {
    this.lastInput = performance.now();
    if (!this.interactive) return;
    if (e.key === 'Escape') {
      if (store.card) store.card = null;
      else if (this.current.id !== 'corridor') void this.goTo('corridor');
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') this.current.addScroll(120);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') this.current.addScroll(-120);
  };

  private pick(x: number, y: number) {
    this.ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.current.interactives, false);
    for (const h of hits) {
      if (h.object.userData.key) return h.object;
    }
    return null;
  }

  private setHovered(obj: THREE.Object3D | null, x = 0, y = 0) {
    if (obj !== this.hovered) {
      if (this.hovered) this.current.setHover(this.hovered, false);
      if (obj) this.current.setHover(obj, true);
      this.hovered = obj;
      this.renderer.domElement.style.cursor = obj ? 'pointer' : '';
    }
    store.hover = obj ? { label: obj.userData.label, x, y } : null;
  }

  private onResize = () => {
    const pr = this.pixelRatio();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(innerWidth, innerHeight);
    this.ink.uniforms.res.value.set(innerWidth * pr, innerHeight * pr);
    this.resizePortals(innerWidth * pr, innerHeight * pr);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  };

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    this.current.update(dt, t);
    this.current.tickBack();
    const atStart = this.current.id !== 'corridor' && this.current.atStart;
    if (store.atRoomStart !== atStart) store.atRoomStart = atStart;
    this.rig.update(dt);
    this.renderPortals();
    this.composer.render();
    this.updateLabels();
  };

  // ---------- 题签 ----------
  private buildLabels(room: Room) {
    this.labelEls = room.labels.map((l) => {
      const el = document.createElement('div');
      el.className = 'scene-label hidden';
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = l.text;
      el.append(t);
      if (l.sub) {
        const s = document.createElement('span');
        s.className = 's';
        s.textContent = l.sub;
        el.append(s);
      }
      return el;
    });
    this.labelLayer.replaceChildren(...this.labelEls);
  }

  /** 把题签摆到锚点在屏幕上的位置；字号随远近缩放，但不小于 16px */
  private updateLabels() {
    const labels = this.current.labels;
    if (!labels.length) return;
    // 转场时、竖屏打开信息卡时（卡片盖住下半屏）先藏起来
    const hide = store.transitioning || store.phase !== 'entered' || (!!store.card && this.camera.aspect < 1);
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    labels.forEach((l, i) => {
      const el = this.labelEls[i];
      const v = this.labelV.copy(l.anchor).project(this.camera);
      const on = !hide && v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.1;
      el.classList.toggle('hidden', !on);
      if (!on) return;
      const pxPerM = innerHeight / (2 * tan * this.camera.position.distanceTo(l.anchor));
      el.style.fontSize = `${THREE.MathUtils.clamp(pxPerM * 0.17, 16, 28).toFixed(1)}px`;
      el.style.transform = `translate(${(((v.x + 1) / 2) * innerWidth).toFixed(1)}px, ${(((1 - v.y) / 2) * innerHeight).toFixed(1)}px) translate(-50%, 0)`;
    });
  }

  // ---------- 月洞门透景 ----------
  private get corridor() {
    return this.rooms.corridor as Corridor | undefined;
  }

  private resizePortals(pxW: number, pxH: number) {
    const c = this.corridor;
    if (!c) return;
    c.portalRes.set(pxW, pxH);
    const s = this.lowQuality ? 0.35 : 0.5;
    for (const p of c.portals) p.rt.setSize(Math.max(1, Math.round(pxW * s)), Math.max(1, Math.round(pxH * s)));
  }

  /**
   * 在回廊里时，把近处、在视野前方的每道月洞门后面的房间渲染到门洞贴图：
   * 虚拟相机 = 房间里的「虚拟窗」· 门框⁻¹ · 主相机，所以门洞里的画面会随走位产生真实的透视变化。
   */
  private renderPortals() {
    const c = this.corridor;
    if (!c || this.current !== c) return;
    const cam = this.camera;
    const r = this.renderer;
    const fog = this.scene.fog as THREE.FogExp2;
    const density = fog.density;
    const autoShadow = r.shadowMap.autoUpdate;
    const range = this.lowQuality ? 14 : 22;
    cam.updateMatrixWorld();
    cam.getWorldDirection(this.portalDir);
    this.frustum.setFromProjectionMatrix(this.frustumMat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    this.portalCam.projectionMatrix.copy(cam.projectionMatrix);
    this.portalCam.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
    r.shadowMap.autoUpdate = false;
    for (const p of c.portals) {
      const toGate = p.center.clone().sub(cam.position);
      if (toGate.length() > range || toGate.dot(this.portalDir) < 0) continue;
      // 不在画面里的门不渲染
      if (!this.frustum.intersectsSphere(this.portalSphere.set(p.center, 1.3))) continue;
      const room = this.rooms[p.id];
      if (!room) {
        // 门后的房间还在后台搭：先透出一片纸色（只画背景）
        c.group.visible = false;
        r.setRenderTarget(p.rt);
        r.clear();
        r.render(this.scene, cam);
        c.group.visible = true;
        continue;
      }
      const view = room.portalView();
      if (!view) continue;
      const fwd = view.target.clone().sub(view.pos).normalize();
      this.portalAnchor.position.copy(view.pos).addScaledVector(fwd, PORTAL_D);
      this.portalAnchor.lookAt(view.pos);
      this.portalAnchor.updateMatrixWorld();
      this.portalMat.multiplyMatrices(this.portalAnchor.matrixWorld, p.frameInverse).multiply(cam.matrixWorld);
      this.portalMat.decompose(this.portalCam.position, this.portalCam.quaternion, this.portalScale);
      c.group.visible = false;
      room.group.visible = true;
      fog.density = room.fogDensity;
      r.setRenderTarget(p.rt);
      r.clear();
      r.render(this.scene, this.portalCam);
      room.group.visible = false;
      c.group.visible = true;
    }
    r.setRenderTarget(null);
    fog.density = density;
    r.shadowMap.autoUpdate = autoShadow;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onDown);
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerup', this.onUp);
    removeEventListener('pointercancel', this.onUp);
    el.removeEventListener('wheel', this.onWheel);
    removeEventListener('keydown', this.onKey);
    removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.labelLayer.remove();
    el.remove();
  }

  /**
   * 开发用：录宣传片时由 src/promo/record.ts 逐帧驱动场景（固定时间步长，不靠浏览器出帧）。
   * 正式打包时 import.meta.env.DEV 为 false，整段会被当作死代码删掉。
   */
  promoHooks() {
    if (!import.meta.env.DEV) return null;
    return {
      rig: this.rig,
      ink: this.ink,
      canvas: this.renderer.domElement,
      room: () => this.current,
      ensureAll: () => Promise.all(BUILD_ORDER.map((id) => this.ensureRoom(id))),
      switchRoom: (id: RoomId, from: RoomId | null) => this.switchRoom(id, from),
      stopLoop: () => cancelAnimationFrame(this.raf),
      setMusic: (src: MusicSource) => this.setMusicSource(src),
      setSize: (w: number, h: number) => {
        this.renderer.setPixelRatio(1);
        this.renderer.setSize(w, h, false);
        this.composer.setPixelRatio(1);
        this.composer.setSize(w, h);
        this.ink.uniforms.res.value.set(w, h);
        this.resizePortals(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
      },
      /** 先让房间按滚动值摆好镜头目标（之后录制脚本还能再微调 rig.target） */
      update: (dt: number, t: number) => this.current.update(dt, t),
      /** 镜头跟随一步；draw 为 false 时只推进镜头不出图（分镜预览跳过的帧） */
      render: (dt: number, draw = true) => {
        this.rig.update(dt);
        if (!draw) return;
        this.renderPortals();
        this.composer.render();
      },
    };
  }

  /** 调试用：渲染指定尺寸的一帧并返回 PNG */
  snapshot(w = 1920, h = 1080) {
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(1);
    this.composer.setSize(w, h);
    this.ink.uniforms.res.value.set(w, h);
    this.resizePortals(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.rig.snap();
    this.rig.update(0.016);
    this.renderPortals();
    this.composer.render();
    const data = this.renderer.domElement.toDataURL('image/png');
    this.onResize();
    return data;
  }
}
