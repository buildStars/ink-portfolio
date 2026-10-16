/**
 * 网站全部文字内容都在这里。
 * 改名字、项目、经历、联系方式只需要改这个文件，3D 场景会自动跟着变。
 * 当前全部是占位内容。
 */

export interface Project {
  id: string;
  title: string; // 挂轴上的竖排标题，建议 2~5 个字
  year: string;
  summary: string; // 鼠标悬停时的一句话
  description: string[]; // 详情卡正文，一段一行
  tags: string[]; // 技术栈
  link?: string; // 「打开项目」按钮的地址
}

export interface Experience {
  period: string; // 石碑顶部的年份
  title: string; // 石碑上的竖排标题，建议 2~5 个字
  place: string;
  detail: string;
}

export interface Contact {
  id: string;
  label: string; // 木牌上的字，建议 2~4 个字
  value: string;
  note: string;
  action: 'mail' | 'copy' | 'link';
  href?: string;
}

export interface Social {
  id: string;
  platform: string; // 屏风上的竖排大字
  handle: string;
  description: string;
  href: string;
}

export const site = {
  name: '墨客', // 你的名字或昵称
  role: '创意开发者',
  title: '游于艺', // 回廊入口悬挂的匾额
  tagline: ['以代码为笔', '以屏幕为纸'], // 书房墙上挂轴的题字（用第一句）
  // 大门两侧的对联：[上联（贴门右侧）, 下联（贴门左侧）]。默认是苏州沧浪亭的名联（欧阳修、苏舜钦句）
  couplet: ['清风明月本无价', '近水远山皆有情'],
  seal: '创意开发', // 四字印章（右上、右下、左上、左下的顺序）
  description: '一座可以走进去的水墨作品集。',
  gatePlaque: '墨园', // 大门门楼上的匾额
  welcome: '欢迎入园', // 进门后人物身后的欢迎语
  // 你的人物形象：放一张透明背景的线稿 PNG 到 public/ 目录，在这里填路径，如 '/portrait.png'。
  // 留空则使用代码画的占位人物。
  portrait: '',
  // 背景音乐：留空则播放实时合成的古琴曲；想用自己的曲子，把音频文件放进 public/ 目录，
  // 在这里填路径，如 '/music.mp3'（请确认你有这首曲子的使用授权）。
  music: '',
  // 网站上线后的完整网址，如 'https://moke.com'。分享卡片的图片地址需要完整网址，上线前留空即可。
  url: 'https://me.mianbook.ink',
};

export const rooms = {
  corridor: { gate: '', title: '回廊', hint: '滚动或拖动前行 · 点击月洞门进入' },
  gallery: { gate: '作品集', title: '画廊', hint: '滚动浏览挂轴 · 点击查看项目' },
  about: { gate: '关于我', title: '山巅', hint: '滚动沿山路而上 · 点击石碑与山亭' },
  contact: { gate: '联系', title: '渡口', hint: '沿栈桥前行 · 点击木牌联系我' },
  social: { gate: '书房', title: '书房', hint: '点击屏风查看各平台账号' },
} as const;

export const projects: Project[] = [
  {
    id: 'wedding',
    title: '婚礼摄影',
    year: '2026',
    summary: '为摄影工作室打造的编辑风作品集',
    description: ['为一家婚礼摄影工作室打造的编辑风作品集网站。', '支持上千张高清照片流畅浏览，翻页过渡如翻阅画册。'],
    tags: ['Vue', 'GSAP', 'Vite'],
    link: 'https://example.com',
  },
  {
    id: 'game',
    title: '互动游戏',
    year: '2025',
    summary: '用摄像头手势游玩的网页小游戏',
    description: ['一款用摄像头手势游玩的网页小游戏。', '实时识别手部动作，内置每日排行榜。'],
    tags: ['TypeScript', 'Canvas', 'MediaPipe'],
    link: 'https://example.com',
  },
  {
    id: 'multiplayer',
    title: '多人联机',
    year: '2025',
    summary: '浏览器里的多人实时协作白板',
    description: ['浏览器里的多人实时协作白板。', '支持数十人同时编辑，断线自动恢复。'],
    tags: ['Vue', 'WebSocket', 'Node.js'],
    link: 'https://example.com',
  },
  {
    id: 'ink-ui',
    title: '水墨组件库',
    year: '2024',
    summary: '一套带笔意的界面组件库',
    description: ['一套水墨风格的界面组件库。', '按钮、卡片、弹窗皆有笔意，开源，可直接用于 Vue 项目。'],
    tags: ['Vue', 'TypeScript', 'CSS'],
    link: 'https://example.com',
  },
];

export const about = {
  pavilion: '问心亭', // 山顶亭子的匾额
  bio: [
    '你好，我是墨客，一名喜欢把技术与东方美学揉在一起的创意开发者。',
    '日常写 Vue 和 TypeScript，业余时间研究 WebGL 与交互动效。',
    '相信好的网页应该像一幅画：有留白，有节奏，经得起细看。',
  ],
  experiences: [
    { period: '2025 — 今', title: '独立开发', place: '自由职业', detail: '为品牌与个人打造交互网站与小程序。' },
    { period: '2023 — 2025', title: '前端工程师', place: '某互联网公司', detail: '负责数据可视化平台与组件库建设。' },
    { period: '2022', title: '设计实习', place: '某设计工作室', detail: '参与品牌视觉与动效设计。' },
    { period: '2019 — 2023', title: '计算机系', place: '某大学', detail: '本科，主修计算机科学，辅修视觉传达。' },
  ] as Experience[],
  skills: ['Vue', 'TypeScript', 'Three.js', 'WebGL', 'GSAP', 'Node.js', 'Figma', 'Blender'],
};

export const contacts: Contact[] = [
  { id: 'mail', label: '邮箱', value: 'hello@example.com', note: '合作与约稿，请写邮件。', action: 'mail', href: 'mailto:hello@example.com' },
  { id: 'wechat', label: '微信', value: 'your-wechat-id', note: '加好友请备注来意。', action: 'copy' },
  { id: 'github', label: 'GitHub', value: 'github.com/your-name', note: '开源项目与代码。', action: 'link', href: 'https://github.com/' },
  { id: 'resume', label: '简历', value: 'resume.pdf', note: '下载完整简历。', action: 'link', href: '#' },
];

export const socials: Social[] = [
  { id: 'bilibili', platform: '哔哩哔哩', handle: '@墨客', description: '长视频：项目复盘与编程直播。', href: 'https://www.bilibili.com/' },
  { id: 'xhs', platform: '小红书', handle: '@墨客', description: '设计灵感与作品碎片。', href: 'https://www.xiaohongshu.com/' },
  { id: 'douyin', platform: '抖音', handle: '@墨客', description: '一分钟看完一个特效。', href: 'https://www.douyin.com/' },
  { id: 'weibo', platform: '微博', handle: '@墨客', description: '日常与碎碎念。', href: 'https://weibo.com/' },
];
