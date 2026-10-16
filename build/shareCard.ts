import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import subsetFont from 'subset-font';
import type { HtmlTagDescriptor, Plugin, ResolvedConfig } from 'vite';

/**
 * 网站图标与分享卡片：打包时按 content.ts 现画，改了名字、印章会自动跟着变。
 * - 图标：朱红印章里一个毛笔字（名字的第一个字），和左上角的印章一致；
 * - 分享卡片 og.png（1200×630）：左边名字、印章、身份与一句介绍，右边一幅 shan-shui 水墨山水。
 * 想用自己做的图：放到 public/ 下同名文件（如 public/og.png），就不再生成那一个。
 */

export interface ShareInfo {
  name: string;
  role: string;
  title: string;
  description: string;
  seal: string;
  url: string; // 网站上线后的网址；分享卡片的图片地址要用完整网址
}

const FONT_SRC = 'node_modules/@fontsource/ma-shan-zheng/files/ma-shan-zheng-chinese-simplified-400-normal.woff2';
const SHANSHUI = 'src/three/shanshui/shanshui-lib.js';
const PAPER = '#ece6d8';
const PAPER_LIGHT = '#f4efe2';
const INK = '#161616';
const INK_SOFT = '#3a3633';
const CINNABAR = '#b8281d';
export const OG_SIZE = [1200, 630] as const;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ---------- 字体：只截取卡片上用到的字，写成 TTF 给 resvg 用 ----------
async function brushFontFile(root: string, text: string) {
  const ttf = await subsetFont(readFileSync(resolve(root, FONT_SRC)), [...new Set(text)].join(''), { targetFormat: 'sfnt' });
  const dir = resolve(root, 'node_modules/.cache/ink-share');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'brush.ttf');
  writeFileSync(file, ttf);
  return file;
}

function rasterize(svg: string, width: number, fontFile: string) {
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontFiles: [fontFile], loadSystemFonts: false, defaultFontFamily: 'Ma Shan Zheng' },
  })
    .render()
    .asPng();
}

/** 把 SVG 里的文字转成路径：浏览器显示 favicon.svg 时用不到网页字体 */
function outlineText(svg: string, fontFile: string) {
  return new Resvg(svg, { font: { fontFiles: [fontFile], loadSystemFonts: false, defaultFontFamily: 'Ma Shan Zheng' } }).toString();
}

// ---------- 图标 ----------
/** 微微歪斜的朱红印章（与界面左上角的印章同形）；full = true 时铺满（苹果图标不能透明） */
function iconSvg(char: string, size: number, full = false) {
  const s = size / 100;
  const shape = full
    ? `<rect width="${size}" height="${size}" fill="${CINNABAR}"/>`
    : `<polygon points="${2 * s},${3 * s} ${98 * s},0 ${size},${97 * s} 0,${size}" fill="${CINNABAR}"/>`;
  const fs = (full ? 62 : 74) * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${shape}
  <text x="${size / 2}" y="${size / 2 + fs * 0.36}" font-family="Ma Shan Zheng" font-size="${fs}" fill="${PAPER_LIGHT}" text-anchor="middle">${esc(char)}</text>
</svg>`;
}

/** 把几张 PNG 打包成 .ico（ICO 文件可以直接内嵌 PNG） */
function pngsToIco(pngs: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6 + pngs.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4); // 色彩平面
    header.writeUInt16LE(32, e + 6); // 位深
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

// ---------- 分享卡片 ----------
type Gen = (x: number, y: number, seed: number, args?: Record<string, unknown>) => string;
interface ShanShui {
  Prng: { seed(x?: unknown): void };
  Mount: { mountain: Gen; distMount: Gen };
  Arch: Record<string, Gen>;
}

/** 用 shan-shui 生成一段山水，缩放进矩形 (x0, y0, w, h)：底边对齐、靠右，白色填充换成纸色，墨色按 ink 倍数加深 */
function landscape(svg: string, x0: number, y0: number, w: number, h: number, ink = 1) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const m of svg.matchAll(/points='([^']*)'/g)) {
    for (const p of m[1].trim().split(/\s+/)) {
      const [x, y] = p.split(',').map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const s = Math.min(w / (maxX - minX), h / (maxY - minY));
  const tx = x0 + w - (maxX - minX) * s - minX * s;
  const ty = y0 + h - maxY * s;
  const body = svg
    .replace(/fill:white/g, `fill:${PAPER}`)
    .replace(/stroke:white/g, `stroke:${PAPER}`)
    .replace(/rgba\(([^,]+),([^,]+),([^,]+),\s*([\d.]+)\)/g, (_, r, g, b, a) => `rgba(${r},${g},${b},${Math.min(1, parseFloat(a) * ink).toFixed(3)})`);
  return `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${s.toFixed(4)})" stroke-linejoin="round">${body}</g>`;
}

/** 中文按字数折行（最多 lines 行，超出加省略号） */
function wrap(text: string, perLine: number, lines: number) {
  const chars = [...text];
  const out: string[] = [];
  for (let i = 0; i < chars.length && out.length < lines; i += perLine) out.push(chars.slice(i, i + perLine).join(''));
  if (chars.length > perLine * lines) out[lines - 1] = out[lines - 1].slice(0, -1) + '…';
  return out;
}

/** 朱文印章：四个字按「右上、右下、左上、左下」排；其他字数竖排一列 */
function sealSvg(text: string, x: number, y: number, size: number) {
  const chars = [...text];
  const fs = chars.length === 4 ? size * 0.4 : size / Math.max(chars.length, 1) * 0.8;
  const pos: [number, number][] =
    chars.length === 4
      ? [[0.72, 0.43], [0.72, 0.87], [0.28, 0.43], [0.28, 0.87]]
      : chars.map((_, i) => [0.5, ((i + 0.5) / chars.length) * 0.9 + 0.05 + 0.3 / chars.length]);
  const glyphs = chars
    .map((c, i) => `<text x="${(x + pos[i][0] * size).toFixed(1)}" y="${(y + pos[i][1] * size).toFixed(1)}" font-size="${fs.toFixed(1)}" text-anchor="middle" fill="${PAPER_LIGHT}">${esc(c)}</text>`)
    .join('');
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.06}" fill="${CINNABAR}"/>${glyphs}`;
}

/** 文字在毛笔字体里的实际宽度：英文字母比汉字窄得多，不能按字数估 */
function textWidth(text: string, size: number, fontFile: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size * (text.length + 1)}" height="${size * 2}"><text x="0" y="${size * 1.5}" font-family="Ma Shan Zheng" font-size="${size}">${esc(text)}</text></svg>`;
  const box = new Resvg(svg, { font: { fontFiles: [fontFile], loadSystemFonts: false, defaultFontFamily: 'Ma Shan Zheng' } }).getBBox();
  return box ? box.x + box.width : [...text].length * size;
}

function ogSvg(info: ShareInfo, lib: ShanShui, fontFile: string) {
  const [W, H] = OG_SIZE;
  lib.Prng.seed(7);
  const far = lib.Mount.distMount(0, 0, 3, { hei: 180, len: 1400, seg: 5 });
  lib.Prng.seed(21);
  const near = lib.Mount.mountain(0, 0, 21, { hei: 480, wid: 520, veg: true, tex: 200 }) + lib.Mount.mountain(340, 70, 34, { hei: 280, wid: 400, veg: true, tex: 160 });

  // 名字最宽 470、字号最大 150；印章紧跟在名字后面
  const name = [...info.name];
  const w100 = Math.max(textWidth(info.name, 100, fontFile) + name.length * 4, 1); // 字号 100 时的宽度（含字距）
  const nameSize = Math.min(150, (470 / w100) * 100);
  const nameW = (w100 * nameSize) / 100;
  const host = info.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const desc = wrap(info.description, 14, 2);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Ma Shan Zheng">
  <defs>
    <radialGradient id="vig" cx="40%" cy="45%" r="80%">
      <stop offset="60%" stop-color="#5a4628" stop-opacity="0"/>
      <stop offset="100%" stop-color="#5a4628" stop-opacity="0.16"/>
    </radialGradient>
    <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.72" stop-color="#fff" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="fade"><rect width="${W}" height="${H}" fill="url(#mist)"/></mask>
  </defs>
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <circle cx="1048" cy="132" r="44" fill="${CINNABAR}" opacity="0.92"/>
  <g mask="url(#fade)">
    <g opacity="0.6">${landscape(far, 440, 230, 760, 260, 1.4)}</g>
    ${landscape(near, 630, 110, 620, 540, 1.9)}
  </g>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>

  <text x="92" y="300" font-size="${nameSize}" fill="${INK}" letter-spacing="${nameSize * 0.04}">${esc(info.name)}</text>
  ${info.seal ? sealSvg(info.seal, 92 + nameW + 34, 300 - nameSize * 0.82, 92) : ''}
  <text x="96" y="378" font-size="46" fill="${INK_SOFT}" letter-spacing="4">${esc(info.role)}</text>
  <path d="M96 412 Q 230 400 360 410 T 600 405" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
  ${desc.map((l, i) => `<text x="96" y="${474 + i * 48}" font-size="36" fill="${INK_SOFT}" letter-spacing="3">${esc(l)}</text>`).join('')}
  <text x="96" y="584" font-size="26" fill="#7a7166" letter-spacing="3">${esc(host ? `${info.title}　${host}` : info.title)}</text>
</svg>`;
}

function loadShanShui(root: string): ShanShui {
  const src = readFileSync(resolve(root, SHANSHUI), 'utf8');
  // 原库是浏览器脚本风格（非严格模式、依赖隐式全局），放在 Function 里执行，与其余代码隔离
  // eslint-disable-next-line no-new-func
  const lib = new Function(`${src}\nreturn { Prng: Prng, Mount: Mount, Arch: Arch };`)() as ShanShui;
  lib.Arch.transmissionTower01 = () => ''; // 原作山间会随机立一座输电塔（彩蛋），国风画面里不要
  return lib;
}

/** 生成全部文件：{ 文件名: 内容 } */
export async function renderShareAssets(root: string, info: ShareInfo) {
  const iconChar = [...info.name][0] ?? '墨';
  const host = info.url.replace(/^https?:\/\//, '');
  const font = await brushFontFile(root, info.name + info.role + info.title + info.description + info.seal + host + '…');
  const files = new Map<string, Buffer | string>();
  files.set('favicon.svg', outlineText(iconSvg(iconChar, 64), font));
  files.set('favicon.ico', pngsToIco([16, 32, 48].map((size) => ({ size, data: rasterize(iconSvg(iconChar, 64), size, font) }))));
  files.set('apple-touch-icon.png', rasterize(iconSvg(iconChar, 180, true), 180, font));
  files.set('og.png', rasterize(ogSvg(info, loadShanShui(root), font), OG_SIZE[0], font));
  return files;
}

const TYPES: Record<string, string> = { '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png' };

export function shareCard(info: ShareInfo): Plugin {
  let root = process.cwd();
  let base = '/';
  let config: ResolvedConfig;
  let pending: Promise<Map<string, Buffer | string>> | null = null;
  const assets = () => (pending ??= renderShareAssets(root, info));
  /** public/ 里放了同名文件就用访客自己的，不再生成 */
  const own = (name: string) => existsSync(resolve(root, 'public', name));

  return {
    name: 'ink-share-card',
    configResolved(c) {
      config = c;
      root = c.root;
      base = c.base;
    },
    configureServer(server) {
      // 开发时按需生成，地址与打包后相同（/favicon.svg、/og.png …）
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (!path.startsWith(base)) return next();
        const name = path.slice(base.length);
        if (!/^(favicon\.(svg|ico)|apple-touch-icon\.png|og\.png)$/.test(name) || own(name)) return next();
        const file = (await assets()).get(name);
        if (!file) return next();
        res.setHeader('Content-Type', TYPES[name.slice(name.lastIndexOf('.'))]);
        res.setHeader('Cache-Control', 'no-cache');
        res.end(file);
      });
    },
    async generateBundle() {
      const t = performance.now();
      for (const [fileName, source] of await assets()) {
        if (!own(fileName)) this.emitFile({ type: 'asset', fileName, source });
      }
      config.logger.info(`网站图标与分享卡片已生成，用时 ${Math.round(performance.now() - t)}ms`);
      if (!info.url) {
        config.logger.warn('提示：content.ts 里的 site.url 还没填。分享卡片的图片地址需要完整网址，部分平台（如 X、Facebook）会不显示图片。上线后填上网址再打包。');
      }
    },
    transformIndexHtml() {
      const abs = (p: string) => (info.url ? info.url.replace(/\/$/, '') + base + p : base + p);
      const tags: HtmlTagDescriptor[] = [
        { tag: 'link', attrs: { rel: 'icon', href: `${base}favicon.ico`, sizes: '32x32' } },
        { tag: 'link', attrs: { rel: 'icon', href: `${base}favicon.svg`, type: 'image/svg+xml' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: `${base}apple-touch-icon.png` } },
        { tag: 'meta', attrs: { property: 'og:image', content: abs('og.png') } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: String(OG_SIZE[0]) } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: String(OG_SIZE[1]) } },
        { tag: 'meta', attrs: { property: 'og:image:alt', content: `${info.name} · ${info.title}` } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        // QQ、QQ 空间读这一组
        { tag: 'meta', attrs: { itemprop: 'name', content: `${info.name} · ${info.role}｜${info.title}` } },
        { tag: 'meta', attrs: { itemprop: 'description', content: info.description } },
        { tag: 'meta', attrs: { itemprop: 'image', content: abs('og.png') } },
      ];
      if (info.url) {
        const home = info.url.replace(/\/$/, '') + base;
        tags.push({ tag: 'meta', attrs: { property: 'og:url', content: home } }, { tag: 'link', attrs: { rel: 'canonical', href: home } });
      }
      return tags.map((t) => ({ ...t, injectTo: 'head' as const }));
    },
  };
}
