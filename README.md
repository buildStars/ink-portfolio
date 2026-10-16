# 游于艺 · 水墨作品集（MVP）

一座可以走进去的水墨作品集：滚动推开朱漆大门，院中有人招手相迎，穿过小院进入回廊，四道月洞门后各是一个小世界。

**入园路线**：门外（一对太湖峰石、垂柳）→ 滚动推门 → 院子（人物、欢迎语、锦鲤池、石灯笼、石桌石凳、花木，左侧石台上一位长袍抚琴者）→ 回廊。抚琴者的手跟着正在播放的琴音动（右手拨弦、左手按到音位、滑音时沿弦滑、吟时轻颤、泛音点弦），琴音关着时他无声地弹；点他可看曲子介绍、开关琴音。全程一路滚动，没有按钮。回廊里走近每道月洞门时，门所在的那段墙会像立体书一样翻出来、转向来客（镜头不转；竖屏手机上镜头会略偏头辅助），正对时停留约 3 下滚动，继续前行门板合回墙面。每道月洞门里实时「透」出门后房间的画面，点门进入时镜头穿过门洞直接入画。回廊墙上布置了漏窗、书条石（古人诗句）、挂轴和花几盆景。在任一房间的起点继续往回滚（手机下拉）约 3 下，即返回回廊。

**背景声音**：实时合成的古琴曲（原创小品，按古琴曲结构：散起 → 主题 → 泛音段 → 对比段 → 主题再现 → 尾声；正调 F 宫，带走手音、吟、泛音、撮；音区温润不尖，长混响）＋随房间变化的风声、水声、瀑布、鸟鸣，进房间时一声轻磬，换房间时曲子不中断。顶栏「琴」按钮或 M 键开关，选择会记在本机。浏览器规定须先点击或按键才能出声，首次会提示「轻点任意处 · 开启琴音」。想换成自己的曲子：音频文件放进 `public/`，在 `content.ts` 填 `site.music`。

| 门 | 门后世界 | 内容 |
|---|---|---|
| 作品集 | 画廊：竹竿上挂着一排挂轴 | 每幅挂轴是一个项目，点击看详情 |
| 关于我 | 山巅：沿石阶而上 | 石碑是经历，孔明灯是技能，山亭里是自我介绍 |
| 联系 | 渡口：湖上栈桥 | 木牌是邮箱、微信、GitHub 等 |
| 书房 | 书房：一架屏风 | 每扇屏风是一个社交平台账号 |

## 运行

```bash
npm install
npm run dev        # 开发：http://localhost:5190
npm run build      # 打包到 dist/，可直接部署到任何静态托管
npm run preview    # 本地预览打包结果
npm run deploy     # 打包并发布到 https://me.mianbook.ink
```

## 部署

线上地址：**https://me.mianbook.ink**（腾讯云轻量服务器，首尔，无需备案）。

改完内容后执行 `npm run deploy` 即可：脚本会打包、通过 SSH（密钥 `~/.ssh/handbook_seoul`）把网页传到服务器的 `/opt/ink-portfolio/www`，立即生效，不需要重启任何服务。

服务器上的结构（一次性配置，已完成）：

- 服务器的 80/443 端口由 handbook（mianbook.ink）的 Caddy 占用，作品集挂在同一个 Caddy 上，HTTPS 证书由 Caddy 自动申请、续期。
- `/opt/handbook/compose.override.yml`、`/opt/handbook/Caddyfile.main`：让 Caddy 额外载入 `/opt/ink-portfolio/caddy/*.caddy`，并把网页目录挂进容器。docker compose 会自动合并 override 文件，handbook 重新部署（只覆盖 `compose.yml`、`Caddyfile`）不会影响作品集。
- 三份配置的原件在本项目的 `deploy/` 目录；改了 `deploy/site.caddy` 需要传到 `/opt/ink-portfolio/caddy/ink-portfolio.caddy` 后执行 `docker exec handbook-caddy-1 caddy reload --config /etc/caddy/Caddyfile.main --adapter caddyfile`。
- DNS：DNSPod 里 `me` 这条 A 记录指向 43.133.254.183。
- 服务器开启了 BBR 拥塞控制（`/etc/sysctl.d/99-bbr.conf`、`/etc/modules-load.d/bbr.conf`）：跨境线路有丢包时下载更快、更稳，对 handbook 同样有效。

## 改内容（只需改一个文件）

所有文字都在 `src/content.ts`：名字、匾额、题字、项目、经历、技能、联系方式、社交账号。
改完保存，3D 场景会自动重新生成，不需要碰任何 3D 代码。

- 增删项目：在 `projects` 数组里加减即可，挂轴数量和画廊宽度会自动适配。
- 挂轴、石碑、屏风上的竖排字建议 2~5 个字，太长会自动缩小。
- 微信用 `action: 'copy'`（点击复制）；邮箱用 `'mail'`；其余链接用 `'link'`。
- 大门匾额、欢迎语分别是 `site.gatePlaque`、`site.welcome`；门两侧的对联是 `site.couplet`（上联在右、下联在左），书房挂轴上的题字是 `site.tagline`。
- **换成你自己的人物形象**：把一张透明背景的线稿 PNG 放进 `public/`（如 `public/portrait.png`），再把 `site.portrait` 设为 `'/portrait.png'`。留空则显示代码画的占位人物。
- **上线后填 `site.url`**（如 `'https://moke.com'`）再打包：分享卡片的图片地址需要完整网址。
- 网站图标（朱红印章里名字的第一个字）和分享卡片 `og.png`（名字、印章、身份、介绍 + 水墨山水）打包时按这里的内容自动生成，开发时可直接打开 http://localhost:5190/og.png 查看。想用自己做的图，放进 `public/` 同名文件（`og.png`、`favicon.svg`、`favicon.ico`、`apple-touch-icon.png`）即可替换。

## 网址

每个房间都有自己的地址，刷新停在原处，浏览器返回键回到上一个房间：

| 地址 | 位置 |
|---|---|
| `/` | 大门与回廊 |
| `/#/gallery` | 作品集 |
| `/#/gallery/mianbook` | 直接打开某件作品（`mianbook` 是 `projects` 里的 `id`） |
| `/#/about`、`/#/contact`、`/#/social` | 关于我、联系、书房 |

想把某件作品发给别人：打开它的详情，复制地址栏的链接即可。分享链接会跳过大门，直接进入对应房间。

## 宣传片

约 32 秒，横屏 1920×1080 和竖屏 1080×1920 各一版：大门 → 推门 → 院中抚琴、锦鲤池 → 回廊月洞门 → 飞进画廊 → 山巅、渡口、书房快切 → 片尾网址。配乐是网站自己的古琴曲（离线渲染，抚琴人的手与琴音同步）。

改了 content.ts 后重录：先 `npm run dev`，再用浏览器打开

- http://localhost:5190/?promo=landscape —— 横屏，存为 `promo/ink-portfolio-promo-16x9.mp4`
- http://localhost:5190/?promo=portrait —— 竖屏，存为 `promo/ink-portfolio-promo-9x16.mp4`

页面会自动逐帧渲染并编码（几十秒，不需要守着画面），完成后文件出现在 `promo/` 目录。地址后加 `&preview` 只出一张分镜预览图（`promo/storyboard-*.jpg`），用来先检查构图和字幕。镜头、字幕、时间点都在 `src/promo/record.ts` 开头的「剧本」一节。录制代码只在开发模式存在，不会打进网站。

## 目录结构

```
build/brushFont.ts      ← 打包时按页面用到的字生成精简毛笔字库
build/shareCard.ts      ← 打包时生成网站图标与分享卡片图
deploy/                 ← 发布脚本（npm run deploy）与服务器上的 Caddy 配置原件
build/promoSink.ts      ← 开发服务器接收录好的宣传片，存进 promo/
src/
  content.ts            ← 全部内容（你最常改的文件）
  seo.ts                ← 打包时根据 content.ts 生成文字版与分享卡片信息
  store.ts              ← 3D 场景与界面共享的状态
  router.ts             ← 网址与房间、作品的对应（#/gallery/…）
  promo/                ← 宣传片录制（剧本、逐帧渲染、配乐、编码；只在开发模式用）
  App.vue               ← 页面骨架
  components/           ← Vue 界面：加载页、顶栏、信息卡、提示、音乐开关
  audio/AudioEngine.ts  ← 背景声音：古琴合成、曲谱与编排、环境声、开关与淡入淡出
  three/
    Experience.ts       ← 总控：渲染、输入、转场、画质分级
    InkShader.ts        ← 水墨滤镜（描墨线、墨色分层、只留朱红、墨晕转场）
    Rig.ts              ← 相机平滑跟随
    shanshui/           ← shan-shui-inf 山水生成器（MIT，含原许可证）及封装
    paint.ts            ← 程序化水墨素材：远山、天上的淡墨云、梅竹松柳、芭蕉兰草、锦鲤、祥云、印章、竖排字、占位人物
    garden.ts           ← 园林造景：石灯笼、石桌石凳、花盆、锦鲤池
    wallDecor.ts        ← 回廊墙面：漏窗、书条石、挂轴、花几
    guqinPlayer.ts      ← 院中抚琴者：琴台、古琴、人物，手部动作与琴音同步
    roomDecor.ts        ← 房间装饰：荷塘、木平台、牌坊、瀑布、渡亭、香炉、博古架、古琴、山水横幅
    taihu.ts            ← 太湖峰石：用距离场拼出石身、挖出孔洞，Marching Cubes 生成网格（加载时约 0.1 秒）
    rooms/              ← 大门小院 + 回廊（Corridor.ts）和四个门后世界，每个文件一个
```

## 技术要点

- **Vue 3 + Vite + TypeScript** 负责界面；**Three.js** 负责 3D，二者通过 `store.ts` 通信。
- 画面里的山水花木全部用 Canvas 现画，没有图片素材；远山、松树和挂轴/屏风里的小幅山水来自 [shan-shui-inf](https://github.com/LingDong-/shan-shui-inf) 的生成器。水墨感来自 `InkShader.ts` 这一层后处理。
- 先搭第一眼要看到的：加载时只搭大门与回廊（分享链接则只搭对应房间），进园后趁访客没在滚动、拖动时，按沿回廊遇到月洞门的顺序在后台搭其余房间；访客走得比后台快时，在墨晕转场盖住画面的那一刻现搭。每个房间搭好后都预编译着色器、预先上传贴图，第一次进去不卡顿。
- 文字版：打包时把 content.ts 生成成纯 HTML 写进 index.html（含标题、描述、分享卡片、结构化数据），供搜索引擎收录；浏览器不支持 WebGL 或 3D 启动失败时，直接显示这份文字版。
- 文字类界面（信息卡等）放在 HTML 层，不经过水墨滤镜，所以始终清晰。
- 月洞门透景：每帧把门后房间按「透过窗户看」的视角渲染到门洞贴图（`Experience.renderPortals`），只渲染近处且在画面里的门，手机上降低透景分辨率和距离。
- 手机或小屏自动降画质：降低分辨率、关闭阴影和抗锯齿，支持触屏拖动。
- 书法字体（马善政楷书）随项目一起打包，不依赖 Google Fonts，国内可正常访问。打包和启动开发服务器时，`build/brushFont.ts` 会扫描源码里的字符串和模板文字，只保留用到的几百个字生成 `src/fonts/brush.woff2`（整套 2.7MB → 约 150KB），并在 index.html 里预加载。content.ts 里只用宋体显示的长文字（项目介绍、经历详情、自我介绍、联系方式的值等，见 `brushFont.ts` 的 `SERIF_FIELDS`）不收进字库，所以简历写得再长也不会让字库变大。改了 content.ts 不用管它，下次打包自动重新生成；开发时出现新字会自动补字并刷新页面。
- 加载流程不依赖画面刷新：标签页在后台或被挡住时也会继续加载，切回来就能进。

## 已知局限 / 下一步

- 模型都是程序生成的几何体，正式版可以替换成 Blender 精修模型或扫描模型。
- 服务器在首尔，国内访问速度一般；以后想要国内更快，可以换国内服务器（需要 ICP 备案）或加 CDN。
- 微信里分享链接不读网页的分享卡片（og 图片），想要自定义卡片需要已认证的公众号 + 微信 JS-SDK。QQ、X、Telegram、Slack 等会显示 og.png。

## 第三方代码

- `src/three/shanshui/shanshui-lib.js` 节选自 [shan-shui-inf](https://github.com/LingDong-/shan-shui-inf)，MIT License，Copyright (c) 2018 Lingdong Huang。许可证全文见同目录 `LICENSE-shan-shui-inf.txt`。
