<script setup lang="ts">
import { ref } from 'vue';
import { store, type RoomId } from '../store';
import { rooms, site } from '../content';
import MusicToggle from './MusicToggle.vue';

const emit = defineEmits<{ navigate: [room: RoomId]; music: [] }>();
const open = ref(false);

const entries: { id: RoomId; label: string }[] = [
  { id: 'corridor', label: '回廊' },
  { id: 'gallery', label: rooms.gallery.gate },
  { id: 'about', label: rooms.about.gate },
  { id: 'contact', label: rooms.contact.gate },
  { id: 'social', label: rooms.social.gate },
];

function go(id: RoomId) {
  open.value = false;
  emit('navigate', id);
}
</script>

<template>
  <header class="bar">
    <button class="brand" title="回到回廊" @click="go('corridor')">
      <span class="mark">{{ [...site.name][0] }}</span>
      <span class="name">{{ site.name }}</span>
    </button>

    <Transition name="fade">
      <button v-if="store.room !== 'corridor'" class="ink-btn back" :disabled="store.transitioning" @click="go('corridor')">
        ← 返回回廊
      </button>
    </Transition>

    <MusicToggle class="music-slot" @toggle="emit('music')" />

    <nav class="menu">
      <button class="ink-btn" :aria-expanded="open" @click="open = !open">目录</button>
      <Transition name="fade">
        <ul v-if="open" class="list">
          <li v-for="e in entries" :key="e.id">
            <button :class="{ active: store.room === e.id }" :disabled="store.transitioning" @click="go(e.id)">
              {{ e.label }}
            </button>
          </li>
        </ul>
      </Transition>
    </nav>
  </header>
</template>

<style scoped>
.bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: max(16px, env(safe-area-inset-top)) 20px 0;
  pointer-events: none;
}

.bar > * {
  pointer-events: auto;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0;
  border: 0;
  background: none;
}

.mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  background: var(--cinnabar);
  color: var(--paper-light);
  font-family: var(--brush);
  font-size: 26px;
  clip-path: polygon(2% 3%, 98% 0, 100% 97%, 0 100%);
}

.name {
  font-family: var(--brush);
  font-size: 26px;
  letter-spacing: 0.1em;
}

.back {
  min-height: 40px;
}

.music-slot {
  margin-left: auto;
}

.menu {
  position: relative;
}

.menu > .ink-btn {
  min-height: 40px;
}

.list {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 140px;
  margin: 0;
  padding: 8px 0;
  list-style: none;
  background: var(--paper-light);
  border: 1.5px solid var(--ink);
  box-shadow: 4px 6px 0 rgba(22, 22, 22, 0.12);
}

.list button {
  width: 100%;
  min-height: 40px;
  padding: 6px 18px;
  border: 0;
  background: none;
  text-align: left;
  font-family: var(--brush);
  font-size: 20px;
  letter-spacing: 0.12em;
}

.list button:hover {
  background: rgba(22, 22, 22, 0.06);
}

.list button.active {
  color: var(--cinnabar);
}
@media (max-width: 520px) {
  .name {
    display: none;
  }
}
</style>
