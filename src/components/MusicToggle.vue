<script setup lang="ts">
import { store } from '../store';

defineEmits<{ toggle: [] }>();
</script>

<template>
  <div class="music">
    <button
      class="ink-btn music-btn"
      :class="{ on: store.musicPlaying }"
      :aria-pressed="store.musicPlaying"
      :aria-label="store.musicPlaying ? '关闭背景音乐' : '开启背景音乐'"
      :title="store.musicPlaying ? '关闭琴音（M）' : '开启琴音（M）'"
      @click="$emit('toggle')"
    >
      <span class="bars" aria-hidden="true"><i /><i /><i /><i /></span>
      <span class="label">琴</span>
    </button>
    <Transition name="fade">
      <span v-if="store.musicBlocked" class="tip">轻点任意处 · 开启琴音</span>
    </Transition>
  </div>
</template>

<style scoped>
.music {
  position: relative;
}

.music-btn {
  min-height: 40px;
  gap: 6px;
}

/* 四道墨线：开着时像声波一样起伏，关着时平躺 */
.bars {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 16px;
}

.bars i {
  display: block;
  width: 2.5px;
  height: 3px;
  background: currentColor;
  border-radius: 2px;
  transition: height 0.3s ease;
}

.on .bars i {
  background: var(--cinnabar);
  animation: string 1.6s ease-in-out infinite;
}

.on .bars i:nth-child(2) {
  animation-delay: -0.4s;
}

.on .bars i:nth-child(3) {
  animation-delay: -0.9s;
}

.on .bars i:nth-child(4) {
  animation-delay: -1.3s;
}

@keyframes string {
  0%,
  100% {
    height: 4px;
  }

  50% {
    height: 15px;
  }
}

.tip {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  padding: 4px 10px;
  background: var(--paper-light);
  border-left: 3px solid var(--cinnabar);
  box-shadow: 3px 4px 0 rgba(22, 22, 22, 0.1);
  font-size: 12px;
  letter-spacing: 0.08em;
  white-space: nowrap;
  pointer-events: none;
  animation: breathe 2.4s ease-in-out infinite;
}

@media (max-width: 380px) {
  .label {
    display: none;
  }
}

@keyframes breathe {
  50% {
    opacity: 0.55;
  }
}
</style>
