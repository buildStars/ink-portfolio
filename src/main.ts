import { createApp } from 'vue';
import './style.css';
import App from './App.vue';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

if (webglAvailable()) {
  createApp(App).mount('#app');
  // 开发模式：?promo=landscape|portrait 自动录制宣传片（见 src/promo/record.ts；正式打包时整段删掉）
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('promo')) void import('./promo/record').then((m) => m.autoRecord());
} else {
  // 不支持 WebGL：不启动 3D，直接显示 index.html 里的文字版
  document.documentElement.classList.add('nogl');
}
