import './style.css';
import { renderDice } from './pages/dice';
import { renderCanvas } from './pages/canvas';

type PageId = 'dice' | 'canvas';

const ICONS = {
  sigil: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2 21 8v8l-9 6-9-6V8l9-6Z"/><path d="M12 2v20M3 8l18 8M21 8 3 16" opacity=".45"/></svg>`,
  dice: `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4L12 2.5Z"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="6.4" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="17.6" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  map: `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 9.2h17M9.2 3.5v17" opacity=".5"/><circle cx="14.4" cy="14.4" r="2.4" fill="currentColor" stroke="none" opacity=".85"/></svg>`,
};

const PAGES: { id: PageId; label: string; icon: string; render: (root: HTMLElement) => () => void }[] = [
  { id: 'dice', label: 'Dice Lab', icon: ICONS.dice, render: renderDice },
  { id: 'canvas', label: 'Scene Canvas', icon: ICONS.map, render: renderCanvas },
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
  return location.hash.replace(/^#\/?/, '').startsWith('canvas') ? 'canvas' : 'dice';
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
