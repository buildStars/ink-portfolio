<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { store } from '../store';
import { rooms, site } from '../content';

const show = ref(false);
let timer = 0;
const title = computed(() => (store.room === 'corridor' ? site.title : rooms[store.room].title));

watch(
  () => [store.room, store.transitioning] as const,
  ([, busy]) => {
    if (busy) return;
    show.value = true;
    clearTimeout(timer);
    timer = window.setTimeout(() => (show.value = false), 2800);
  },
);
</script>

<template>
  <Transition name="banner">
    <div v-if="show" :key="store.room" class="banner" aria-live="polite">
      <span v-for="(c, i) in [...title]" :key="i">{{ c }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.banner {
  position: fixed;
  top: 50%;
  right: clamp(20px, 6vw, 80px);
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: var(--brush);
  font-size: clamp(48px, 9vmin, 96px);
  line-height: 1.05;
  color: var(--ink);
  text-shadow: 0 0 24px rgba(236, 230, 216, 0.9);
  transform: translateY(-50%);
  pointer-events: none;
}

.banner-enter-active,
.banner-leave-active {
  transition: opacity 1s ease, filter 1s ease;
}

.banner-enter-from,
.banner-leave-to {
  opacity: 0;
  filter: blur(8px);
}
</style>
