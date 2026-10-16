<script setup lang="ts">
import { computed } from 'vue';
import { store } from '../store';
import { rooms } from '../content';

const touch = matchMedia('(pointer: coarse)').matches;
const hint = computed(() => (store.room === 'corridor' && store.hint) || rooms[store.room].hint);
const backText = touch ? '下拉返回回廊' : '向上滚动返回回廊';
const pushing = computed(() => store.backProgress > 0);
</script>

<template>
  <div v-if="!store.card && !store.transitioning" class="bar">
    <Transition name="quick" mode="out-in">
      <p v-if="pushing" key="back" class="hint back">
        继续{{ touch ? '下拉' : '向上滚动' }} · 返回回廊
        <span class="meter"><span :style="{ width: store.backProgress * 100 + '%' }" /></span>
      </p>
      <p v-else :key="hint" class="hint">
        {{ hint }}<template v-if="store.atRoomStart"> · {{ backText }}</template>
      </p>
    </Transition>
  </div>
</template>

<style scoped>
.bar {
  position: fixed;
  left: 50%;
  bottom: max(20px, env(safe-area-inset-bottom));
  z-index: 10;
  transform: translateX(-50%);
  pointer-events: none;
}

.hint {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 6px 16px;
  max-width: calc(100vw - 32px);
  background: rgba(236, 230, 216, 0.75);
  color: var(--ink-soft);
  font-size: 13px;
  letter-spacing: 0.12em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.back {
  color: var(--ink);
}

.meter {
  position: relative;
  display: inline-block;
  width: 80px;
  height: 4px;
  background: rgba(22, 22, 22, 0.12);
  border-radius: 2px;
  overflow: hidden;
}

.meter span {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--ink);
  border-radius: 2px;
  transition: width 0.15s ease;
}

.quick-enter-active,
.quick-leave-active {
  transition: opacity 0.25s ease;
}

.quick-enter-from,
.quick-leave-to {
  opacity: 0;
}
</style>
