/**
 * 网站全部文字内容都在这里。
 * 改名字、项目、经历、联系方式只需要改这个文件，3D 场景会自动跟着变。
 * 内容取自简历（简历_全栈版_新.docx）。
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
  name: 'Wade', // 你的名字或昵称
  role: '前端 / 全栈开发工程师',
  title: '游于艺', // 回廊入口悬挂的匾额
  tagline: ['以代码为笔', '以屏幕为纸'], // 书房墙上挂轴的题字（用第一句）
  // 大门两侧的对联：[上联（贴门右侧）, 下联（贴门左侧）]。默认是苏州沧浪亭的名联（欧阳修、苏舜钦句）
  couplet: ['清风明月本无价', '近水远山皆有情'],
  seal: '游于艺印', // 四字印章（右上、右下、左上、左下的顺序）
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
    id: 'mianbook',
    title: '面试手册',
    year: '2026',
    summary: 'AI 模拟面试刷题平台，独立全栈开发',
    description: [
      '面向技术求职者的中文面试平台：462 道题覆盖前端、后端、LLM / Agent 等 34 个分类，提供 AI 模拟面试官（作答打分 + 追问）、整场模拟面试、按简历出题、间隔复习与管理后台。独立全栈开发，约 2.5 万行代码。',
      '全栈架构：Nitro 文件路由实现 54 个 REST / SSE 接口，Drizzle ORM 设计 13 张 MySQL 表；zod 统一参数校验，加密 Cookie 会话 + 管理接口每次回库校验角色；前后端通过 shared/ 共享类型与校验规则。',
      'AI 流式点评：基于 POST 的 SSE 流式输出，前端用 fetch + ReadableStream 解析；中断或关页时用 AbortController 取消上游请求以节省 token；支持 7 家服务商及自带 Key。',
      'LLM 安全与成本控制：清洗伪造标签防提示注入；自带 Key 仅允许 https + 白名单域名且禁止重定向，防 SSRF；AI 输出转义渲染防 XSS；按 24 小时滚动窗口限流，统计 token 用量估算成本。',
      '学习闭环与搜索：ts-fsrs 实现间隔复习，AI 得分自动映射为复习评分；Intl.Segmenter 分词 + MiniSearch 实现中文全文检索；后台改题同步回写 Markdown，保留 50 个历史版本。',
      '测试与部署：Vitest 约 124 个用例（单元 + 接口两层，接口测试拉起真实服务、独立测试库与自写 Mock LLM）；Docker 多阶段构建 + Compose 编排，一条命令发布、健康检查与每日备份。',
    ],
    tags: ['Nuxt 4', 'Nitro', 'TypeScript', 'MySQL 8', 'Drizzle ORM', 'zod', 'Vitest', 'Docker', 'Caddy'],
    link: 'https://mianbook.ink',
  },
  {
    id: 'i18n-triage',
    title: '国际化审计',
    year: '2026',
    summary: '开源 Vue i18n 硬编码审计 CLI，已发布 npm',
    description: [
      'i18n-triage：开源的 i18n 硬编码审计命令行工具，已发布 npm，找出 Vue / TypeScript 代码里真正需要翻译的硬编码中文。',
      'AST 语义分类：解析 Vue SFC / TS / JSX，按调用上下文把硬编码中文分为 UI 文案、日志、数据字典、内部键四类，只上报需翻译项；在 4 个开源 Vue 项目实测降噪 43%–86%，UI 文案精确率 93.8%–100%。',
      '自动修复与 CI 集成：--fix 自动抽 key 并改写源码，在 RuoYi-Vue3 一次改写 74 个文件 / 2,361 处文案，0 编译错误且幂等；输出 SARIF 并封装 GitHub Action，PR 内行级标注。',
      '工程质量：core 层零 IO，自定义 ESLint 规则强制分层；372 个 Vitest 用例，CI 在 Node 20 / 22 / 24 矩阵跑 lint、类型检查、测试、构建与安装冒烟测试。',
    ],
    tags: ['TypeScript', '@vue/compiler-sfc', 'ts-morph', 'Turborepo', 'Vitest', 'GitHub Actions'],
    link: 'https://github.com/buildStars/i18n-triage',
  },
  {
    id: 'monorepo',
    title: '架构升级',
    year: '2026',
    summary: '主导出海电商双端 Monorepo 架构升级',
    description: [
      '公司是面向非洲、东南亚的多品牌出海电商平台（7 种币种、3 种语言、白标站点），我负责 H5 / PC / 运营后台三端前端，H5 主站 9.5 万行代码、256 个组件。',
      '2026 年 5 月起主导双端架构升级：两套独立仓库重构为 pnpm workspace + Turborepo Monorepo，抽出 api / types / stores 等 8 个共享业务包与 4 个配置包，ESLint 约束单向依赖。',
      '通用分页 composable 同时支撑 PC 翻页与 H5 无限滚动，减少两端重复代码。',
    ],
    tags: ['pnpm workspace', 'Turborepo', 'Vue 3', 'TypeScript', 'ESLint'],
  },
  {
    id: 'campaign',
    title: '玩法引擎',
    year: '2024 — 今',
    summary: '营销玩法模板引擎，新玩法接入从数天降至半天内',
    description: [
      '出海电商的营销玩法模板引擎：以「玩法 ID + 品类 KEY」组件注册表 + 可配置行列模板，替代层层 v-if 堆叠。',
      '常规玩法零代码接入，新玩法接入从数天降至半天内。',
    ],
    tags: ['Vue 3', 'TypeScript'],
  },
  {
    id: 'performance',
    title: '首屏优化',
    year: '2024 — 今',
    summary: '出海电商的首屏性能、国际化与慢资源监控',
    description: [
      '首屏与渲染优化：Sentry / Lottie 移出关键路径、图片 WebP 化、SVG 按需加载，压缩首屏 JS、缩短 LCP；高频价格推送改为浅比较 + 3 秒合并刷新。',
      '国际化：Crowdin 协作流 + 语言包按需加载 + 提交阶段 i18n 静态校验。',
      '可观测性：基于 Resource Timing 自研慢资源上报，按 CDN 线路定位区域性慢加载。',
    ],
    tags: ['Vue 3', 'Vue I18n', 'Crowdin', 'Sentry', 'Resource Timing'],
  },
];

export const about = {
  pavilion: '问心亭', // 山顶亭子的匾额
  bio: [
    '3 年+ 前端开发经验，近 3 年负责出海电商 H5 / PC / 运营后台三端，主导公司双端 Monorepo 架构升级。',
    '能独立完成全栈交付：独立开发 AI 模拟面试平台「全栈面试手册」（Nuxt 4 + MySQL，54 个接口、13 张表），覆盖数据库设计、接口开发、LLM 接入、自动化测试与 Docker 部署上线。',
    '做 AI 应用开发：独立实现 LLM 模拟面试官（流式点评、多模型接入、提示注入 / SSRF 防护、token 成本控制）；日常用 Claude Code 等 AI 编程工具，以规格文档 + 测试驱动高效交付。',
    '开源 Vue i18n 审计工具 i18n-triage 已发布 npm（372 个测试用例 + Node 多版本 CI 矩阵）。',
    '意向城市深圳，随时到岗。',
  ],
  experiences: [
    {
      period: '2024.01 — 今',
      title: '前端工程师',
      place: '出海电商公司',
      detail: '面向非洲、东南亚的多品牌出海电商平台，负责 H5 / PC / 运营后台三端前端；主导双端 Monorepo 架构升级，搭建营销玩法模板引擎，负责首屏性能、国际化与可观测性。',
    },
    {
      period: '2023.06 — 2023.12',
      title: '前端开发',
      place: '深圳星游矩阵科技有限公司',
      detail: 'AI 绘图 Web 平台（Vue 3）：负责任务提交、参数面板与结果画廊等模块，处理长耗时任务轮询与异常态。',
    },
    {
      period: '2022.06 — 2023.01',
      title: '前端实习',
      place: '广州斑鸠留学服务有限公司',
      detail: '考研课程类 App（uniapp 跨端）：负责课程列表、课程详情与视频播放页面，封装通用工具函数与请求层。',
    },
    { period: '2019.09 — 2023.06', title: '软件工程', place: '广州南方学院', detail: '软件工程专业，本科。' },
  ] as Experience[],
  skills: ['Vue 3', 'TypeScript', 'Nuxt 4', 'Node.js', 'MySQL', 'Docker', 'Three.js', 'GSAP', 'LLM 应用', 'Monorepo', 'Vitest', 'uniapp'],
};

export const contacts: Contact[] = [
  { id: 'mail', label: '邮箱', value: '956330362@qq.com', note: '工作机会与合作，欢迎来信。', action: 'mail', href: 'mailto:956330362@qq.com' },
  { id: 'github', label: 'GitHub', value: 'github.com/buildStars', note: '开源项目与代码。', action: 'link', href: 'https://github.com/buildStars' },
];

export const socials: Social[] = [
  { id: 'github', platform: '开源代码', handle: 'GitHub @buildStars', description: '开源项目与源码：i18n-triage、本站源码等。', href: 'https://github.com/buildStars' },
  { id: 'npm', platform: '开源包', handle: 'npm · i18n-triage', description: '已发布到 npm 的 Vue i18n 硬编码审计 CLI。', href: 'https://www.npmjs.com/package/i18n-triage' },
  { id: 'mianbook', platform: '面试手册', handle: 'mianbook.ink', description: '独立全栈开发的 AI 模拟面试刷题平台。', href: 'https://mianbook.ink' },
];
