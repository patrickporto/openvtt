import hljs from 'highlight.js/lib/common';
import { marked } from 'marked';
import { hotkeys } from '../hotkeys';

type Doc = { id: string; title: string; body: string };
type TocItem = { slug: string; text: string; level: number };
type SearchHit = { doc: Doc; anchor: string | null; snippet: string };

const RAW_DOCS = import.meta.glob('@docs/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const GUIDES_ORDER = [
  'guides/getting-started',
  'guides/events-and-hooks',
  'guides/formulas',
  'guides/dice-rolling',
  'guides/notation-dialects',
  'guides/character-sheets',
  'guides/3d-dice',
  'guides/assets-and-rendering',
  'guides/publishing',
];

const API_ORDER = [
  'api/events',
  'api/formula',
  'api/hotkeys',
  'api/dice-core',
  'api/dice-notation',
  'api/dice-foundry-notation',
  'api/dice-roll20-notation',
  'api/sheet',
  'api/dice',
  'api/physics',
  'api/render3d',
  'api/assets',
  'api/rings',
];

let pendingAnchor: string | null = null;

function docIdFromKey(key: string): string {
  return key
    .replace(/^@docs\//, '')
    .replace(/^(.*\/)?docs\//, '')
    .replace(/\.md$/, '');
}

function docTitle(id: string, body: string): string {
  if (id === 'README') return 'Home';
  const h1 = body.match(/^#\s+(.+)$/m)?.[1] ?? '';
  const clean = h1.replace(/[*_`]/g, '').trim();
  return clean || (id.split('/').pop() ?? id).replace(/[-_]/g, ' ');
}

const DOCS: Doc[] = Object.entries(RAW_DOCS)
  .map(([key, body]) => {
    const id = docIdFromKey(key);
    return { id, title: docTitle(id, body), body };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

const BY_ID = new Map(DOCS.map((doc) => [doc.id, doc]));

function pickOrdered(order: string[], prefix: string): Doc[] {
  const known = new Set(order);
  return [
    ...order.flatMap((id) => {
      const doc = BY_ID.get(id);
      return doc ? [doc] : [];
    }),
    ...DOCS.filter((doc) => doc.id.startsWith(prefix) && !known.has(doc.id)),
  ];
}

function buildNav(): { label: string; items: Doc[] }[] {
  const sections = [
    { label: 'Overview', items: pickOrdered(['README'], 'README') },
    { label: 'Guides', items: pickOrdered(GUIDES_ORDER, 'guides/') },
    { label: 'API Reference', items: pickOrdered(API_ORDER, 'api/') },
    { label: 'Design Plans', items: DOCS.filter((doc) => doc.id.startsWith('plans/')) },
  ];
  return sections.filter((section) => section.items.length > 0);
}

function flatNav(): Doc[] {
  return buildNav().flatMap((section) => section.items);
}

function currentDocId(): string {
  const rest = location.hash.replace(/^#\/?docs\/?/, '');
  return BY_ID.has(rest) ? rest : 'README';
}

function resolveDocPath(base: string, path: string): string {
  const parts = (path.startsWith('/') ? path.slice(1) : `${base}/${path}`).split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return out.join('/').replace(/\.md$/, '');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function esc(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function markMatch(text: string, needle: string): string {
  if (!needle) return text;
  const pattern = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(pattern, 'gi'), (m) => `<mark>${m}</mark>`);
}

function headingBefore(body: string, index: number): string | null {
  let last: string | null = null;
  for (const match of body.matchAll(/^(#{2,3})\s+(.+)$/gm)) {
    if ((match.index ?? 0) >= index) break;
    last = slugify(match[2]);
  }
  return last;
}

function searchDocs(query: string): SearchHit[] {  const needle = query.toLowerCase();
  const hits: SearchHit[] = [];
  for (const doc of DOCS) {
    const bodyIdx = doc.body.toLowerCase().indexOf(needle);
    const inTitle = doc.title.toLowerCase().includes(needle);
    if (bodyIdx < 0 && !inTitle) continue;
    let snippet = '';
    if (bodyIdx >= 0) {
      const start = Math.max(0, doc.body.lastIndexOf('\n', Math.max(0, bodyIdx - 60)));
      snippet = doc.body
        .slice(start, start + 180)
        .replace(/[#*`|>_[\]()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    hits.push({ doc, anchor: bodyIdx >= 0 ? headingBefore(doc.body, bodyIdx) : null, snippet });
    if (hits.length >= 12) break;
  }
  return hits;
}

function footCard(target: Doc, dir: string, arrow: string): string {
  const chevron =
    arrow === 'left'
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>'
      : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>';
  return `
    <a class="docs-card" data-doc="${target.id}" href="#/docs/${target.id}">
      <span class="dir">${arrow === 'left' ? chevron : ''}${dir}${arrow === 'right' ? chevron : ''}</span>
      <b>${esc(target.title)}</b>
    </a>`;
}

export function renderDocs(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="docs-layout">
      <aside class="docs-nav panel">
        <div class="docs-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" placeholder="Search the wiki" spellcheck="false" autocomplete="off" />
          <kbd>/</kbd>
        </div>
        <div class="docs-nav-scroll">
          <nav class="docs-tree"></nav>
          <div class="docs-results" hidden></div>
        </div>
      </aside>
      <div class="docs-main">
        <div class="docs-top">
          <button class="icon-btn docs-menu" type="button" aria-label="Toggle wiki navigation">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <div class="docs-crumbs"></div>
        </div>
        <article class="docs-article"></article>
      </div>
      <aside class="docs-toc"></aside>
    </div>
  `;

  const navEl = root.querySelector<HTMLElement>('.docs-nav')!;
  const treeEl = root.querySelector<HTMLElement>('.docs-tree')!;
  const resultsEl = root.querySelector<HTMLElement>('.docs-results')!;
  const searchInput = root.querySelector<HTMLInputElement>('.docs-search input')!;
  const scrollerEl = root.querySelector<HTMLElement>('.docs-main')!;
  const crumbsEl = root.querySelector<HTMLElement>('.docs-crumbs')!;
  const articleEl = root.querySelector<HTMLElement>('.docs-article')!;
  const tocEl = root.querySelector<HTMLElement>('.docs-toc')!;
  const menuBtn = root.querySelector<HTMLButtonElement>('.docs-menu')!;

  function scrollToAnchor(anchor: string | null | undefined): void {
    if (!anchor) {
      scrollerEl.scrollTo({ top: 0 });
      return;
    }
    const target = articleEl.querySelector<HTMLElement>(`[data-slug="${CSS.escape(anchor)}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderTree(activeId: string): void {
    treeEl.innerHTML = buildNav()
      .map(
        (section) => `
        <div class="docs-group">${esc(section.label)}</div>
        ${section.items
          .map(
            (doc) => `
          <a class="docs-link${doc.id === activeId ? ' on' : ''}" href="#/docs/${doc.id}" data-doc="${doc.id}">
            ${esc(doc.title)}
          </a>`,
          )
          .join('')}`,
      )
      .join('');
  }

  function renderArticle(doc: Doc): void {
    articleEl.innerHTML = marked.parse(doc.body, { async: false, gfm: true });

    const used = new Set<string>();
    const toc: TocItem[] = [];
    for (const head of articleEl.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4')) {
      const text = (head.textContent ?? '').trim();
      let slug = slugify(text);
      let n = 2;
      while (used.has(slug)) slug = `${slugify(text)}-${n++}`;
      used.add(slug);
      head.dataset.slug = slug;
      if (head.tagName === 'H2' || head.tagName === 'H3') {
        toc.push({ slug, text, level: Number(head.tagName[1]) });
      }
    }

    for (const code of articleEl.querySelectorAll<HTMLElement>('pre code')) {
      hljs.highlightElement(code);
    }

    const base = doc.id.includes('/') ? doc.id.slice(0, doc.id.lastIndexOf('/')) : '';
    for (const link of articleEl.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const href = link.getAttribute('href') ?? '';
      if (/^(https?:)?\/\//.test(href) || href.startsWith('mailto:')) {
        link.target = '_blank';
        link.rel = 'noreferrer';
      } else if (/\.md($|#)/.test(href)) {
        const [path, anchor] = href.split('#');
        const target = resolveDocPath(base, path);
        if (BY_ID.has(target)) {
          link.href = `#/docs/${target}`;
          link.dataset.doc = target;
          if (anchor) link.dataset.anchor = slugify(anchor);
        } else {
          link.classList.add('dead');
        }
      } else if (href.startsWith('#') && href.length > 1) {
        link.dataset.anchor = slugify(href.slice(1));
      }
    }

    const flat = flatNav();
    const index = flat.findIndex((entry) => entry.id === doc.id);
    const prev = index > 0 ? flat[index - 1] : null;
    const next = index >= 0 && index < flat.length - 1 ? flat[index + 1] : null;
    const footer = document.createElement('footer');
    footer.className = 'docs-foot';
    footer.innerHTML = `
      ${prev ? footCard(prev, 'Previous', 'left') : '<span></span>'}
      ${next ? footCard(next, 'Next', 'right') : '<span></span>'}
    `;
    articleEl.appendChild(footer);

    tocEl.innerHTML = toc.length
      ? `
        <div class="docs-toc-title">On this page</div>
        <nav class="docs-toc-nav">
          ${toc
            .map(
              (item) => `
            <a href="#" data-anchor="${item.slug}" class="lvl${item.level}">${esc(item.text)}</a>`,
            )
            .join('')}
        </nav>`
      : '';
  }

  function renderCrumbs(doc: Doc): void {
    const section = doc.id.includes('/') ? doc.id.split('/')[0] : 'overview';
    crumbsEl.innerHTML = `
      <span>docs</span>
      <span class="sep">/</span>
      <span>${esc(section)}</span>
      <span class="sep">/</span>
      <b>${esc(doc.title)}</b>
    `;
  }

  function renderResults(query: string): void {
    const trimmed = query.trim();
    treeEl.hidden = trimmed !== '';
    resultsEl.hidden = trimmed === '';
    if (!trimmed) return;
    const hits = searchDocs(trimmed);
    resultsEl.innerHTML = hits.length
      ? hits
          .map(
            (hit) => `
          <a class="docs-hit" data-doc="${hit.doc.id}"${hit.anchor ? ` data-anchor="${hit.anchor}"` : ''} href="#/docs/${hit.doc.id}">
            <span class="docs-hit-title">${markMatch(esc(hit.doc.title), esc(trimmed))}</span>
            ${hit.snippet ? `<span class="docs-hit-snip">${markMatch(esc(hit.snippet), esc(trimmed))}</span>` : ''}
            <span class="docs-hit-path">${esc(hit.doc.id)}</span>
          </a>`,
          )
          .join('')
      : `<div class="docs-hit-empty">No results for “${esc(trimmed)}”</div>`;
  }

  let raf = 0;
  function spy(): void {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      let active = '';
      for (const head of articleEl.querySelectorAll<HTMLElement>('h2, h3')) {
        if (head.getBoundingClientRect().top <= 110) active = head.dataset.slug ?? '';
        else break;
      }
      for (const link of tocEl.querySelectorAll('a')) {
        link.classList.toggle('on', link.dataset.anchor === active);
      }
    });
  }

  function render(): void {
    const doc = BY_ID.get(currentDocId()) ?? DOCS[0];
    renderTree(doc.id);
    renderArticle(doc);
    renderCrumbs(doc);
    scrollerEl.scrollTop = 0;
    spy();
    if (pendingAnchor) {
      const anchor = pendingAnchor;
      pendingAnchor = null;
      requestAnimationFrame(() => scrollToAnchor(anchor));
    }
  }

  root.addEventListener('click', (event) => {
    const anchorEl = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-doc], a[data-anchor]');
    if (!anchorEl) return;
    const target = anchorEl.dataset.doc;
    if (target && target !== currentDocId()) {
      pendingAnchor = anchorEl.dataset.anchor ?? null;
      return;
    }
    event.preventDefault();
    navEl.classList.remove('open');
    scrollToAnchor(anchorEl.dataset.anchor);
  });

  menuBtn.addEventListener('click', () => navEl.classList.toggle('open'));

  searchInput.addEventListener('input', () => renderResults(searchInput.value));

  scrollerEl.addEventListener('scroll', spy, { passive: true });

  hotkeys.register('playground', 'docs:search', {
    name: 'Focus docs search',
    binds: ['Slash'],
    onDown: () => {
      searchInput.focus();
      return true;
    },
  });
  hotkeys.register('playground', 'docs:clear-search', {
    name: 'Clear docs search',
    binds: ['Escape'],
    allowInInputs: true,
    onDown: () => {
      if (document.activeElement !== searchInput) return;
      searchInput.value = '';
      renderResults('');
      searchInput.blur();
      return true;
    },
  });

  render();

  return () => {
    hotkeys.unregister('playground');
    if (raf) cancelAnimationFrame(raf);
  };
}
