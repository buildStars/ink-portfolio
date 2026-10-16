import * as THREE from 'three';
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { AudioEngine, type PlayedNote } from '../audio/AudioEngine';
import { rooms, site } from '../content';
import { store, type RoomId } from '../store';
import type { Experience } from '../three/Experience';
import { FONT_BRUSH, seal } from '../three/paint';

/**
 * 宣传片录制（只在开发模式下可用）：
 *   http://localhost:5190/?promo=landscape  横屏 1920×1080
 *   http://localhost:5190/?promo=portrait   竖屏 1080×1920
 * 场景按下面的剧本一帧一帧渲染（固定 30fps 步长，不受电脑快慢影响），叠上字幕，
 * 配上离线渲染的古琴曲（抚琴人的手与琴音同步），用浏览器自带的 WebCodecs 编码成 MP4，
 * 存到项目的 promo/ 目录。改了 content.ts 后重新打开上面的地址即可重录。
 */

type Hooks = NonNullable<ReturnType<Experience['promoHooks']>>;
type Orient = 'landscape' | 'portrait';

const FPS = 30;
const DURATION = 32;
const RATE = 48000;
const PAPER = '#ece6d8';
const INK = '#161616';
const INK_SOFT = '#3a3633';

// ---------- 小工具 ----------
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const sine = (x: number) => (1 - Math.cos(Math.PI * clamp01(x))) / 2;
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
/** 包络：a→b 升到 1，c→d 降回 0 */
const env = (t: number, a: number, b: number, c: number, d: number) => Math.min(smooth(ramp(t, a, b)), 1 - smooth(ramp(t, c, d)));

/** 单调三次插值：关键帧之间平滑过渡、不回头，起止速度为 0（镜头缓起缓停） */
function monotone(keys: [number, number][]) {
  const n = keys.length;
  const d = keys.slice(0, -1).map(([x, y], i) => (keys[i + 1][1] - y) / (keys[i + 1][0] - x));
  const m = keys.map((_, i) => (i === 0 || i === n - 1 ? 0 : Math.min((d[i - 1] + d[i]) / 2, 3 * d[i - 1], 3 * d[i])));
  return (x: number) => {
    if (x <= keys[0][0]) return keys[0][1];
    if (x >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (x > keys[i + 1][0]) i++;
    const [x0, y0] = keys[i];
    const [x1, y1] = keys[i + 1];
    const h = x1 - x0;
    const s = (x - x0) / h;
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * h * m[i + 1];
  };
}

// ---------- 剧本 ----------
const WALK_START = 3;
const WALK_END = 18.6;
/** 回廊滚动值随时间：推门 → 门口 → 院中锦鲤池 → 进回廊 → 停在第一道月洞门（画廊）前 */
// 院子里（抚琴者、锦鲤池一带）放慢脚步，留时间侧头去看
const walkScroll = monotone([[WALK_START, 0], [8.4, 9.1], [11, 15], [14, 21.5], [15.8, 27.1], [WALK_END, 33.6]]);
const QIN = new THREE.Vector3(-4.6, 1.3, 14.4); // 院中抚琴者
const POND = new THREE.Vector3(4.3, 0.3, 11.5); // 锦鲤池

/** 换房间的时刻：墨晕在 at 之前 inDur 秒内铺满画面，切换后 outDur 秒内散开 */
const CUTS: { id: RoomId; at: number; inDur: number; outDur: number; until: number }[] = [
  { id: 'gallery', at: 20.4, inDur: 0.8, outDur: 0.9, until: 24.4 },
  { id: 'about', at: 24.4, inDur: 0.3, outDur: 0.45, until: 25.8 },
  { id: 'contact', at: 25.8, inDur: 0.3, outDur: 0.45, until: 27.2 },
  { id: 'social', at: 27.2, inDur: 0.3, outDur: 0.45, until: DURATION },
];
const END_CARD = 28.6;

const caption = (id: RoomId) => {
  const r = rooms[id];
  return r.title === r.gate ? r.title : `${r.title}　${r.gate}`;
};
const CAPTIONS: { text: string; from: number; to: number }[] = [
  { text: '推门入园', from: 3.8, to: 8.2 },
  { text: '园中抚琴　池中观鱼', from: 10.2, to: 14.6 },
  { text: '每一道月洞门　通往一个世界', from: 15.4, to: 19.2 },
  { text: caption('gallery'), from: 21, to: 24.1 },
  { text: caption('about'), from: 24.6, to: 25.6 },
  { text: caption('contact'), from: 26, to: 27 },
  { text: caption('social'), from: 27.4, to: 28.5 },
];

const host = site.url.replace(/^https?:\/\//, '').replace(/\/$/, '') || location.host;

// ---------- 配乐：离线渲染古琴曲，同时记下每个音的时间给抚琴人 ----------
async function renderMusic() {
  const off = new OfflineAudioContext(2, RATE * DURATION, RATE);
  const engine = new AudioEngine('');
  const notes: PlayedNote[] = [];
  engine.onNote((n) => notes.push(n));
  engine.start(off);
  engine.setEnabled(true);
  engine.setRoom('corridor', 0);
  for (const c of CUTS) {
    engine.scheduleUntil(c.at); // 鸟鸣、水滴按当时所在房间的环境排
    engine.setRoom(c.id, c.at);
    engine.chime(c.at);
  }
  engine.scheduleUntil(DURATION + 1);
  const buffer = await off.startRendering();
  // 网站里琴声特意调得很轻；做视频要响一些：整体拉到峰值 -1dB，结尾 2.2 秒淡出
  let peak = 0;
  for (let ch = 0; ch < 2; ch++) for (const v of buffer.getChannelData(ch)) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.89 / peak : 1;
  const fade = 2.2 * RATE;
  for (let ch = 0; ch < 2; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] *= gain * Math.min(1, (d.length - i) / fade);
  }
  return { buffer, notes: notes.sort((a, b) => a.when - b.when) };
}

// ---------- 字幕 ----------
type G = CanvasRenderingContext2D;

function brushText(g: G, str: string, x: number, y: number, size: number, alpha: number, color = INK, spacing = 0.08) {
  if (alpha <= 0.001) return;
  g.save();
  g.globalAlpha = alpha;
  g.font = `${size}px ${FONT_BRUSH}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.letterSpacing = `${(size * spacing).toFixed(1)}px`;
  // 一圈宣纸色的晕，压在任何画面上都看得清
  g.shadowColor = 'rgba(236,230,216,0.95)';
  g.shadowBlur = size * 0.45;
  g.fillStyle = color;
  g.fillText(str, x, y);
  g.shadowBlur = size * 0.2;
  g.fillText(str, x, y);
  g.restore();
}

/** 字幕下方一笔淡墨 */
function stroke(g: G, cx: number, y: number, w: number, alpha: number) {
  if (alpha <= 0.001) return;
  g.save();
  g.globalAlpha = alpha * 0.7;
  g.strokeStyle = INK;
  g.lineCap = 'round';
  g.lineWidth = Math.max(2, w * 0.012);
  g.beginPath();
  g.moveTo(cx - w / 2, y + 2);
  g.quadraticCurveTo(cx - w / 6, y - 4, cx + w / 8, y + 1);
  g.quadraticCurveTo(cx + w / 3, y + 4, cx + w / 2, y - 1);
  g.stroke();
  g.restore();
}

function paper(g: G, W: number, H: number, alpha: number) {
  if (alpha <= 0.001) return;
  g.save();
  g.globalAlpha = Math.min(1, alpha);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  g.restore();
}

function overlays(g: G, t: number, W: number, H: number, portrait: boolean) {
  const u = portrait ? W / 1080 : H / 1080; // 以 1080 为基准的字号缩放

  // 片头：宣纸上浮出「墨园」
  paper(g, W, H, 1 - smooth(ramp(t, 0, 0.9)) + 0.5 * env(t, 0.3, 1, 2.8, 3.6));
  const ti = env(t, 0.5, 1.4, 2.9, 3.6);
  const ty = H * (portrait ? 0.38 : 0.4) - (1 - ti) * 12 * u;
  brushText(g, site.gatePlaque, W / 2, ty, 230 * u, ti, INK, 0.12);
  brushText(g, site.description, W / 2, ty + 165 * u, 48 * u, env(t, 0.9, 1.8, 2.9, 3.6), INK_SOFT, 0.1);
  if (ti > 0.01) {
    g.save();
    g.globalAlpha = env(t, 1.2, 1.7, 2.9, 3.6);
    seal(g, W / 2 + 270 * u, ty - 150 * u, 72 * u, site.seal, 21);
    g.restore();
  }

  // 字幕
  const cy = portrait ? H * 0.8 : H - 140 * u;
  for (const c of CAPTIONS) {
    const a = env(t, c.from, c.from + 0.6, c.to - 0.5, c.to);
    if (a <= 0) continue;
    const size = (portrait ? 64 : 54) * u;
    brushText(g, c.text, W / 2, cy - (1 - a) * 8 * u, size, a);
    stroke(g, W / 2, cy + size * 0.78, size * [...c.text].length * 0.75, a);
  }

  // 片尾：宣纸铺满，印章、名字、网址依次浮现
  if (t >= END_CARD) {
    paper(g, W, H, 0.95 * smooth(ramp(t, END_CARD, END_CARD + 0.8)));
    const k = portrait ? [0.3, 0.42, 0.49, 0.6, 0.665] : [0.24, 0.45, 0.555, 0.7, 0.8];
    const sa = smooth(ramp(t, END_CARD + 0.4, END_CARD + 0.8));
    if (sa > 0) {
      const s = 120 * u * (1 + 0.25 * (1 - sa)); // 盖章：从略大压到原尺寸
      g.save();
      g.globalAlpha = sa;
      seal(g, W / 2 - s / 2, H * k[0] - s / 2, s, site.seal, 21);
      g.restore();
    }
    brushText(g, site.name, W / 2, H * k[1], 175 * u, smooth(ramp(t, END_CARD + 0.7, END_CARD + 1.3)), INK, 0.14);
    brushText(g, `${site.role}　${site.title}`, W / 2, H * k[2], 48 * u, smooth(ramp(t, END_CARD + 0.9, END_CARD + 1.5)), INK_SOFT, 0.12);
    const ua = smooth(ramp(t, END_CARD + 1.2, END_CARD + 1.8));
    brushText(g, host, W / 2, H * k[3], 84 * u, ua, INK, 0.06);
    stroke(g, W / 2, H * k[3] + 58 * u, 84 * u * host.length * 0.55, ua);
    brushText(g, site.description, W / 2, H * k[4], 38 * u, smooth(ramp(t, END_CARD + 1.5, END_CARD + 2.1)), INK_SOFT, 0.12);
  }
}

// ---------- 镜头 ----------
function inkAt(t: number) {
  let p = 0;
  for (const c of CUTS) {
    // 铺开时先慢后快，散开时先快后慢
    if (t >= c.at - c.inDur && t < c.at) p = Math.max(p, ramp(t, c.at - c.inDur, c.at) ** 2);
    else if (t >= c.at && t < c.at + c.outDur) p = Math.max(p, (1 - ramp(t, c.at, c.at + c.outDur)) ** 2);
  }
  return p;
}

const aim = new THREE.Vector3();
/** 把视线朝 point 的方向转过去 w（0~1）：按方向插值，转头角度才跟权重成正比 */
function turnTo(rig: Hooks['rig'], point: THREE.Vector3, w: number) {
  if (w <= 0) return;
  const dist = rig.target.distanceTo(rig.pos);
  aim.subVectors(point, rig.pos).normalize().multiplyScalar(dist).add(rig.pos);
  rig.target.lerp(aim, w);
}

/** 院子里经过抚琴者、锦鲤池时，镜头侧过头去看（按镜头位置而不是时间，改了节奏也对得上）；竖屏视野窄，转得更多 */
function glance(rig: Hooks['rig'], portrait: boolean) {
  const z = rig.curPos.z;
  // 穿过院子时靠右走一点，和门口迎客的人物（在路左侧）拉开距离
  rig.pos.x += 0.8 * env(-z, -20.5, -18.5, -12, -9);
  // 走过人物之后再看抚琴者，免得人物贴在镜头前
  turnTo(rig, QIN, env(-z, -16.4, -15.6, -14.6, -13.6) * (portrait ? 1 : 0.7));
  turnTo(rig, POND, env(-z, -13.6, -12.8, -11.8, -10.6) * (portrait ? 0.85 : 0.55));
}

class Director {
  private flyFrom: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private flyTo: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private cut = -1;
  private range: [number, number] = [0, 0];

  constructor(private hooks: Hooks, private portrait: boolean) {}

  /** 片头的远景机位：竖屏视野窄，退得更远才能把门楼装进画面 */
  private opening(t: number) {
    const far = this.portrait ? new THREE.Vector3(0, 2.6, 46) : new THREE.Vector3(0, 2.6, 41);
    const near = this.portrait ? new THREE.Vector3(0, 1.8, 35) : new THREE.Vector3(0, 1.7, 33);
    const rig = this.hooks.rig;
    rig.curPos.lerpVectors(far, near, sine(t / WALK_START));
    rig.curTarget.set(0, 3.0, 16);
  }

  step(t: number, dt: number, draw = true) {
    const h = this.hooks;
    const rig = h.rig;
    h.ink.uniforms.uProgress.value = inkAt(t);

    // 到点换房间
    const next = CUTS.findIndex((c, i) => i > this.cut && t >= c.at);
    if (next >= 0) {
      this.cut = next;
      h.switchRoom(CUTS[next].id, h.room().id);
      rig.locked = false;
      const r = h.room();
      this.range = [r.scrollMin, r.scrollMax];
    }

    const room = h.room();
    if (t < WALK_START) {
      rig.locked = true;
      this.opening(t);
      h.update(dt, t);
    } else if (room.id === 'corridor' && t < WALK_END) {
      rig.locked = false;
      room.scroll = walkScroll(t);
      h.update(dt, t);
      glance(rig, this.portrait);
    } else if (room.id === 'corridor') {
      // 飞进第一道月洞门
      if (!this.flyFrom) {
        this.flyFrom = { pos: rig.curPos.clone(), target: rig.curTarget.clone() };
        this.flyTo = room.exitPath('gallery');
      }
      rig.locked = true;
      const k = sine(ramp(t, WALK_END, CUTS[0].at));
      rig.curPos.lerpVectors(this.flyFrom.pos, this.flyTo!.pos, k);
      rig.curTarget.lerpVectors(this.flyFrom.target, this.flyTo!.target, k);
      h.update(dt, t);
    } else {
      const c = CUTS[this.cut];
      const [a, b] = this.range;
      if (room.id === 'gallery') room.scroll = a + (b - a) * sine(ramp(t, c.at + 0.4, c.until));
      else if (room.id === 'about') room.scroll = 0.3 * sine(ramp(t, c.at, c.until + 0.3));
      else if (room.id === 'contact') room.scroll = 7 * sine(ramp(t, c.at, c.until + 0.3));
      else room.scroll = a + (b - a) * 0.6 * sine(ramp(t, c.at, DURATION));
      h.update(dt, t);
    }
    h.render(dt, draw);
  }
}

// ---------- 录制 ----------
export interface PromoStatus {
  orient: Orient;
  phase: string;
  frame: number;
  total: number;
  done: boolean;
  file?: string;
  error?: string;
}

export async function recordPromo(exp: Experience, orient: Orient) {
  const status: PromoStatus = { orient, phase: '准备', frame: 0, total: DURATION * FPS, done: false };
  (window as unknown as { __promo: PromoStatus }).__promo = status;
  const hooks = exp.promoHooks();
  if (!hooks) throw new Error('只能在开发模式下录制');
  const portrait = orient === 'portrait';
  const [W, H] = portrait ? [1080, 1920] : [1920, 1080];

  status.phase = '搭建全部房间';
  await hooks.ensureAll();
  hooks.stopLoop();
  hooks.setSize(W, H);
  const allText = [site.gatePlaque, site.description, site.name, site.role, site.title, host, site.seal, ...CAPTIONS.map((c) => c.text)].join('');
  await document.fonts.load(`64px ${FONT_BRUSH}`, allText);

  status.phase = '渲染配乐';
  const { buffer, notes } = await renderMusic();

  // 抚琴者的手跟着这段配乐：「此刻听到」就是视频里的时间
  const music = { heard: 0, feed: null as ((n: PlayedNote) => void) | null, next: 0 };
  hooks.setMusic({
    onNote: (fn) => {
      music.feed = fn;
      return () => {};
    },
    heardTime: () => music.heard,
  });

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H, frameRate: FPS },
    audio: { codec: 'aac', numberOfChannels: 2, sampleRate: RATE },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let failure: unknown = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (failure = e) });
  venc.configure({ codec: 'avc1.640028', width: W, height: H, bitrate: 14_000_000, framerate: FPS, latencyMode: 'quality' });
  const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => (failure = e) });
  aenc.configure({ codec: 'mp4a.40.2', sampleRate: RATE, numberOfChannels: 2, bitrate: 192_000 });

  const comp = document.createElement('canvas');
  comp.width = W;
  comp.height = H;
  const g = comp.getContext('2d')!;
  const director = new Director(hooks, portrait);
  const dt = 1 / FPS;

  status.phase = '逐帧渲染';
  for (let f = 0; f < status.total; f++) {
    if (failure) throw failure;
    const t = f / FPS;
    music.heard = t;
    while (music.feed && music.next < notes.length && notes[music.next].when <= t + 1.5) music.feed(notes[music.next++]);
    director.step(t, dt);
    g.drawImage(hooks.canvas, 0, 0, W, H);
    overlays(g, t, W, H, portrait);
    const frame = new VideoFrame(comp, { timestamp: Math.round((f * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    venc.encode(frame, { keyFrame: f % (FPS * 2) === 0 });
    frame.close();
    while (venc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 5));
    status.frame = f + 1;
  }
  await venc.flush();

  status.phase = '编码配乐';
  const BLOCK = 1024;
  for (let i = 0; i < buffer.length; i += BLOCK) {
    const n = Math.min(BLOCK, buffer.length - i);
    const data = new Float32Array(n * 2);
    data.set(buffer.getChannelData(0).subarray(i, i + n), 0);
    data.set(buffer.getChannelData(1).subarray(i, i + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i * 1e6) / RATE), data });
    aenc.encode(ad);
    ad.close();
  }
  await aenc.flush();
  if (failure) throw failure;
  muxer.finalize();

  status.phase = '保存';
  const name = `ink-portfolio-promo-${portrait ? '9x16' : '16x9'}.mp4`;
  const res = await fetch(`/__promo/save?name=${name}`, { method: 'POST', body: muxer.target.buffer });
  if (!res.ok) throw new Error(`保存失败：${res.status}`);
  status.file = `promo/${name}`;
  status.phase = '完成';
  status.done = true;
}

/**
 * 分镜预览：按剧本从头推进（跳过的帧只推进镜头不出图），在几个时间点截图拼成一张，
 * 存成 promo/storyboard-*.jpg，正式录之前先检查构图和字幕。
 */
export async function previewStoryboard(exp: Experience, orient: Orient, times: number[]) {
  const status: PromoStatus = { orient, phase: '准备', frame: 0, total: Math.ceil(Math.max(...times) * FPS) + 1, done: false };
  (window as unknown as { __promo: PromoStatus }).__promo = status;
  const hooks = exp.promoHooks();
  if (!hooks) throw new Error('只能在开发模式下预览');
  const portrait = orient === 'portrait';
  const [W, H] = portrait ? [1080, 1920] : [1920, 1080];
  await hooks.ensureAll();
  hooks.stopLoop();
  hooks.setSize(W, H);
  await document.fonts.load(`64px ${FONT_BRUSH}`, [site.gatePlaque, site.description, site.name, site.role, site.title, host, site.seal, ...CAPTIONS.map((c) => c.text)].join(''));
  const { notes } = await renderMusic();
  const music = { heard: 0, feed: null as ((n: PlayedNote) => void) | null, next: 0 };
  hooks.setMusic({ onNote: (fn) => ((music.feed = fn), () => {}), heardTime: () => music.heard });

  const cols = portrait ? 8 : 4;
  const tw = portrait ? 240 : 480;
  const th = Math.round((tw * H) / W);
  const sheet = document.createElement('canvas');
  sheet.width = cols * tw;
  sheet.height = Math.ceil(times.length / cols) * (th + 28);
  const sg = sheet.getContext('2d')!;
  sg.fillStyle = '#fff';
  sg.fillRect(0, 0, sheet.width, sheet.height);
  const comp = document.createElement('canvas');
  comp.width = W;
  comp.height = H;
  const g = comp.getContext('2d')!;
  const director = new Director(hooks, portrait);
  const wanted = new Set(times.map((t) => Math.round(t * FPS)));
  let shot = 0;
  status.phase = '推进剧本';
  for (let f = 0; f < status.total; f++) {
    const t = f / FPS;
    music.heard = t;
    while (music.feed && music.next < notes.length && notes[music.next].when <= t + 1.5) music.feed(notes[music.next++]);
    const draw = wanted.has(f);
    director.step(t, 1 / FPS, draw);
    if (draw) {
      g.drawImage(hooks.canvas, 0, 0, W, H);
      overlays(g, t, W, H, portrait);
      const x = (shot % cols) * tw;
      const y = Math.floor(shot / cols) * (th + 28);
      sg.drawImage(comp, x, y, tw, th);
      sg.fillStyle = '#000';
      sg.font = '20px sans-serif';
      sg.fillText(`${t.toFixed(1)}s`, x + 6, y + th + 21);
      shot++;
    }
    status.frame = f + 1;
    if (f % 30 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  const blob = await new Promise<Blob>((r) => sheet.toBlob((b) => r(b!), 'image/jpeg', 0.85));
  const name = `storyboard-${portrait ? '9x16' : '16x9'}.jpg`;
  await fetch(`/__promo/save?name=${name}`, { method: 'POST', body: blob });
  status.file = `promo/${name}`;
  status.phase = '完成';
  status.done = true;
}

const STORYBOARD = [0.6, 2, 4.5, 6.5, 9.2, 11.2, 12.8, 14.3, 15.8, 17.8, 19.6, 22.8, 24.9, 26.4, 27.9, 31];

/** 检查录好的视频：在几个时间点解码取帧，拼图存到 promo/check-*.jpg */
export async function checkVideo(orient: Orient) {
  const { sampleSheet } = await import('./verify');
  const tag = orient === 'portrait' ? '9x16' : '16x9';
  const r = await sampleSheet(`/promo/ink-portfolio-promo-${tag}.mp4`, [1.5, 5.5, 12.8, 17.8, 22.5, 31], orient === 'portrait' ? 270 : 480);
  const blob = await new Promise<Blob>((res) => r.sheet.toBlob((b) => res(b!), 'image/jpeg', 0.85));
  await fetch(`/__promo/save?name=check-${tag}.jpg`, { method: 'POST', body: blob });
  return { frames: r.frames, matched: r.matched, width: r.width, height: r.height };
}
(window as unknown as { __checkPromo: typeof checkVideo }).__checkPromo = checkVideo;

/** ?promo=landscape|portrait：等场景进园后开始录；加 &preview 只出分镜预览图 */
export async function autoRecord() {
  const params = new URLSearchParams(location.search);
  const orient: Orient = params.get('promo') === 'portrait' ? 'portrait' : 'landscape';
  const w = window as unknown as { __exp?: Experience; __promo?: PromoStatus };
  while (!w.__exp || store.phase !== 'entered') await new Promise((r) => setTimeout(r, 100));
  try {
    if (params.has('preview')) await previewStoryboard(w.__exp, orient, STORYBOARD);
    else await recordPromo(w.__exp, orient);
  } catch (err) {
    console.error(err);
    if (w.__promo) w.__promo.error = String(err);
  }
}
