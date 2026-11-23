// ⭐🔥 Missions en vedette : les missions prioritaires ou urgentes (pas encore faites) en haut de toutes les pages.
// Une barre compacte : cocher = mission faite, clic sur le titre = l'ouvrir. Repliable (gardé sur cet appareil).
import { db } from './db.js';
import * as U from './util.js';
import { prioRank, setTaskDone, openTaskEditor } from './tasks.js';

const { esc } = U;
const FOLD = 'lp.prioFold';
const HIDE_ON = new Set(['page', 'setup', 'launcher']); // carnet manuscrit, configuration, lanceur
let html = '', observer = null, busy = false;

const route = () => (location.hash.replace(/^#\/?/, '') || 'today').split('/')[0];
const folded = () => { try { return localStorage.getItem(FOLD) === '1'; } catch { return false; } };

async function build() {
  const today = U.iso(new Date());
  const list = (await db.all('tasks')).filter((t) => !t.done && (t.prio || t.urgent))
    .sort((a, b) => prioRank(b) - prioRank(a) || (a.date || '9999').localeCompare(b.date || '9999') || (a.order ?? 1e15) - (b.order ?? 1e15));
  if (!list.length) return '';
  const f = folded();
  const when = (t) => (!t.date ? '' : t.date < today ? `<small class="pb-late">⚠ ${esc(U.fmtShort(U.parseISO(t.date)))}</small>` : t.date === today ? '<small>aujourd’hui</small>' : `<small>${esc(U.fmtShort(U.parseISO(t.date)))}</small>`);
  return `<section class="prio-bar ${f ? 'folded' : ''}" id="prio-bar" aria-label="Missions prioritaires et urgentes">
    <button type="button" class="pb-head" data-pb-fold aria-expanded="${!f}"><b>🔥 En priorité</b><span class="pb-n">${list.length}</span><span class="pb-caret" aria-hidden="true">▾</span></button>
    <ul class="pb-list">${list.map((t) => `<li class="${t.urgent ? 'urgent' : 'prio'}"><input type="checkbox" data-pb-done="${t.id}" aria-label="Mission faite : ${esc(t.title)}">
      <button type="button" class="pb-title" data-pb-open="${t.id}" title="Ouvrir la mission">${t.urgent ? '🔥' : ''}${t.prio ? '⭐' : ''} ${esc(t.title)}</button>${when(t)}</li>`).join('')}</ul>
  </section>`;
}

function mount() {
  const view = document.getElementById('view');
  if (!view) return;
  const old = document.getElementById('prio-bar');
  if (!html || HIDE_ON.has(route())) { old?.remove(); return; }
  if (old && old.parentElement === view && view.firstElementChild === old && old.dataset.h === String(html.length)) return;
  old?.remove();
  view.insertAdjacentHTML('afterbegin', html);
  const bar = document.getElementById('prio-bar');
  bar.dataset.h = String(html.length);
  bar.querySelector('[data-pb-fold]').onclick = () => {
    const f = !folded();
    try { localStorage.setItem(FOLD, f ? '1' : '0'); } catch { /* ignore */ }
    bar.classList.toggle('folded', f);
    bar.querySelector('[data-pb-fold]').setAttribute('aria-expanded', String(!f));
  };
  bar.querySelectorAll('[data-pb-done]').forEach((cb) => (cb.onchange = async () => {
    await setTaskDone(cb.dataset.pbDone, true);
    window.dispatchEvent(new HashChangeEvent('hashchange')); // la page se redessine (et la barre avec)
  }));
  bar.querySelectorAll('[data-pb-open]').forEach((b) => (b.onclick = () => openTaskEditor(b.dataset.pbOpen, () => refresh())));
}

/** Relit les missions et remet la barre en haut de la page affichée. */
export async function refresh() {
  if (busy) return;
  busy = true;
  try { html = await build(); } finally { busy = false; }
  mount();
}

export function start() {
  const view = document.getElementById('view');
  if (!view || observer) return;
  // Chaque fois qu'une page se dessine (elle remplace le contenu), la barre revient en haut, à jour
  observer = new MutationObserver(() => { if (!document.getElementById('prio-bar') || view.firstElementChild?.id !== 'prio-bar') refresh(); });
  observer.observe(view, { childList: true });
  addEventListener('hashchange', () => setTimeout(refresh, 50));
  addEventListener('focus', refresh);
  setInterval(() => { if (!document.hidden) refresh(); }, 10000); // une mission marquée ailleurs apparaît vite
  refresh();
}
