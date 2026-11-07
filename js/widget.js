// Widget de bureau : héros + missions du jour (+ en retard, + demain), synchronisé en direct avec l'app.
import { db, onDbChange } from './db.js';
import * as U from './util.js';
import * as game from './game.js';
import { avatarSVG, DEFAULT_AVATAR } from './avatar.js';
import { taskHTML, bindTaskList, addTask, loadGoals } from './tasks.js';
import * as alarms from './alarms.js';
import * as timer from './timer.js';

const { esc, iso } = U;
const $ = (s) => document.querySelector(s);

try {
  const t = localStorage.getItem('lp.theme');
  if (t) document.documentElement.dataset.theme = t;
} catch { /* ignore */ }

const sortTasks = (a, b) => a.done - b.done || (a.date || '').localeCompare(b.date || '') || a.createdAt - b.createdAt;

function pop(amount, reason) {
  if (!amount) return;
  const el = document.createElement('div');
  el.className = 'xp-pop' + (amount < 0 ? ' neg' : '');
  el.innerHTML = `<b>${amount > 0 ? '+' : '−'}${Math.abs(amount)} XP</b><small>${esc(reason || '')}</small>`;
  $('#xp-pops').appendChild(el);
  setTimeout(() => el.classList.add('out'), 2000);
  setTimeout(() => el.remove(), 2500);
}
game.setUI({
  pop,
  levelUp: (lvl) => toastBig(`🎉 Niveau ${lvl} !`),
  badge: (b) => toastBig(`${b.icon} ${b.name}`),
  evolve: (stage) => toastBig(`${game.EVO[stage].icon} Évolution : ${game.EVO[stage].name}`),
  changed: drawHero,
});
function toastBig(msg) {
  const el = document.createElement('div');
  el.className = 'xp-pop';
  el.innerHTML = `<b>${esc(msg)}</b>`;
  $('#xp-pops').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3500);
  setTimeout(() => el.remove(), 4000);
}

async function drawHero() {
  const [s, av] = await Promise.all([game.stats(), db.get('settings', 'avatar')]);
  $('#avatar').innerHTML = avatarSVG({ ...DEFAULT_AVATAR, ...(av || {}), evo: s.evo }, 42);
  $('#lvl').textContent = `Niv. ${s.level}`;
  $('#streak').textContent = s.streak ? `🔥 ${s.streak}` : '';
  $('#xpbar').style.width = s.pct + '%';
  $('#xptext').textContent = `${s.into}/${s.need} XP`;
}

async function draw(remote = false) {
  const now = new Date();
  const today = iso(now);
  const tomorrow = iso(U.addDays(now, 1));
  await loadGoals();
  const all = await db.all('tasks');
  const todayItems = all.filter((t) => t.date === today || (!t.done && t.date && t.date < today)).sort(sortTasks);
  const tomorrowItems = all.filter((t) => t.date === tomorrow && !t.done).sort(sortTasks);

  const done = todayItems.filter((t) => t.done).length;
  $('#date').textContent = U.cap(U.fmtLong(now));
  $('#count').textContent = `${done}/${todayItems.length} accomplies aujourd’hui`;

  // Ne pas reconstruire la liste pendant qu'on écrit dans une note ou une étape
  const active = document.activeElement;
  if (remote && active && $('#list').contains(active) && active.matches('textarea, select, input[type="text"], input[type="date"], input:not([type])')) return;

  const allDone = todayItems.length && done === todayItems.length;
  $('#list').innerHTML = `
    <h2>Aujourd’hui</h2>
    ${allDone ? '<p class="done-msg">🎉 Tout est fait pour aujourd’hui !</p>' : ''}
    <ul class="tasks">${todayItems.map((t) => taskHTML(t, today)).join('') || '<li class="empty-sm">Aucune mission pour aujourd’hui.</li>'}</ul>
    ${tomorrowItems.length ? `<h2>Demain</h2><ul class="tasks">${tomorrowItems.map((t) => taskHTML(t, today)).join('')}</ul>` : ''}`;
  bindTaskList($('#list'), draw);
}

$('#add').onsubmit = async (e) => {
  e.preventDefault();
  const v = e.target.t.value.trim();
  if (!v) return;
  await addTask(v, iso(new Date()));
  e.target.t.value = '';
  draw();
};

// Mise à jour en direct quand l'app change quelque chose, au retour sur la fenêtre, et chaque minute.
onDbChange(({ store }) => {
  if (store === 'tasks') draw(true);
  if (store === 'xp' || store === 'settings') drawHero();
});
window.addEventListener('focus', () => { draw(true); drawHero(); });
setInterval(() => { draw(true); drawHero(); }, 60_000);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
game.init().catch(() => {}).finally(() => { draw(); drawHero(); alarms.start(() => draw()); timer.mount(); });
