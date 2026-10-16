/**
 * 文字版（借鉴 portfolio-itom 的 SEO fallback）：打包时由 vite.config.ts 调用，
 * 根据 content.ts 生成纯 HTML，注入 index.html。
 * - 搜索引擎、社交平台的分享卡片读这份文字；
 * - 不支持 WebGL / 禁用 JS 的访客直接看到这份文字版；
 * - 正常浏览时视觉上隐藏，但仍留在页面里供读屏软件使用。
 */
import { about, contacts, projects, rooms, site, socials } from './content';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const pageTitle = `${site.name} · ${site.role}｜${site.title}`;

export function seoHead() {
  const person = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: site.name,
    jobTitle: site.role,
    description: site.description,
    knowsAbout: about.skills,
    sameAs: [...socials.map((s) => s.href), ...contacts.filter((c) => c.action === 'link' && c.href?.startsWith('http')).map((c) => c.href!)],
  };
  return `
    <script>document.documentElement.classList.add('js')</script>
    <meta name="description" content="${esc(site.description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(pageTitle)}" />
    <meta property="og:description" content="${esc(site.description)}" />
    <script type="application/ld+json">${JSON.stringify(person).replace(/</g, '\\u003c')}</script>
    <style>
      .seo { max-width: 720px; margin: 0 auto; padding: 40px 20px 80px; background: #ece6d8; color: #222; font-family: 'Songti SC', 'STSong', 'SimSun', serif; line-height: 1.85; }
      .seo h1 { font-size: 40px; margin: 0 0 4px; letter-spacing: .1em; }
      .seo h2 { margin: 40px 0 8px; font-size: 22px; border-bottom: 1px solid #c9c2b4; }
      .seo h3 { margin: 18px 0 2px; font-size: 18px; }
      .seo a { color: #b8281d; }
      .seo .note { display: none; padding: 10px 14px; background: #f4efe2; border-left: 3px solid #b8281d; }
      .nogl .seo .note { display: block; }
      /* 正常浏览（3D 可用）时视觉隐藏，仍保留给读屏软件与爬虫 */
      .js:not(.nogl) .seo { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
    </style>`;
}

export function seoBody() {
  const list = (items: string[]) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
  const link = (href: string, text: string) => `<a href="${esc(href)}"${href.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${esc(text)}</a>`;
  return `
  <main id="seo" class="seo" aria-label="${esc(site.name)}的作品集（文字版）">
    <p class="note">你的浏览器暂时无法显示 3D 水墨园林，下面是文字版内容。</p>
    <h1>${esc(site.name)}</h1>
    <p>${esc(site.role)} · ${esc(site.description)}</p>

    <h2>${esc(rooms.gallery.gate)}</h2>
    ${projects
      .map(
        (p) => `<article>
      <h3>${esc(p.title)}（${esc(p.year)}）</h3>
      ${p.description.map((d) => `<p>${esc(d)}</p>`).join('')}
      <p>技术栈：${p.tags.map(esc).join(' / ')}</p>
      ${p.link ? `<p>${link(p.link, '打开项目')}</p>` : ''}
    </article>`,
      )
      .join('')}

    <h2>${esc(rooms.about.gate)}</h2>
    ${about.bio.map((b) => `<p>${esc(b)}</p>`).join('')}
    <h3>经历</h3>
    ${list(about.experiences.map((x) => `${esc(x.period)}　${esc(x.title)} · ${esc(x.place)}：${esc(x.detail)}`))}
    <h3>技能</h3>
    <p>${about.skills.map(esc).join('、')}</p>

    <h2>${esc(rooms.contact.gate)}</h2>
    ${list(contacts.map((c) => `${esc(c.label)}：${c.href ? link(c.href, c.value) : esc(c.value)}　${esc(c.note)}`))}

    <h2>${esc(rooms.social.gate)}</h2>
    ${list(socials.map((s) => `${link(s.href, s.platform)}　${esc(s.handle)}：${esc(s.description)}`))}
  </main>`;
}

export { pageTitle };
