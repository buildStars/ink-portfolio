<script setup lang="ts">
import { store } from '../store';
</script>

<template>
  <div
    v-if="store.hover && !store.transitioning"
    class="label"
    :style="{ transform: `translate(${store.hover.x + 18}px, ${store.hover.y + 18}px)` }"
  >
    {{ store.hover.label }}
  </div>
</template>

<style scoped>
.label {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 30;
  max-width: 320px;
  padding: 6px 12px;
  background: var(--paper-light);
  border-left: 3px solid var(--cinnabar);
  box-shadow: 3px 4px 0 rgba(22, 22, 22, 0.1);
  font-size: 14px;
  letter-spacing: 0.06em;
  pointer-events: none;
}
</style>
