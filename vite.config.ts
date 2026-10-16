import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { pageTitle, seoBody, seoHead } from './src/seo';
import { brushFont } from './build/brushFont';
import { shareCard } from './build/shareCard';
import { promoSink } from './build/promoSink';
import { site } from './src/content';

/** 把 content.ts 生成的文字版、分享卡片信息注入 index.html */
function seoFallback(): Plugin {
  return {
    name: 'ink-seo-fallback',
    transformIndexHtml(html) {
      return html
        .replace(/<title>.*?<\/title>/, `<title>${pageTitle}</title>`)
        .replace(/\s*<meta name="description"[^>]*>/, '')
        .replace('</head>', `${seoHead()}\n  </head>`)
        .replace('<div id="app"></div>', `${seoBody()}\n    <div id="app"></div>`);
    },
  };
}

export default defineConfig({
  plugins: [vue(), seoFallback(), brushFont(), shareCard(site), promoSink()],
  server: {
    port: 5190,
    // 这台 Windows 机器上默认的文件监听偶尔漏掉保存，改成轮询更可靠
    watch: { usePolling: true, interval: 300 },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Three.js 单独成包，改内容重新发布时访客不用重新下载它
        manualChunks: { three: ['three'] },
      },
    },
  },
});
