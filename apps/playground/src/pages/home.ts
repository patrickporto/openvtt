type HomeCard = { href: string; icon: string; title: string; desc: string; tag: string };

const ICONS = {
  dice: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4L12 2.5Z"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="6.4" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="17.6" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  map: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 9.2h17M9.2 3.5v17" opacity=".5"/><circle cx="14.4" cy="14.4" r="2.4" fill="currentColor" stroke="none" opacity=".85"/></svg>`,
  notation: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m5 7 4 5-4 5M11 17h8"/><path d="M13 7h6" opacity=".55"/></svg>`,
  sheet: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="3" width="15" height="18" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4" opacity=".6"/></svg>`,
  book: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>`,
};

const CARDS: HomeCard[] = [
  {
    href: '#/dice',
    icon: ICONS.dice,
    title: 'Dice Lab',
    desc: '3D physics dice — themes, HDR environments, shadows and post-processing.',
    tag: 'lab',
  },
  {
    href: '#/canvas',
    icon: ICONS.map,
    title: 'Scene Canvas',
    desc: 'Tokens, walls, fog, lighting, measures and templates — the full canvas suite.',
    tag: 'lab',
  },
  {
    href: '#/notation',
    icon: ICONS.notation,
    title: 'Notation Lab',
    desc: 'Parse, inspect and roll canonical, Foundry and Roll20 dialects side by side.',
    tag: 'lab',
  },
  {
    href: '#/sheet',
    icon: ICONS.sheet,
    title: 'Sheet Lab',
    desc: 'Documents, effects, durations, triggers and the compute pipeline, live.',
    tag: 'lab',
  },
  {
    href: '#/docs',
    icon: ICONS.book,
    title: 'Wiki & Docs',
    desc: 'Guides, API reference and design plans — searchable, right here.',
    tag: 'docs',
  },
];

const STATS: { value: string; label: string }[] = [
  { value: '33', label: 'packages' },
  { value: '9', label: 'guides' },
  { value: '13', label: 'api refs' },
  { value: 'v7', label: 'uuid ids' },
];

export function renderHome(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="home-stage">
      <div class="home-hero">
        <div class="home-kicker">openvtt · playground</div>
        <h1>Forge your <em>table</em>.</h1>
        <p>
          Open, composable building blocks for virtual tabletops — a typed event bus, dice IR and
          notation dialects, character sheets, a complete canvas plugin suite and a 3D physics dice
          roller. Every page on this site runs the real packages, live.
        </p>
        <div class="home-cta">
          <a class="btn" href="#/dice">Roll the dice</a>
          <a class="btn ghost" href="#/docs">Read the wiki</a>
        </div>
        <div class="home-stats">
          ${STATS.map(
            (stat) => `
            <div class="home-stat">
              <b>${stat.value}</b>
              <span>${stat.label}</span>
            </div>`,
          ).join('')}
        </div>
      </div>
      <div class="home-grid">
        ${CARDS.map(
          (card) => `
          <a class="home-card" href="${card.href}">
            <span class="home-card-top">
              <span class="home-card-icon">${card.icon}</span>
              <span class="home-card-tag">${card.tag}</span>
            </span>
            <b>${card.title}</b>
            <p>${card.desc}</p>
          </a>`,
        ).join('')}
      </div>
      <footer class="home-foot">
        pure ESM · bun · turborepo &nbsp;—&nbsp; <span>bun run dev --filter=playground</span>
      </footer>
    </div>
  `;

  return () => {};
}
