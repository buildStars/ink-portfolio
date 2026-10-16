import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import ts from 'typescript';
import { parse as parseSfc } from 'vue/compiler-sfc';
import subsetFont from 'subset-font';
import type { Logger, Plugin, ResolvedConfig } from 'vite';

/**
 * 毛笔字字库瘦身：整套马善政楷书有六千来字、2.7MB，页面实际只用到几百个。
 * 构建（和开发服务器启动）时扫一遍源码里写死的文字，只保留这些字，生成 src/fonts/brush.woff2，
 * style.css 里的 @font-face 指向它。开发时改了文案、出现新字会自动重新生成并刷新页面。
 *
 * 只收集代码里「字符串」和模板里的文字，注释里的字不算，免得白白多装几百字。
 * src/promo/（录宣传片的开发工具）里的字只在开发时收录，正式打包不带。
 */

const SOURCE = 'node_modules/@fontsource/ma-shan-zheng/files/ma-shan-zheng-chinese-simplified-400-normal.woff2';
const OUT_DIR = 'src/fonts';
const OUT_FONT = 'brush.woff2';
const OUT_CHARS = 'brush.chars.txt'; // 收录了哪些字，方便查看；内容没变就不重新生成
const SCAN_EXT = new Set(['.ts', '.vue', '.css']);

// 常用标点和英文数字总是带上：以后填内容时不用担心缺字
const ALWAYS =
  Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)).join('') +
  '，。、；：？！“”‘’（）《》〈〉「」『』【】…—～·';

// content.ts 里这些字段只出现在信息卡正文、悬停提示、宋体小字里（项目介绍、经历详情、自我介绍、联系方式的值…），
// 不用毛笔字，不收进字库：简历式的长段落有上百个生僻些的字，收进来字库要大三分之一。site 里的字段照常收录
const SERIF_FIELDS = new Set(['summary', 'description', 'detail', 'bio', 'note', 'place', 'value', 'handle', 'tags', 'period', 'year']);

/** TS 源码里所有字符串、模板字符串的文字；skip 里的属性（site 对象之外）整段跳过 */
function tsLiterals(code: string, out: Set<string>, skip?: Set<string>) {
  const file = ts.createSourceFile('x.ts', code, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const visit = (node: ts.Node, top: string) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) top = node.name.text;
    if (skip && top !== 'site' && ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && skip.has(node.name.text)) return;
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      for (const ch of node.text) out.add(ch);
    }
    node.forEachChild((child) => visit(child, top));
  };
  visit(file, '');
}

/** CSS 里引号中的文字（content: '·' 之类） */
function cssStrings(code: string, out: Set<string>) {
  const clean = code.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g)) for (const ch of m[2]) out.add(ch);
}

function charsOfFile(file: string): Set<string> {
  const out = new Set<string>();
  const code = readFileSync(file, 'utf8');
  const ext = extname(file);
  if (ext === '.ts') tsLiterals(code, out, file.endsWith(`${sep}src${sep}content.ts`) ? SERIF_FIELDS : undefined);
  else if (ext === '.css') cssStrings(code, out);
  else if (ext === '.vue') {
    const { descriptor } = parseSfc(code, { filename: file });
    const tpl = descriptor.template?.content.replace(/<!--[\s\S]*?-->/g, '') ?? '';
    for (const ch of tpl) out.add(ch);
    for (const s of [descriptor.script, descriptor.scriptSetup]) if (s) tsLiterals(s.content, out);
    for (const s of descriptor.styles) cssStrings(s.content, out);
  }
  return out;
}

function walk(dir: string, files: string[] = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (SCAN_EXT.has(extname(ent.name))) files.push(p);
  }
  return files;
}

/** 把收集到的字排好序拼成一串（去掉换行等控制字符） */
function charString(sets: Iterable<Set<string>>) {
  const all = new Set<string>(ALWAYS);
  for (const s of sets) for (const ch of s) if (ch.codePointAt(0)! >= 0x20) all.add(ch);
  return [...all].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!).join('');
}

export function brushFont(): Plugin {
  let root = process.cwd();
  let srcDir = '';
  let base = '/';
  let logger: Logger | undefined;
  let building = false;
  let promoDir = '';
  const perFile = new Map<string, Set<string>>();
  let current = ''; // 当前字库里的字
  let source: Buffer | null = null;
  let running: Promise<boolean> = Promise.resolve(false);

  const outDir = () => resolve(root, OUT_DIR);

  /** 生成字库；内容没变就跳过。返回是否真的重新生成了 */
  async function generate(): Promise<boolean> {
    const chars = charString(perFile.values());
    const fontPath = join(outDir(), OUT_FONT);
    const charsPath = join(outDir(), OUT_CHARS);
    if (!current && existsSync(fontPath) && existsSync(charsPath)) current = readFileSync(charsPath, 'utf8');
    if (chars === current && existsSync(fontPath)) return false;
    source ??= readFileSync(resolve(root, SOURCE));
    const font = await subsetFont(source, chars, { targetFormat: 'woff2' });
    mkdirSync(dirname(fontPath), { recursive: true });
    writeFileSync(fontPath, font);
    writeFileSync(charsPath, chars);
    current = chars;
    return true;
  }

  const queue = () => (running = running.then(generate, generate));

  return {
    name: 'ink-brush-font',
    configResolved(config: ResolvedConfig) {
      root = config.root;
      srcDir = resolve(root, 'src');
      base = config.base;
      logger = config.logger;
      building = config.command === 'build';
      promoDir = resolve(srcDir, 'promo') + sep;
    },
    async buildStart() {
      perFile.clear();
      for (const f of walk(srcDir)) if (!(building && f.startsWith(promoDir))) perFile.set(f, charsOfFile(f));
      const t = performance.now();
      if (await queue()) {
        logger?.info(`毛笔字库已生成：${current.length} 字，用时 ${Math.round(performance.now() - t)}ms`);
      }
    },
    configureServer(server) {
      // 开发时：改了文案、出现字库里没有的字，就补生成字库并刷新页面
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onChange = (file: string) => {
        file = resolve(file);
        // 正式打包会按「不含 src/promo」重写字库：开发服务器发现后把录制工具用到的字补回来
        if (file === join(outDir(), OUT_CHARS) && readFileSync(file, 'utf8') !== current) {
          current = readFileSync(file, 'utf8');
          clearTimeout(timer);
          timer = setTimeout(async () => {
            if (await queue()) server.ws.send({ type: 'full-reload' });
          }, 300);
          return;
        }
        if (!file.startsWith(srcDir) || !SCAN_EXT.has(extname(file)) || !existsSync(file)) return;
        perFile.set(file, charsOfFile(file));
        clearTimeout(timer);
        timer = setTimeout(async () => {
          if (await queue()) server.ws.send({ type: 'full-reload' });
        }, 300);
      };
      server.watcher.on('change', onChange);
      server.watcher.on('add', onChange);
    },
    transformIndexHtml: {
      order: 'post',
      // 打包后让浏览器一开始就下载字库，不用等 CSS、脚本跑起来才发现要用它
      handler(_html, ctx) {
        const asset = Object.values(ctx.bundle ?? {}).find((f) => f.type === 'asset' && /brush-[\w-]+\.woff2$/.test(f.fileName));
        if (!asset) return;
        return [
          {
            tag: 'link',
            attrs: { rel: 'preload', href: base + asset.fileName, as: 'font', type: 'font/woff2', crossorigin: '' },
            injectTo: 'head-prepend',
          },
        ];
      },
    },
  };
}
