import type { RoomId } from './store';

/**
 * 网址里的位置：每个房间一个地址，作品还能单独分享。
 *   /                  大门与回廊
 *   /#/gallery         作品集
 *   /#/gallery/mianbook 作品集里的某件作品（content.ts 里项目的 id）
 *   /#/about  /#/contact  /#/social
 * 用 # 而不是真路径：部署到任何静态托管都不用额外配置服务器。
 */
export interface Route {
  room: RoomId;
  item?: string;
}

const ROOMS: readonly RoomId[] = ['gallery', 'about', 'contact', 'social'];

export function parseRoute(hash = location.hash): Route {
  let parts: string[];
  try {
    parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return { room: 'corridor' }; // 网址里有残缺的转义字符
  }
  const room = ROOMS.find((r) => r === parts[0]);
  if (!room) return { room: 'corridor' };
  return parts[1] ? { room, item: parts[1] } : { room };
}

/** 路由对应的完整地址（不含域名） */
export function routeUrl(r: Route) {
  const base = location.pathname + location.search;
  if (r.room === 'corridor') return base;
  return `${base}#/${r.room}${r.item ? `/${encodeURIComponent(r.item)}` : ''}`;
}
