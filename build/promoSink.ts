import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * 开发服务器专用：接收浏览器里录好的宣传片和分镜预览图（POST /__promo/save?name=xxx.mp4 / .jpg），存进项目的 promo/ 目录。
 * 只在 npm run dev 时存在，打包不受影响。
 */
export function promoSink(): Plugin {
  let root = process.cwd();
  return {
    name: 'ink-promo-sink',
    apply: 'serve',
    configResolved(c) {
      root = c.root;
    },
    configureServer(server) {
      server.middlewares.use('/__promo/save', (req, res) => {
        const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? '';
        if (req.method !== 'POST' || !/^[\w.-]+\.(mp4|jpg)$/.test(name)) {
          res.statusCode = 400;
          res.end('bad request');
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const dir = resolve(root, 'promo');
          mkdirSync(dir, { recursive: true });
          const file = resolve(dir, name);
          const body = Buffer.concat(chunks);
          writeFileSync(file, body);
          server.config.logger.info(`宣传片已保存：promo/${name}（${(body.length / 1048576).toFixed(1)}MB）`);
          res.end('saved');
        });
      });
    },
  };
}
