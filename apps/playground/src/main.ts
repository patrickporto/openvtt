import './style.css';
import { renderDice } from './pages/dice';
import { renderCanvas } from './pages/canvas';
import { renderNotation } from './pages/notation';
import { renderSheet } from './pages/sheet';

type PageId = 'dice' | 'canvas' | 'notation' | 'sheet';

const ICONS = {
  sigil: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2 21 8v8l-9 6-9-6V8l9-6Z"/><path d="M12 2v20M3 8l18 8M21 8 3 16" opacity=".45"/></svg>`,
  dice: `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4L12 2.5Z"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="6.4" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="17.6" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  map: `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 9.2h17M9.2 3.5v17" opacity=".5"/><circle cx="14.4" cy="14.4" r="2.4" fill="currentColor" stroke="none" opacity=".85"/></svg>`,
  notation: `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m5 7 4 5-4 5M11 17h8"/><path d="M13 7h6" opacity=".55"/></svg>`,
  sheet: `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="3" width="15" height="18" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4" opacity=".6"/></svg>`,
};

const PAGES: { id: PageId; label: string; icon: string; render: (root: HTMLElement) => () => void }[] = [
  { id: 'dice', label: 'Dice Lab', icon: ICONS.dice, render: renderDice },
  { id: 'canvas', label: 'Scene Canvas', icon: ICONS.map, render: renderCanvas },
  { id: 'notation', label: 'Notation Lab', icon: ICONS.notation, render: renderNotation },
  { id: 'sheet', label: 'Sheet Lab', icon: ICONS.sheet, render: renderSheet },
];

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <aside class="rail">
    <div class="rail-brand" title="openvtt">${ICONS.sigil}</div>
    <nav class="rail-nav">
      ${PAGES.map(
        (p) => `
        <a class="rail-link" href="#/${p.id}" data-page="${p.id}">
          ${p.icon}
          <span class="tip">${p.label}</span>
        </a>`,
      ).join('')}
    </nav>
    <span class="rail-foot">OPENVTT · PLAYGROUND</span>
  </aside>
  <div id="page"></div>
  <div class="grain"></div>
`;

const pageEl = app.querySelector<HTMLDivElement>('#page')!;

let cleanup: (() => void) | null = null;

function currentPage(): PageId {
  const hash = location.hash.replace(/^#\/?/, '');
  return PAGES.some((p) => p.id === hash) ? (hash as PageId) : 'dice';
}

function syncNav(active: PageId): void {
  for (const link of app.querySelectorAll<HTMLAnchorElement>('.rail-link')) {
    link.classList.toggle('active', link.dataset.page === active);
  }
}

function render(): void {
  const id = currentPage();
  syncNav(id);
  cleanup?.();
  cleanup = null;
  pageEl.innerHTML = '';
  const page = PAGES.find((p) => p.id === id)!;
  cleanup = page.render(pageEl);
}

window.addEventListener('hashchange', render);
render();
