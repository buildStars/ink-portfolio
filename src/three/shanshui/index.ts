/**
 * shan-shui-inf（MIT，Lingdong Huang）的封装：生成山、树等的矢量线条，画到 Canvas 上当贴图。
 * 原库是浏览器脚本风格（非严格模式、依赖隐式全局），所以以字符串载入、在 Function 里执行，
 * 与项目其余代码隔离。
 */
import libSource from './shanshui-lib.js?raw';

type Gen = (...args: unknown[]) => string;
interface ShanShuiLib {
  Prng: { seed(x?: unknown): void };
  Mount: { mountain: Gen; distMount: Gen; flatMount: Gen; rock: Gen };
  Tree: Record<'tree01' | 'tree02' | 'tree03' | 'tree04' | 'tree05' | 'tree06' | 'tree07' | 'tree08', Gen>;
  Arch: Record<'arch01' | 'arch02' | 'arch03' | 'arch04' | 'boat01', Gen>;
  water: Gen;
}

let lib: ShanShuiLib | null = null;
function ss(): ShanShuiLib {
  // eslint-disable-next-line no-new-func
  if (!lib) {
    lib = new Function(`${libSource}\nreturn { Prng: Prng, Mount: Mount, Tree: Tree, Arch: Arch, water: water };`)() as ShanShuiLib;
    // 原作山间会随机立一座输电塔（彩蛋），国风画面里不要
    (lib.Arch as unknown as Record<string, Gen>).transmissionTower01 = () => '';
  }
  return lib;
}

// ---------- 矢量 → Canvas ----------
const POLY = /<polyline points='([^']*)' style='fill:([^;]*);stroke:([^;]*);stroke-width:([^']*)'\/>/g;

interface Shape {
  pts: number[];
  fill: string;
  stroke: string;
  width: number;
}

function parse(svg: string) {
  const shapes: Shape[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const m of svg.matchAll(POLY)) {
    const pts: number[] = [];
    for (const p of m[1].trim().split(/\s+/)) {
      const [x, y] = p.split(',').map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      pts.push(x, y);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (pts.length >= 4) shapes.push({ pts, fill: m[2].trim(), stroke: m[3].trim(), width: parseFloat(m[4]) || 0 });
  }
  return { shapes, minX, minY, maxX, maxY };
}

const invisible = (c: string) => !c || c === 'none' || /rgba\([^)]*,\s*0(\.0+)?\)$/.test(c);

/** 把 rgba 颜色的透明度乘上 k（加深墨色） */
function inked(c: string, k: number) {
  if (k === 1) return c;
  return c.replace(/rgba\(([^,]+),([^,]+),([^,]+),\s*([\d.]+)\)/, (_, r, gg, b, a) => `rgba(${r},${gg},${b},${Math.min(1, parseFloat(a) * k).toFixed(3)})`);
}

export interface DrawOptions {
  /** 把原作里的白色填充换成这个颜色（画在宣纸画心里时用纸色） */
  paper?: string;
  /** 原作坐标里的这条水平线对齐到矩形底边，线以下裁掉（山脚下的白色裙边就不会露出来） */
  base?: number;
  /** 墨色浓度倍数：>1 加深 */
  ink?: number;
  /** 底部渐隐成山雾的比例（0~1） */
  fade?: number;
}

/**
 * 把一段 shan-shui 矢量画进矩形 (x0, y0, w, h)：等比缩放、底边对齐、水平居中。
 */
export function drawShanShui(g: CanvasRenderingContext2D, svg: string, x0: number, y0: number, w: number, h: number, opts: DrawOptions = {}) {
  const { paper, base, ink = 1, fade = 0 } = opts;
  const { shapes, minX, minY, maxX, maxY } = parse(svg);
  if (!shapes.length) return;
  const bottom = base ?? maxY;
  const s = Math.min(w / (maxX - minX), h / (bottom - minY));
  const ox = x0 + (w - (maxX - minX) * s) / 2 - minX * s;
  const oy = y0 + h - bottom * s;
  g.save();
  g.beginPath();
  g.rect(x0, y0, w, h);
  g.clip();
  g.lineJoin = 'round';
  for (const sh of shapes) {
    const p = new Path2D();
    for (let i = 0; i < sh.pts.length; i += 2) {
      const X = sh.pts[i] * s + ox;
      const Y = sh.pts[i + 1] * s + oy;
      if (i) p.lineTo(X, Y);
      else p.moveTo(X, Y);
    }
    if (!invisible(sh.fill)) {
      g.fillStyle = paper && sh.fill === 'white' ? paper : inked(sh.fill, ink);
      g.fill(p);
    }
    if (sh.width > 0 && !invisible(sh.stroke)) {
      g.strokeStyle = paper && sh.stroke === 'white' ? paper : inked(sh.stroke, ink);
      g.lineWidth = Math.max(0.6, sh.width * s);
      g.stroke(p);
    }
  }
  if (fade > 0) {
    // 底部抹成透明，像山脚隐入雾中
    const fy = y0 + h * (1 - fade);
    const gr = g.createLinearGradient(0, fy, 0, y0 + h);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = gr;
    g.fillRect(x0, fy, w, y0 + h - fy);
  }
  g.restore();
}

// ---------- 生成器 ----------
/** 一组相连的山（带植被与皴法），横向铺开，适合做中景山 */
export function mountainRange(seed: number, peaks = 3, veg = true) {
  const L = ss();
  L.Prng.seed(seed);
  let svg = '';
  for (let i = 0; i < peaks; i++) {
    svg += L.Mount.mountain(i * 330 + (i % 2) * 60, 0, seed * 7 + i, {
      hei: 220 + ((seed * 13 + i * 37) % 7) * 40,
      wid: 380 + ((seed + i * 11) % 5) * 40,
      veg,
      tex: 160,
    });
  }
  return svg;
}

/** 远山：淡墨连绵的低矮山脉 */
export function distantRange(seed: number) {
  const L = ss();
  L.Prng.seed(seed);
  return L.Mount.distMount(0, 0, seed, { hei: 220, len: 1600, seg: 5 });
}

/** 一座独山（挂轴、屏风里的小幅山水用），配一点水纹 */
export function soloMountain(seed: number) {
  const L = ss();
  L.Prng.seed(seed);
  return L.Mount.mountain(0, 0, seed, { hei: 340, wid: 300, veg: true, tex: 140 }) + L.water(0, 30, seed, { len: 360, clu: 5 });
}

/** 树：kind 对应原作的 tree01~tree08 */
export function tree(kind: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, seed: number, hei = 200, wid = 6) {
  const L = ss();
  L.Prng.seed(seed);
  const fn = L.Tree[`tree0${kind}` as keyof ShanShuiLib['Tree']];
  return fn(0, 0, { hei, wid, col: 'rgba(80,80,80,0.6)' });
}

