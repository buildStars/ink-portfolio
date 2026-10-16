import { reactive } from 'vue';

export type RoomId = 'corridor' | 'gallery' | 'about' | 'contact' | 'social';

export interface CardAction {
  label: string;
  href?: string;
  copy?: string;
  room?: RoomId; // 点击后前往某个房间
  music?: boolean; // 点击后开关琴音
}

export interface CardData {
  kicker: string;
  title: string;
  meta?: string;
  body: string[];
  tags?: string[];
  actions?: CardAction[];
  item?: string; // 能单独分享的条目（如作品 id）：打开时网址变成 #/房间/条目
}

/** 3D 场景与 Vue 界面之间共享的状态 */
export const store = reactive({
  phase: 'loading' as 'loading' | 'ready' | 'entered',
  progress: 0,
  progressText: '研墨',
  room: 'corridor' as RoomId,
  transitioning: false,
  hover: null as null | { label: string; x: number; y: number },
  hint: null as string | null, // 房间可临时覆盖底部提示（如门外「滚动推门」）
  atRoomStart: false, // 在房间起点：提示「往回滚返回回廊」
  backProgress: 0, // 往回滚退出房间的进度 0~1
  card: null as CardData | null,
  lowQuality: false,
  musicOn: true, // 访客的偏好（记在本机）
  musicPlaying: false, // 实际是否在响
  musicBlocked: false, // 想出声但浏览器还不放行（访客还没点击 / 按键过）
  doorOpen: false, // 大门已推开：琴声从这一刻起
});
