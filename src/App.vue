<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { store, type RoomId } from './store';
import { Experience } from './three/Experience';
import LoadingScreen from './components/LoadingScreen.vue';
import TopBar from './components/TopBar.vue';
import RoomBanner from './components/RoomBanner.vue';
import HintBar from './components/HintBar.vue';
import HoverLabel from './components/HoverLabel.vue';
import InfoCard from './components/InfoCard.vue';
import { AudioEngine } from './audio/AudioEngine';
import { rooms, site } from './content';
import { pageTitle } from './seo';
import { parseRoute, routeUrl } from './router';

const stage = ref<HTMLDivElement>();
let exp: Experience | null = null;

onMounted(async () => {
  try {
    exp = new Experience(stage.value!);
    if (import.meta.env.DEV) (window as unknown as { __exp: Experience }).__exp = exp;
    exp.setMusicSource(audio); // 院中抚琴者的手跟着琴音动
    await exp.init(parseRoute()); // 先搭访客第一眼要看到的那一处
  } catch (err) {
    console.error(err);
    exp?.dispose();
    exp = null;
    // 3D 启动失败：隐藏 3D 界面，改显示 index.html 里的文字版
    document.documentElement.classList.add('nogl');
  }
});

onBeforeUnmount(() => exp?.dispose());

watch(
  () => store.card,
  (now, before) => {
    if (!now && before) exp?.cardClosed();
  },
);

// 加载完成立刻进园（加载页随之淡出），停在大门前；网址指向某个房间时直接进去
watch(
  () => store.phase,
  (phase) => {
    if (phase === 'ready') void exp?.enter(parseRoute());
  },
);

const navigate = (room: RoomId) => exp?.goTo(room);

// ---------- 网址与标题 ----------
// 换房间记一条浏览记录（浏览器返回键回到上一个房间）；打开 / 关闭作品详情只改网址，不新增记录
function syncUrl(push: boolean) {
  if (store.phase !== 'entered') return;
  const url = routeUrl({ room: store.room, item: store.card?.item });
  // 网址本来就指着这个房间（是跟着网址过来的）：不再新增记录，否则会截断浏览器的「前进」
  if (parseRoute().room === store.room) push = false;
  if (url !== location.pathname + location.search + location.hash) history[push ? 'pushState' : 'replaceState'](null, '', url);
  const where = store.card?.item ? store.card.title : store.room === 'corridor' ? '' : rooms[store.room].gate;
  document.title = where ? `${where} · ${site.name}｜${site.title}` : pageTitle;
}
watch(() => store.room, () => syncUrl(true));
// 换房间时详情会顺带关掉：这时不改网址，浏览器返回时还能回到那件作品
watch(() => store.card?.item, () => !store.transitioning && syncUrl(false));
// 进园时整理一下网址（去掉无效的 #...），并设好标题
watch(() => store.phase, (phase) => phase === 'entered' && syncUrl(false));

// 浏览器前进后退、手动改网址：跟着去；正在转场时先记着，转场结束再同步
const followUrl = () => void exp?.follow(parseRoute());
addEventListener('popstate', followUrl);
watch(
  () => store.transitioning,
  (busy) => !busy && followUrl(),
);

// ---------- 背景音乐 ----------
const audio = new AudioEngine(site.music);
if (import.meta.env.DEV) (window as unknown as { __audio: AudioEngine }).__audio = audio;
try {
  store.musicOn = localStorage.getItem('ink-music') !== 'off';
} catch {
  /* 无痕模式等拿不到本地存储时，默认开 */
}

let asked = false; // 访客亲手打开了琴音开关：不用等开门，马上出声

/**
 * 按当前状态开关声音：偏好开着、且大门已推开（或亲手开过开关）就尝试出声。
 * 浏览器规定访客点击 / 按键之前不许出声（滚轮不算）；放行不了就提示「轻点任意处」，等第一次点击再响。
 */
async function applyMusic() {
  const want = () => store.musicOn && (store.doorOpen || asked);
  if (!want()) {
    if (audio.started) audio.setEnabled(false);
    store.musicPlaying = false;
    store.musicBlocked = false;
    return;
  }
  if (store.musicPlaying) return;
  const ok = await audio.unlock(); // 在点击 / 按键的处理函数里调用时，这一步同步完成放行
  if (!want() || store.musicPlaying) return;
  if (ok) {
    audio.setEnabled(true);
    store.musicPlaying = true;
    store.musicBlocked = false;
  } else {
    store.musicBlocked = true;
  }
}

function toggleMusic() {
  const on = !store.musicPlaying;
  store.musicOn = on;
  if (on) asked = true;
  try {
    localStorage.setItem('ink-music', on ? 'on' : 'off');
  } catch {
    /* 忽略 */
  }
  void applyMusic();
}

// 门一推开就出声
watch(
  () => store.doorOpen,
  (open) => open && void applyMusic(),
);

// 访客的每次点击 / 按键 / 触摸都是让浏览器放行声音的机会：
// 门已开就直接出声；门还没开就先放行（此时总音量为 0），等开门那一刻直接响起
const gestureEvents = ['pointerdown', 'pointerup', 'keydown', 'touchend'] as const;
function onGesture(e: Event) {
  const target = e.target as Element | null;
  if (target?.closest?.('.music-btn')) return; // 点的就是开关，交给开关自己处理
  if (e instanceof KeyboardEvent && (e.key === 'm' || e.key === 'M')) return;
  if (!store.musicOn || store.musicPlaying) return;
  if (store.doorOpen || asked) void applyMusic();
  else void audio.unlock();
}
gestureEvents.forEach((n) => addEventListener(n, onGesture, true));

function onKey(e: KeyboardEvent) {
  if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) toggleMusic();
}
addEventListener('keydown', onKey);

watch(
  () => store.room,
  (room, prev) => {
    audio.setRoom(room);
    if (prev && room !== prev) audio.chime();
  },
);

onBeforeUnmount(() => {
  gestureEvents.forEach((n) => removeEventListener(n, onGesture, true));
  removeEventListener('keydown', onKey);
  removeEventListener('popstate', followUrl);
  audio.dispose();
});
</script>

<template>
  <div ref="stage" class="stage" />
  <template v-if="store.phase === 'entered'">
    <TopBar @navigate="navigate" @music="toggleMusic" />
    <RoomBanner />
    <HintBar />
    <HoverLabel />
    <InfoCard @navigate="navigate" @music="toggleMusic" />
  </template>
  <Transition name="fade">
    <LoadingScreen v-if="store.phase !== 'entered'" />
  </Transition>
</template>
