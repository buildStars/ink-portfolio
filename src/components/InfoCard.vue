<script setup lang="ts">
import { ref } from 'vue';
import { store, type CardAction, type RoomId } from '../store';

const emit = defineEmits<{ navigate: [room: RoomId]; music: [] }>();

/** 撕纸毛边：沿四条边生成带随机内缩的多边形 */
function tornEdge(seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts: string[] = [];
  const amp = () => (rnd() * 7).toFixed(1);
  for (let x = 0; x <= 100; x += 4) pts.push(`${x}% ${amp()}px`);
  for (let y = 4; y <= 100; y += 3) pts.push(`calc(100% - ${amp()}px) ${y}%`);
  for (let x = 96; x >= 0; x -= 4) pts.push(`${x}% calc(100% - ${amp()}px)`);
  for (let y = 97; y > 0; y -= 3) pts.push(`${amp()}px ${y}%`);
  return `polygon(${pts.join(',')})`;
}

const clip = tornEdge();
const copied = ref(false);

async function act(a: CardAction) {
  if (a.room) {
    store.card = null;
    emit('navigate', a.room);
    return;
  }
  if (a.music) {
    store.card = null;
    emit('music');
    return;
  }
  if (!a.copy) return;
  try {
    await navigator.clipboard.writeText(a.copy);
  } catch {
    window.prompt('复制以下内容：', a.copy);
  }
  copied.value = true;
  setTimeout(() => (copied.value = false), 1600);
}

const close = () => (store.card = null);
const isExternal = (href: string) => /^https?:/.test(href);
</script>

<template>
  <Transition name="card">
    <aside v-if="store.card" :key="store.card.title" class="wrap" role="dialog" :aria-label="store.card.title">
      <div class="card" :style="{ clipPath: clip }">
        <button class="close" aria-label="关闭" @click="close">×</button>
        <p class="kicker">{{ store.card.kicker }}</p>
        <h2 class="title">{{ store.card.title }}</h2>
        <svg class="stroke" viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden="true">
          <path d="M2 7 Q 80 1 160 6 T 298 5" />
        </svg>
        <p v-if="store.card.meta" class="meta">{{ store.card.meta }}</p>
        <p v-for="(p, i) in store.card.body" :key="i" class="body">{{ p }}</p>
        <ul v-if="store.card.tags?.length" class="tags">
          <li v-for="t in store.card.tags" :key="t">{{ t }}</li>
        </ul>
        <div v-if="store.card.actions?.length" class="actions">
          <template v-for="a in store.card.actions" :key="a.label">
            <a
              v-if="a.href"
              class="seal-btn"
              :href="a.href"
              :target="isExternal(a.href) ? '_blank' : undefined"
              rel="noopener"
            >{{ a.label }}{{ isExternal(a.href) ? ' ↗' : '' }}</a>
            <button v-else class="seal-btn" @click="act(a)">{{ copied ? '已复制' : a.label }}</button>
          </template>
        </div>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.wrap {
  position: fixed;
  top: 50%;
  right: clamp(16px, 4vw, 56px);
  z-index: 25;
  width: min(400px, 42vw);
  transform: translateY(-50%);
  filter: drop-shadow(6px 10px 0 rgba(22, 22, 22, 0.1));
}

.card {
  position: relative;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
  padding: 36px 34px 34px;
  background:
    repeating-linear-gradient(8deg, rgba(120, 110, 95, 0.035) 0 2px, transparent 2px 7px),
    var(--paper-light);
}

.close {
  position: absolute;
  top: 12px;
  right: 14px;
  width: 44px;
  height: 44px;
  border: 0;
  background: none;
  font-size: 28px;
  line-height: 1;
  color: var(--ink-soft);
}

.close:hover {
  color: var(--cinnabar);
}

.kicker {
  margin: 0;
  color: var(--ink-faint);
  font-size: 14px;
  letter-spacing: 0.2em;
}

.title {
  margin: 6px 0 0;
  font-family: var(--brush);
  font-weight: 400;
  font-size: 44px;
  line-height: 1.15;
  letter-spacing: 0.06em;
}

.stroke {
  display: block;
  width: 78%;
  height: 12px;
  margin: 6px 0 14px;
}

.stroke path {
  fill: none;
  stroke: var(--ink);
  stroke-width: 4;
  stroke-linecap: round;
}

.meta {
  margin: 0 0 12px;
  color: var(--ink-soft);
  font-size: 15px;
  letter-spacing: 0.06em;
}

.body {
  margin: 0 0 10px;
  color: var(--ink-soft);
  font-size: 16px;
  line-height: 1.8;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}

.tags li {
  padding: 3px 10px;
  border: 1.5px solid var(--ink);
  font-size: 14px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}

.actions .seal-btn {
  min-height: 44px;
}

.card-enter-active,
.card-leave-active {
  transition: opacity 0.45s ease, transform 0.45s ease;
}

.card-enter-from,
.card-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(24px);
}

@media (max-width: 700px) {
  .wrap {
    top: auto;
    right: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    transform: none;
  }

  .card {
    max-height: 52vh;
    padding: 28px 22px calc(26px + env(safe-area-inset-bottom));
  }

  .title {
    font-size: 36px;
  }

  .card-enter-from,
  .card-leave-to {
    transform: translateY(24px);
  }
}
</style>
