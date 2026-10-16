/**
 * 一键发布：npm run deploy
 * 打包 → 压缩 dist → 用 SSH 传到服务器 → 替换 /opt/ink-portfolio/www 里的网页文件。
 * Caddy 直接读这个目录，换完文件即生效，不需要重启任何服务。
 * 服务器上的一次性配置见 README「部署」一节。
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOST = process.env.DEPLOY_HOST ?? 'ubuntu@43.133.254.183';
const KEY = process.env.DEPLOY_KEY ?? join(homedir(), '.ssh', 'handbook_seoul');
const SITE = 'https://me.mianbook.ink';
const ARCHIVE = 'node_modules/.cache/ink-deploy.tgz';
const SSH_OPTS = ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15'];

function run(cmd, args, label) {
  console.log(`\n· ${label}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false });
  if (r.status !== 0) {
    console.error(`\n✗ ${label}失败（${cmd} 退出码 ${r.status ?? r.error?.message}）`);
    process.exit(1);
  }
}

const build = spawnSync('npm run build', { stdio: 'inherit', shell: true });
if (build.status !== 0) process.exit(1);

mkdirSync('node_modules/.cache', { recursive: true });
run('tar', ['-czf', ARCHIVE, '-C', 'dist', '.'], '压缩打包结果');
run('scp', [...SSH_OPTS, ARCHIVE, `${HOST}:/tmp/ink-portfolio.tgz`], '上传到服务器');
run(
  'ssh',
  [
    ...SSH_OPTS,
    HOST,
    [
      'set -e',
      'rm -rf /tmp/ink-portfolio.new && mkdir -p /tmp/ink-portfolio.new /opt/ink-portfolio/www',
      'tar -xzf /tmp/ink-portfolio.tgz -C /tmp/ink-portfolio.new',
      // --delete：顺带清掉旧版本留下的打包文件
      'rsync -a --delete /tmp/ink-portfolio.new/ /opt/ink-portfolio/www/',
      'rm -rf /tmp/ink-portfolio.new /tmp/ink-portfolio.tgz',
    ].join(' && '),
  ],
  '替换网页文件',
);
rmSync(ARCHIVE, { force: true });

// 确认线上已经是新版本
try {
  const res = await fetch(`${SITE}/?t=${Date.now()}`, { cache: 'no-store' });
  console.log(`\n✓ 已发布：${SITE}（HTTP ${res.status}）`);
} catch (err) {
  console.log(`\n✓ 文件已上传。暂时访问不到 ${SITE}：${err.message}`);
}
