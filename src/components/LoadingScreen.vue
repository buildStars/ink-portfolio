<script setup lang="ts">
import { computed } from 'vue';
import { store } from '../store';
import { site } from '../content';

const pct = computed(() => Math.round(Math.min(store.progress, 1) * 100));
const sealChars = [...site.seal].slice(0, 4);
</script>

<template>
  <div class="loading">
    <div class="drop" :class="{ ready: store.phase === 'ready' }" />
    <div class="center">
      <h1 class="name">{{ site.name }}</h1>
      <p class="role">{{ site.role }} · {{ site.description }}</p>
      <div class="stroke"><span :style="{ width: pct + '%' }" /></div>
      <p class="status">{{ store.phase === 'ready' ? '园门已开' : `${store.progressText} · ${pct}%` }}</p>
      <p class="tip">滚动或上滑前行 · 推门入园</p>
    </div>
    <div class="seal" aria-hidden="true">
      <span v-for="(c, i) in sealChars" :key="i">{{ c }}</span>
    </div>
  </div>
</template>

<style scoped>
.loading {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 50% 40%, rgba(255, 255, 255, 0.5), transparent 60%),
    var(--paper);
}

.drop {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 46vmin;
  height: 46vmin;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(22, 22, 22, 0.16) 0%, rgba(22, 22, 22, 0.07) 45%, transparent 70%);
  filter: blur(6px);
  transform: translate(-50%, -50%) scale(0.6);
  animation: breathe 3.2s ease-in-out infinite;
}

.drop.ready {
  animation: spread 1.6s ease-out forwards;
}

@keyframes breathe {
  50% {
    transform: translate(-50%, -50%) scale(0.75);
  }
}

@keyframes spread {
  to {
    transform: translate(-50%, -50%) scale(1.25);
    opacity: 0.6;
  }
}

.center {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 0 24px;
  text-align: center;
}

.name {
  margin: 0;
  font-family: var(--brush);
  font-weight: 400;
  font-size: clamp(64px, 14vmin, 128px);
  line-height: 1;
  letter-spacing: 0.08em;
}

.role {
  margin: 0;
  color: var(--ink-soft);
  font-size: 15px;
  letter-spacing: 0.12em;
}

.stroke {
  width: min(280px, 60vw);
  height: 6px;
  margin: 18px 0 6px;
  background: rgba(22, 22, 22, 0.08);
  border-radius: 3px;
  overflow: hidden;
}

.stroke span {
  display: block;
  height: 100%;
  background: var(--ink);
  border-radius: 0 3px 3px 0;
  transition: width 0.4s ease;
}

.status {
  margin: 0;
  min-height: 44px;
  color: var(--ink-faint);
  font-family: var(--brush);
  font-size: 20px;
  letter-spacing: 0.2em;
}

.tip {
  margin: 10px 0 0;
  color: var(--ink-faint);
  font-size: 13px;
  letter-spacing: 0.1em;
}

.seal {
  position: absolute;
  right: 28px;
  bottom: 28px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
  grid-auto-flow: column;
  direction: rtl;
  width: 64px;
  height: 64px;
  padding: 6px;
  background: var(--cinnabar);
  color: var(--paper-light);
  font-family: var(--brush);
  font-size: 22px;
  line-height: 26px;
  text-align: center;
}
</style>
