// ☀️ Résumé du matin : une seule notification par jour (entre 5 h et 11 h), au lieu de plusieurs alertes séparées.
// Missions du jour et en retard, habitudes prévues, paiements des 3 prochains jours.
// « digestDay » est synchronisé : le résumé n'arrive que sur le premier appareil ouvert le matin.
import { db } from './db.js';
import * as U from './util.js';
import * as habits from './habits.js';
import { notifyText } from './alarms.js';

const KEY = 'digestDay';
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

/** Ce que contient le résumé d'aujourd'hui (aussi utile pour l'afficher ailleurs). */
export async function summary(now = new Date()) {
  const today = U.iso(now), in3 = U.iso(U.addDays(now, 3));
  const tasks = (await db.all('tasks')).filter((t) => !t.done && t.date);
  const todayT = tasks.filter((t) => t.date === today);
  const late = tasks.filter((t) => t.date < today);
  const hs = (await habits.list()).filter((h) => habits.isDue(h, now) && !habits.doneOn(h, today));
  const pays = ((await db.get('settings', 'upcoming')) || []).filter((x) => !x.del && x.date >= today && x.date <= in3);
  const lines = [];
  if (todayT.length) lines.push(`✅ ${plural(todayT.length, 'mission', 'missions')} : ${todayT.slice(0, 3).map((t) => t.title).join(', ')}${todayT.length > 3 ? '…' : ''}`);
  if (late.length) lines.push(`⚠ ${plural(late.length, 'mission en retard', 'missions en retard')}`);
  if (hs.length) lines.push(`🔁 ${plural(hs.length, 'habitude', 'habitudes')} : ${hs.slice(0, 3).map((h) => h.name).join(', ')}${hs.length > 3 ? '…' : ''}`);
  if (pays.length) lines.push(`💸 ${pays.map((x) => `${x.name}${Number(x.amount) ? ` ${Number(x.amount).toFixed(2).replace('.', ',')} $` : ''} (${x.date === today ? 'aujourd’hui' : U.fmtShort(U.parseISO(x.date))})`).join(', ')}`);
  return { lines, empty: !lines.length };
}

/** Envoie le résumé si c'est le matin et qu'il n'a pas encore été donné aujourd'hui (sur aucun appareil). */
export async function morning(now = new Date()) {
  const h = now.getHours();
  if (h < 5 || h >= 11) return false;
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const today = U.iso(now);
  if ((await db.get('settings', KEY).catch(() => null)) === today) return false;
  await db.put('settings', today, KEY);
  const s = await summary(now);
  await notifyText('☀️ Ta journée', s.empty ? 'Rien de prévu : journée libre ! Touche pour planifier.' : s.lines.join('\n'), 'lp-digest');
  return true;
}

/** À l'ouverture (après la synchro) et à chaque retour dans l'app. */
export function start() {
  const go = () => { if (document.visibilityState === 'visible') morning().catch(() => {}); };
  go();
  document.addEventListener('visibilitychange', go);
}
