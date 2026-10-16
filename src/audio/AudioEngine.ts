import type { RoomId } from '../store';

/**
 * 背景声音：实时合成的古琴曲 + 随房间变化的自然环境声，不依赖任何音频文件。
 * - 古琴：Karplus–Strong 拨弦合成，弦内加一级低通，高频泛音很快衰减，声音温润不尖；
 *   音区落在古琴本身的中低音（F2 ~ A4），泛音不高于 D5。
 * - 曲子：一首原创的小品，按古琴曲常见结构写成——散起 → 主题 → 泛音段 → 对比段 → 主题再现 → 尾声，
 *   用正调（F 宫五声），带走手音（弹后按弦滑音）、吟（缓颤）、泛音、撮（低音与旋律同弹）。
 *   循环播放，每遍的段落顺序、节奏松紧略有不同。换房间时曲子不中断，只换环境声。
 * - 环境声：风、水、瀑布用滤波噪声做，鸟鸣、水滴用短促的扫频正弦做。
 * - 也可在 content.ts 里填 site.music 换成自己的音乐文件（此时不再合成古琴，环境声保留）。
 */

type Layer = 'wind' | 'water' | 'fall' | 'birds';
interface Mood {
  layers: Record<Layer, number>;
  guqin: number;
}

const MOODS: Record<RoomId, Mood> = {
  corridor: { layers: { wind: 0.5, water: 0.25, fall: 0, birds: 1 }, guqin: 1 },
  gallery: { layers: { wind: 0.35, water: 0.8, fall: 0, birds: 0.6 }, guqin: 1 },
  about: { layers: { wind: 1, water: 0, fall: 0.7, birds: 0.5 }, guqin: 0.95 },
  contact: { layers: { wind: 0.4, water: 1, fall: 0, birds: 0.4 }, guqin: 1 },
  social: { layers: { wind: 0.1, water: 0, fall: 0, birds: 0.15 }, guqin: 1.1 },
};

/** 各环境层的基准音量（再乘以房间的比例） */
const LAYER_GAIN: Record<Layer, number> = { wind: 0.2, water: 0.2, fall: 0.09, birds: 0.045 };
const GUQIN_GAIN = 0.55;
const HARMONIC_GAIN = 0.16;
const MASTER = 0.8;
const PLUCK_SR = 22050; // 琴声已滤到 2.4kHz 以下，弦的波形用较低采样率算，省内存
const BPM = 58;

// ---------- 曲谱 ----------
// 记法：音名+八度（C4 = 中央 C），「:拍数」，「v」= 吟，「~音名」= 弹后滑到该音，
// 「^」= 泛音，「+」连接同时弹的音（撮），「r」= 休止，「|」= 句读（句尾略放慢、稍作停顿）
const SCORE = {
  intro: `
    F2+C3:3 ^F4:1.5 ^C5:1.5 ^A4:2 ^G4:1 ^F4:3 |
    D3:1.5 F3:1.5~G3 F3:3v |`,
  a: `
    C4:1 A3:1 G3:0.5 A3:0.5 C4:2v | D4:1~C4 A3:1 G3:1 F3:3v |
    F3:1 G3:1 A3:1.5 C4:0.5 D4:2v | F4:1~D4 C4:1 A3:1 C4:3v |
    D4:1 C4:1 A3:1 G3:1 | A3:1~G3 F3:1 D3:1 F2+F3:4v |`,
  harm: `
    ^C5:1 ^A4:1 ^G4:1 ^F4:1 ^G4:2 | ^A4:1 ^C5:1 ^D5:2 ^C5:1 ^A4:1 ^F4:3 |`,
  b: `
    F4:1 G4:1 A4:2v G4:1~F4 D4:1 F4:2 | C3+C4:2 D4:1 F4:1 G4:2v F4:1~D4 C4:3 |
    A3:1 C4:1 D4:1.5 C4:0.5 A3:1 G3:1 | A3:2v G3:1~F3 D3:1 F3:1 G3:1 A3:3v |
    D4:1 C4:1 A3:1 C4:1~D4 F4:2 D4:1 C4:1 | A3:1 G3:1 F3:2~G3 F3:1 C3+F3:4v |`,
  coda: `
    C4:1 A3:1 G3:1 F3:1~G3 | A3:2v F3:1 D3:1 | F2+C3+F3:5 ^F4:2 ^C5:4 |`,
};
type Section = keyof typeof SCORE;

interface Ev {
  beats: number;
  midis: number[];
  vib: boolean;
  to: number | null;
  harm: boolean;
  phraseEnd: boolean;
}

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midiOf = (name: string) => 12 * (Number(name.slice(1)) + 1) + PC[name[0]];

function parse(src: string): Ev[] {
  const out: Ev[] = [];
  for (const tok of src.trim().split(/\s+/)) {
    if (tok === '|') {
      if (out.length) out[out.length - 1].phraseEnd = true;
      continue;
    }
    const m = /^(\^)?([A-G]\d(?:\+[A-G]\d)*|r)(?::([\d.]+))?(v)?(?:~([A-G]\d))?$/.exec(tok);
    if (!m) throw new Error(`曲谱记号写错了：${tok}`);
    out.push({
      beats: Number(m[3] ?? 1),
      midis: m[2] === 'r' ? [] : m[2].split('+').map(midiOf),
      vib: !!m[4],
      to: m[5] ? midiOf(m[5]) : null,
      harm: !!m[1],
      phraseEnd: false,
    });
  }
  return out;
}
const SECTIONS = Object.fromEntries(Object.entries(SCORE).map(([k, v]) => [k, parse(v)])) as Record<Section, Ev[]>;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(arr: readonly T[]) => arr[(Math.random() * arr.length) | 0];

/** 排好的一个音（给院中抚琴者的手同步用）；when 为音频时钟上的出声时刻 */
export interface PlayedNote {
  when: number;
  midis: number[];
  harm: boolean;
  to: number | null;
  vib: boolean;
  dur: number;
}

export class AudioEngine {
  private ctx: BaseAudioContext | null = null;
  private master!: GainNode;
  private verb!: ConvolverNode;
  private guqinIn!: AudioNode;
  private guqinLevel!: GainNode;
  private bellIn!: GainNode;
  private layer = {} as Record<Layer, GainNode>;
  private plucks = new Map<number, { buffer: AudioBuffer; fix: number }>();
  private mood: Mood = MOODS.corridor;
  private enabled = false;
  private timer = 0;
  private media: HTMLAudioElement | null = null;
  // 演奏进度
  private queue: Ev[] = [];
  private qi = 0;
  private passes = 0;
  private nextTime = 0;
  private nextBird = 0;
  private nextDrip = 0;

  private noteListeners = new Set<(n: PlayedNote) => void>();

  constructor(private musicUrl = '') {}

  get started() {
    return !!this.ctx;
  }

  /** 订阅「排好了一个音」；返回取消订阅的函数 */
  onNote(fn: (n: PlayedNote) => void) {
    this.noteListeners.add(fn);
    return () => this.noteListeners.delete(fn);
  }

  /** 音频时钟上「此刻听到」的时间（扣掉输出延迟）；琴音没在响时返回 null */
  heardTime(): number | null {
    const c = this.ctx;
    if (!(c instanceof AudioContext) || !this.enabled || c.state !== 'running' || this.musicUrl) return null;
    return c.currentTime - (c.outputLatency || c.baseLatency || 0);
  }

  /**
   * 建立音频图（总音量为 0，要等 setEnabled(true) 才出声）。
   * 传入 OfflineAudioContext 时用于离线渲染试听。
   */
  start(offline?: BaseAudioContext) {
    if (this.ctx) return;
    const c = offline ?? new AudioContext({ latencyHint: 'playback' });
    this.ctx = c;
    this.build(c);
    if (!offline) {
      document.addEventListener('visibilitychange', this.onVisibility);
      this.timer = window.setInterval(() => this.scheduleUntil(c.currentTime + 1.5), 250);
    }
  }

  /**
   * 尝试让浏览器放行声音。在点击 / 按键 / 触摸的处理函数里调用一定成功；
   * 不在手势里时（比如开门那一刻），只有访客此前在页面上点过才可能成功。返回是否已能出声。
   */
  async unlock(): Promise<boolean> {
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive && !(this.ctx instanceof AudioContext && this.ctx.state === 'running')) return false;
    this.start();
    const c = this.ctx;
    if (!(c instanceof AudioContext)) return true;
    if (c.state === 'running') return true;
    const resumed = c.resume().then(
      () => true,
      () => false,
    );
    await Promise.race([resumed, new Promise((r) => setTimeout(r, 400))]);
    return (c.state as AudioContextState) === 'running';
  }

  setEnabled(on: boolean) {
    const c = this.ctx;
    if (!c) return;
    this.enabled = on;
    const now = c.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    if (on) {
      if (c instanceof AudioContext && c.state !== 'running') void c.resume();
      // 关着时不往下弹；重新打开时从下一个音接着弹，不会一下子补出一串音
      if (this.nextTime < now + 0.6) this.nextTime = now + 0.6;
      g.linearRampToValueAtTime(MASTER, now + 2.5);
      void this.media?.play().catch(() => {});
    } else {
      g.linearRampToValueAtTime(0, now + 0.8);
      setTimeout(() => {
        if (!this.enabled) {
          this.media?.pause();
          if (c instanceof AudioContext) void c.suspend();
        }
      }, 900);
    }
  }

  /** 切换房间：只换环境声和琴声的远近，曲子接着弹（at 为离线渲染时的时间点） */
  setRoom(id: RoomId, at?: number) {
    const c = this.ctx;
    this.mood = MOODS[id];
    if (!c) return;
    const t = at ?? c.currentTime;
    const ramp = (p: AudioParam, v: number) => {
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(v, t + 2.5);
    };
    for (const l of Object.keys(this.layer) as Layer[]) ramp(this.layer[l].gain, LAYER_GAIN[l] * this.mood.layers[l]);
    ramp(this.guqinLevel.gain, GUQIN_GAIN * this.mood.guqin);
  }

  /** 进入房间时的一声轻磬 */
  chime(at?: number) {
    const c = this.ctx;
    if (!c || !this.enabled) return;
    const t = (at ?? c.currentTime) + 0.05;
    this.harmonic(65, t, 0.7, this.bellIn);
    this.harmonic(72, t + 0.35, 0.5, this.bellIn);
  }

  dispose() {
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.media?.pause();
    if (this.ctx instanceof AudioContext) void this.ctx.close();
    this.ctx = null;
  }

  /** 把曲子、鸟鸣、水滴排到 until 为止（实时由定时器调用；离线渲染时一次排完） */
  scheduleUntil(until: number) {
    if (!this.ctx) return;
    if (!this.musicUrl && this.enabled) {
      const beat = 60 / BPM;
      while (this.nextTime < until) {
        if (this.qi >= this.queue.length) {
          if (this.queue.length) this.nextTime += rand(3, 5); // 一遍弹完，静一会儿再起
          this.queue = this.arrange();
          this.qi = 0;
          continue;
        }
        const ev = this.queue[this.qi++];
        let dur = ev.beats * beat * rand(0.95, 1.06);
        if (ev.phraseEnd) dur *= 1.12;
        this.play(ev, this.nextTime, dur);
        this.nextTime += dur + (ev.phraseEnd ? beat * 0.25 : 0);
      }
    }
    while (this.nextBird < until) {
      this.bird(this.nextBird);
      this.nextBird += rand(7, 16);
    }
    while (this.nextDrip < until) {
      this.drip(this.nextDrip);
      this.nextDrip += rand(3, 8);
    }
  }

  /** 编排一遍：第一遍完整，之后几种顺序轮换 */
  private arrange(): Ev[] {
    const order: Section[] =
      this.passes++ === 0
        ? ['intro', 'a', 'harm', 'b', 'a', 'coda']
        : pick<Section[]>([
            ['a', 'harm', 'b', 'a', 'coda'],
            ['harm', 'b', 'a', 'coda'],
            ['intro', 'b', 'harm', 'a', 'coda'],
          ]);
    return order.flatMap((k) => SECTIONS[k]);
  }

  private onVisibility = () => {
    const c = this.ctx;
    if (!(c instanceof AudioContext)) return;
    if (document.hidden) void c.suspend();
    else if (this.enabled) void c.resume();
  };

  // ---------- 音频图 ----------
  private build(c: BaseAudioContext) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp).connect(c.destination);

    // 混响：生成的厅堂脉冲响应，尾巴长而平缓
    this.verb = c.createConvolver();
    this.verb.buffer = this.impulse(c, 5.5);
    const verbOut = c.createGain();
    verbOut.gain.value = 0.5;
    this.verb.connect(verbOut).connect(this.master);

    // 古琴：去掉超低频 → 琴身共鸣（110Hz、230Hz 略提）→ 2.4kHz 以上柔掉 → 干声 + 混响
    const hp = this.filter(c, 'highpass', 45);
    const body1 = this.peak(c, 110, 0.9, 3);
    const body2 = this.peak(c, 230, 1, 2);
    const lp = this.filter(c, 'lowpass', 2400, 0.6);
    this.guqinLevel = c.createGain();
    this.guqinLevel.gain.value = GUQIN_GAIN * this.mood.guqin;
    hp.connect(body1).connect(body2).connect(lp).connect(this.guqinLevel).connect(this.master);
    const send = c.createGain();
    send.gain.value = 0.6;
    this.guqinLevel.connect(send).connect(this.verb);
    this.guqinIn = hp;

    // 轻磬（进房间时）
    this.bellIn = c.createGain();
    this.bellIn.gain.value = 0.7;
    this.bellIn.connect(this.master);
    const bellSend = c.createGain();
    bellSend.gain.value = 0.6;
    this.bellIn.connect(bellSend).connect(this.verb);

    this.buildAmbience(c);

    if (this.musicUrl && c instanceof AudioContext) {
      this.media = new Audio(this.musicUrl);
      this.media.loop = true;
      this.media.crossOrigin = 'anonymous';
      const g = c.createGain();
      g.gain.value = 0.9;
      c.createMediaElementSource(this.media).connect(g).connect(this.master);
    }

    const now = c.currentTime;
    this.nextTime = now + 0.8; // 一开声就起曲，不让人干等
    this.nextBird = now + rand(3, 6);
    this.nextDrip = now + rand(2, 4);
  }

  private filter(c: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.7) {
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  private peak(c: BaseAudioContext, freq: number, q: number, gainDb: number) {
    const f = this.filter(c, 'peaking', freq, q);
    f.gain.value = gainDb;
    return f;
  }

  private buildAmbience(c: BaseAudioContext) {
    const loop = (buf: AudioBuffer) => {
      const s = c.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start();
      return s;
    };
    const lfo = (freq: number, depth: number, param: AudioParam) => {
      const o = c.createOscillator();
      o.frequency.value = freq;
      const g = c.createGain();
      g.gain.value = depth;
      o.connect(g).connect(param);
      o.start();
    };
    for (const l of ['wind', 'water', 'fall', 'birds'] as Layer[]) {
      this.layer[l] = c.createGain();
      this.layer[l].gain.value = LAYER_GAIN[l] * this.mood.layers[l];
      this.layer[l].connect(this.master);
    }

    // 风：褐噪声过带通，中心频率和音量都缓慢起伏
    const windBp = this.filter(c, 'bandpass', 480, 0.7);
    lfo(0.06, 260, windBp.frequency);
    const windAmp = c.createGain();
    windAmp.gain.value = 0.6;
    lfo(0.09, 0.35, windAmp.gain);
    loop(this.noise(c, 'brown', 9)).connect(windBp).connect(windAmp).connect(this.layer.wind);

    // 水：粉噪声取中低频，按拍水的节奏起伏
    const waterAmp = c.createGain();
    waterAmp.gain.value = 0.5;
    lfo(0.32, 0.35, waterAmp.gain);
    loop(this.noise(c, 'pink', 7))
      .connect(this.filter(c, 'lowpass', 700))
      .connect(this.filter(c, 'highpass', 140))
      .connect(waterAmp)
      .connect(this.layer.water);

    // 瀑布：白噪声过宽带通，平稳
    loop(this.noise(c, 'white', 6)).connect(this.filter(c, 'bandpass', 1400, 0.35)).connect(this.filter(c, 'lowpass', 3600)).connect(this.layer.fall);

    // 鸟鸣带一点混响，听起来在远处
    const birdVerb = c.createGain();
    birdVerb.gain.value = 0.6;
    this.layer.birds.connect(birdVerb).connect(this.verb);
  }

  private noise(c: BaseAudioContext, kind: 'white' | 'pink' | 'brown', seconds: number) {
    const sr = c.sampleRate;
    const len = Math.floor(sr * seconds);
    const fade = Math.floor(sr * 0.5);
    const raw = new Float32Array(len + fade);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < raw.length; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') raw[i] = w * 0.5;
      else if (kind === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        raw[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
      } else {
        last = (last + 0.02 * w) / 1.02;
        raw[i] = last * 3.2;
      }
    }
    // 结尾与开头交叉淡化，循环时听不出接缝
    const buf = c.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = raw[i];
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] = raw[i] * k + raw[len + i] * (1 - k);
    }
    return buf;
  }

  private impulse(c: BaseAudioContext, seconds: number) {
    const sr = c.sampleRate;
    const len = Math.floor(sr * seconds);
    const pre = Math.floor(sr * 0.02);
    const buf = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let v = 0;
      for (let i = pre; i < len; i++) {
        v = v * 0.55 + (Math.random() * 2 - 1) * 0.45; // 略暗的混响尾
        d[i] = v * Math.pow(1 - i / len, 1.8);
      }
    }
    return buf;
  }

  // ---------- 古琴 ----------
  /**
   * Karplus–Strong 拨弦，每个音只算一次。弦内加一级低通（damp），高次泛音衰减得更快，
   * 声音温润；它带来的额外延迟一并算进周期，剩余的音高误差用 playbackRate 修正。
   */
  private pluckFor(midi: number) {
    let p = this.plucks.get(midi);
    if (p) return p;
    const c = this.ctx!;
    const sr = PLUCK_SR;
    const f = mtof(midi);
    const damp = 0.55;
    // 一个周期 = 延迟线 N − 0.5（取当前与下一个样本的平均）+ 弦内低通在该频率的相位延迟
    const w = (2 * Math.PI * f) / sr;
    const lpDelay = Math.atan2((1 - damp) * Math.sin(w), 1 - (1 - damp) * Math.cos(w)) / w;
    const extra = -0.5 + lpDelay;
    const N = Math.max(4, Math.round(sr / f - extra));
    const actual = sr / (N + extra);
    const t60 = Math.min(7, 4.2 * Math.pow(130 / f, 0.4) + 1); // 低音余韵更长
    const loss = Math.pow(0.001, 1 / (t60 * actual));
    const len = Math.floor(sr * Math.min(4.5, t60));
    const buf = c.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    // 激励：两次低通过的噪声，拨弦声柔和
    const line = new Float32Array(N);
    let a1 = 0, a2 = 0, mean = 0;
    for (let i = 0; i < N; i++) {
      a1 = a1 * 0.7 + (Math.random() * 2 - 1) * 0.3;
      a2 = a2 * 0.5 + a1 * 0.5;
      line[i] = a2;
      mean += a2;
    }
    mean /= N;
    for (let i = 0; i < N; i++) line[i] -= mean;
    let k = 0, lp = 0, peak = 0;
    for (let n = 0; n < len; n++) {
      const cur = line[k];
      out[n] = cur;
      if (Math.abs(cur) > peak) peak = Math.abs(cur);
      lp += damp * (0.5 * (cur + line[(k + 1) % N]) - lp);
      line[k] = loss * lp;
      k = (k + 1) % N;
    }
    const norm = peak > 0 ? 0.8 / peak : 1;
    const edge = Math.floor(sr * 0.012); // 起音放缓到 12 毫秒：像指肚拨弦，不带「啪」的尖声
    const tail = Math.floor(sr * 0.4);
    for (let i = 0; i < len; i++) {
      let g = norm;
      if (i < edge) g *= i / edge;
      if (i > len - tail) g *= (len - i) / tail;
      out[i] *= g;
    }
    p = { buffer: buf, fix: f / actual };
    this.plucks.set(midi, p);
    return p;
  }

  private play(ev: Ev, t: number, dur: number) {
    if (!ev.midis.length) return;
    for (const fn of this.noteListeners) fn({ when: t, midis: ev.midis, harm: ev.harm, to: ev.to, vib: ev.vib, dur });
    const vel = ev.phraseEnd ? rand(0.65, 0.75) : rand(0.72, 0.95);
    if (ev.harm) {
      for (const m of ev.midis) this.harmonic(m, t, vel, this.guqinIn);
      return;
    }
    // 撮：低音先出，旋律音晚 25 毫秒
    ev.midis.forEach((m, i) => {
      const melody = i === ev.midis.length - 1;
      const when = melody && ev.midis.length > 1 ? t + 0.025 : t;
      this.pluck(m, when, melody ? vel : vel * 0.85, melody ? ev.to : null, melody && ev.vib, dur);
    });
  }

  /** 一声拨弦；to 为弹后滑到的音（走手音），vib 为吟 */
  private pluck(midi: number, t: number, vel: number, to: number | null, vib: boolean, dur: number) {
    const c = this.ctx!;
    const p = this.pluckFor(midi);
    const s = c.createBufferSource();
    s.buffer = p.buffer;
    const r = s.playbackRate;
    r.setValueAtTime(p.fix, t);
    if (to !== null) {
      const t1 = t + Math.min(dur * 0.45, 0.8);
      r.setValueAtTime(p.fix, t1);
      r.exponentialRampToValueAtTime(p.fix * (mtof(to) / mtof(midi)), t1 + rand(0.3, 0.5));
    } else if (vib && dur > 1) {
      // 吟：缓慢的颤动，逐渐收小
      const len = Math.min(dur, 3);
      const rate = rand(3.4, 4.4);
      const curve = new Float32Array(96);
      for (let i = 0; i < 96; i++) {
        const tt = (i / 95) * len;
        curve[i] = p.fix * (1 + 0.008 * Math.sin(2 * Math.PI * rate * tt) * Math.exp(-tt * 0.6));
      }
      r.setValueCurveAtTime(curve, t + 0.3, len);
    }
    const g = c.createGain();
    g.gain.value = vel;
    const pan = c.createStereoPanner();
    pan.pan.value = midi < 52 ? 0 : rand(-0.15, 0.15);
    s.connect(g).connect(pan).connect(this.guqinIn);
    s.start(t);
  }

  /** 泛音：清亮如磬，带少量二、三次谐波，余音三秒 */
  private harmonic(midi: number, t: number, vel: number, dest: AudioNode) {
    const c = this.ctx!;
    const f = mtof(midi);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel * HARMONIC_GAIN, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    g.connect(dest);
    for (const [mul, amp] of [[1, 1], [2, 0.12], [3, 0.04]] as const) {
      const o = c.createOscillator();
      o.frequency.value = f * mul;
      const a = c.createGain();
      a.gain.value = amp;
      o.connect(a).connect(g);
      o.start(t);
      o.stop(t + 3.3);
    }
  }

  // ---------- 鸟鸣、水滴 ----------
  private bird(t: number) {
    const c = this.ctx!;
    const n = 2 + ((Math.random() * 4) | 0);
    const base = rand(2600, 3800);
    let st = t;
    for (let k = 0; k < n; k++) {
      const o = c.createOscillator();
      const g = c.createGain();
      const f0 = base * rand(0.95, 1.1);
      o.frequency.setValueAtTime(f0, st);
      o.frequency.exponentialRampToValueAtTime(f0 * rand(1.15, 1.45), st + 0.04);
      o.frequency.exponentialRampToValueAtTime(f0 * rand(0.8, 0.95), st + 0.09);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(rand(0.5, 1), st + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.1);
      o.connect(g).connect(this.layer.birds);
      o.start(st);
      o.stop(st + 0.12);
      st += rand(0.09, 0.16);
    }
  }

  private drip(t: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    const f = rand(900, 1600);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(rand(0.025, 0.05), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g).connect(this.layer.water);
    o.start(t);
    o.stop(t + 0.1);
  }
}
