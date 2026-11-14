// App couple (Couple Life Organiser) : les deux personnes et « qui fait quoi ».
// - Les prénoms et couleurs sont un réglage synchronisé (« couple »), communs aux deux.
// - « Qui utilise cet appareil » est retenu sur l'appareil (localStorage), pour « Mes missions ».
// - Une mission peut être pour l'une des deux personnes (t.who = 'a' ou 'b') ou pour les deux (vide).
// Dans Life Planner (APP.couple = false), rien de tout ça n'apparaît.

import { db } from './db.js';
import { APP } from './config.js';
import { esc } from './util.js';

export const ON = APP.couple;
const DEFAULT = { a: { name: '', color: '#7a1e2c' }, b: { name: '', color: '#c9a24a' } };
const ME = 'lp.me';
let cache = null;

export async function people() {
  const p = (await db.get('settings', 'couple')) || {};
  cache = { a: { ...DEFAULT.a, ...(p.a || {}) }, b: { ...DEFAULT.b, ...(p.b || {}) } };
  return cache;
}
export const peopleSync = () => cache || DEFAULT; // pour les rendus synchrones (après un premier people())
export const savePeople = async (p) => { await db.put('settings', p, 'couple'); cache = p; };
export const me = () => { try { const v = localStorage.getItem(ME); return v === 'a' || v === 'b' ? v : ''; } catch { return ''; } };
export const setMe = (v) => { try { localStorage.setItem(ME, v); } catch { /* ignore */ } };
export const nameOf = (k) => (k === 'a' || k === 'b' ? peopleSync()[k].name || (k === 'a' ? 'Personne 1' : 'Personne 2') : 'Les deux');
const initial = (k) => (nameOf(k).trim()[0] || '?').toUpperCase();

/** Pastille « pour qui » d'une mission (rien pour une mission commune). */
export function whoChip(t) {
  if (!ON || (t.who !== 'a' && t.who !== 'b')) return '';
  const p = peopleSync()[t.who];
  return `<span class="chip who-chip" style="--wc:${esc(p.color)}" title="Pour ${esc(nameOf(t.who))}"><i>${esc(initial(t.who))}</i>${esc(nameOf(t.who))}</span>`;
}

/** Options du choix « Pour » (fenêtre d'une mission, ajout rapide). */
export const whoOptions = (cur = '') => `<option value="" ${!cur ? 'selected' : ''}>👫 Les deux</option>`
  + ['a', 'b'].map((k) => `<option value="${k}" ${cur === k ? 'selected' : ''}>👤 ${esc(nameOf(k))}${k === me() ? ' (moi)' : ''}</option>`).join('');

/** Est-ce une mission pour moi (à moi, ou commune) ? */
export const isMine = (t) => !t.who || t.who === me();

/**
 * Premier lancement de l'app couple : prénoms des deux et « qui es-tu sur cet appareil ».
 * Aussi ouvert depuis Réglages (force = true).
 */
export async function setup(modal, { force = false, onDone = () => {} } = {}) {
  if (!ON) return;
  const p = await people();
  if (!force && p.a.name && p.b.name && me()) return;
  modal(`<h2>👫 Vous deux</h2>
    <p class="muted" style="margin-top:-6px">Vos prénoms servent à assigner les missions (à toi, à l’autre ou aux deux).</p>
    <form id="cp-form" class="cp-form">
      <label>Premier prénom<input name="a" value="${esc(p.a.name)}" required maxlength="20" autocomplete="off"></label>
      <label>Deuxième prénom<input name="b" value="${esc(p.b.name)}" required maxlength="20" autocomplete="off"></label>
      <fieldset><legend>Qui utilise cet appareil ?</legend>
        <label class="check"><input type="radio" name="me" value="a" ${me() === 'a' ? 'checked' : ''} required> <span data-n="a">${esc(p.a.name || 'Premier prénom')}</span></label>
        <label class="check"><input type="radio" name="me" value="b" ${me() === 'b' ? 'checked' : ''}> <span data-n="b">${esc(p.b.name || 'Deuxième prénom')}</span></label>
      </fieldset>
      <div class="modal-actions"><button class="btn primary">Enregistrer</button></div>
    </form>`, (m, close) => {
    const f = m.querySelector('#cp-form');
    ['a', 'b'].forEach((k) => f[k].addEventListener('input', () => { m.querySelector(`[data-n="${k}"]`).textContent = f[k].value.trim() || (k === 'a' ? 'Premier prénom' : 'Deuxième prénom'); }));
    f.onsubmit = async (e) => {
      e.preventDefault();
      await savePeople({ a: { ...p.a, name: f.a.value.trim() }, b: { ...p.b, name: f.b.value.trim() } });
      setMe(f.me.value);
      close();
      onDone();
    };
  });
}
