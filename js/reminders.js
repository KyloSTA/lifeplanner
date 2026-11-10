// Rappels fiables : chaque alarme de mission et chaque rappel d'habitude est aussi créé dans ton
// Google Agenda (avec une notification à l'heure). Ton cellulaire et ta montre sonnent donc même
// quand Life Planner est fermé.
// - Mission avec alarme  -> un événement « ⏰ … » à l'heure de l'alarme (supprimé quand la mission est
//   faite, l'alarme retirée ou passée).
// - Habitude avec heures -> un événement récurrent « 🔁 … » par heure, les jours choisis.
// Chaque événement porte une clé privée (lpkey) : l'app le retrouve et ne crée jamais de doublon,
// même avec plusieurs appareils. La table clé -> événement est gardée dans les réglages (« remMap »).

import { db } from './db.js';
import * as gcal from './gcal.js';
import * as U from './util.js';

const CAL = 'primary';
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const enc = encodeURIComponent;

export const isOn = async () => !!(await db.get('settings', 'gcalReminders'));
export async function setOn(on) {
  await db.put('settings', !!on, 'gcalReminders');
  if (on) await reconcile(true);
  else await removeAll();
}

let status = { last: 0, count: 0, error: '' };
export const getStatus = () => status;

const local = (ms) => { const d = new Date(ms); return `${U.iso(d)}T${U.pad(d.getHours())}:${U.pad(d.getMinutes())}:00`; };

/** Ce qui devrait exister dans l'agenda : Map clé -> { sig, body } */
async function desired() {
  const want = new Map();
  const now = Date.now();
  for (const t of await db.all('tasks')) {
    if (t.done || !t.alarmAt || t.alarmAt < now - 60 * 60_000) continue;
    const key = 'task:' + t.id;
    want.set(key, {
      sig: `${t.alarmAt}|${t.title}`,
      body: {
        summary: `⏰ ${t.title}`,
        description: 'Alarme d’une mission de Life Planner.',
        start: { dateTime: local(t.alarmAt), timeZone: tz() },
        end: { dateTime: local(t.alarmAt + 5 * 60_000), timeZone: tz() },
      },
    });
  }
  const today = U.iso(new Date());
  for (const h of await db.all('habits')) {
    if (h.archived || !(h.days || []).length) continue;
    for (const time of h.times || []) {
      const key = `habit:${h.id}:${time}`;
      const [hh, mm] = time.split(':').map(Number);
      const s = U.parseISO(today); s.setHours(hh, mm, 0, 0);
      want.set(key, {
        sig: `${h.emoji}|${h.name}|${[...h.days].sort().join(',')}|${time}`,
        body: {
          summary: `🔁 ${h.emoji} ${h.name}`,
          description: 'Rappel d’une habitude de Life Planner.',
          start: { dateTime: `${today}T${time}:00`, timeZone: tz() },
          end: { dateTime: local(+s + 5 * 60_000), timeZone: tz() }, // (passe au lendemain si l'heure est 23 h 55 ou plus)
          recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${[...h.days].sort().map((d) => BYDAY[d]).join(',')}`],
        },
      });
    }
  }
  return want;
}

const decorate = (key, body) => ({
  ...body,
  reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] }, // notification à l'heure exacte
  transparency: 'transparent', // n'occupe pas ton horaire (pas « occupé »)
  extendedProperties: { private: { lpkey: key } },
});

async function findByKey(key) {
  const d = await gcal.calApi(`/calendars/${CAL}/events?privateExtendedProperty=${enc('lpkey=' + key)}&maxResults=5`);
  return (d.items || []).find((e) => e.status !== 'cancelled') || null;
}
async function remove(eid) {
  try { await gcal.calApi(`/calendars/${CAL}/events/${enc(eid)}`, { method: 'DELETE' }); }
  catch (e) { if (!/not found|deleted|410|404/i.test(e.message)) throw e; } // déjà supprimé : rien à faire
}

let running = null;
/** Met l'agenda à jour (seulement ce qui a changé). force : vérifie même sans changement local. */
export function reconcile(force = false) {
  if (running) return running;
  const go = async () => {
    if (!(await isOn()) || !gcal.isConnected()) return;
    const map = (await db.get('settings', 'remMap')) || {};
    const want = await desired();
    let changed = false;
    try {
      for (const [key, w] of want) {
        const cur = map[key];
        if (!force && cur?.sig === w.sig) continue;
        const body = decorate(key, w.body);
        let eid = cur?.eid;
        if (!eid) eid = (await findByKey(key))?.id; // créé ailleurs (autre appareil) : on le reprend
        if (eid) {
          try { await gcal.calApi(`/calendars/${CAL}/events/${enc(eid)}`, { method: 'PUT', body: JSON.stringify(body) }); }
          catch { eid = null; } // supprimé dans Google Agenda : on le recrée
        }
        if (!eid) eid = (await gcal.calApi(`/calendars/${CAL}/events`, { method: 'POST', body: JSON.stringify(body) })).id;
        map[key] = { eid, sig: w.sig };
        changed = true;
      }
      for (const key of Object.keys(map)) {
        if (want.has(key)) continue;
        await remove(map[key].eid);
        delete map[key];
        changed = true;
      }
      status = { last: Date.now(), count: want.size, error: '' };
    } catch (e) {
      status = { ...status, error: e.message === 'NOT_CONNECTED' ? 'Connexion Google expirée' : e.message };
    }
    if (changed) await db.put('settings', map, 'remMap');
  };
  const p = navigator.locks ? navigator.locks.request('lp-reminders', { ifAvailable: true }, (l) => (l ? go() : null)) : go();
  running = p.finally(() => { running = null; });
  return running;
}

/** Désactivation : retire tous les rappels créés par Life Planner. */
async function removeAll() {
  if (!gcal.isConnected()) return;
  const map = (await db.get('settings', 'remMap')) || {};
  for (const key of Object.keys(map)) { try { await remove(map[key].eid); } catch { /* ignore */ } }
  await db.put('settings', {}, 'remMap');
  status = { last: Date.now(), count: 0, error: '' };
}

/** Vérifie toutes les 45 s (seulement des lectures locales ; l'agenda n'est appelé que s'il y a un changement). */
export function start() {
  setTimeout(() => reconcile(), 3000);
  setInterval(() => reconcile(), 45_000);
  addEventListener('lp-google', () => reconcile(true));
  addEventListener('focus', () => reconcile());
}
