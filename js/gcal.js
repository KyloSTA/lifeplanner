// Synchronisation Google Agenda (Google Identity Services + Calendar API v3).
// La connexion se fait directement depuis le navigateur : aucun serveur tiers.

import { db } from './db.js';
import { iso, parseISO, addDays } from './util.js';

const API = 'https://www.googleapis.com/calendar/v3';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'; // dossier caché propre à l'app (synchro)
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  DRIVE_SCOPE,
].join(' ');
const TOKEN_KEY = 'lp.gtoken';

let tok = null;
try { tok = JSON.parse(localStorage.getItem(TOKEN_KEY)); } catch { tok = null; }

export const isConnected = () => !!(tok && tok.exp > Date.now() + 30_000);

let gisPromise = null;
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisPromise = null; s.remove(); reject(new Error('Impossible de joindre Google (hors ligne ?)')); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

/** Précharge la librairie Google pour que la fenêtre de connexion s'ouvre sans délai. */
export async function preload() {
  if (await db.get('settings', 'clientId')) loadGis().catch(() => {});
}

export const hasScope = (s) => !!(tok?.scope || '').split(' ').includes(s);
export const token = () => (isConnected() ? tok.t : null);

/**
 * Ouvre la fenêtre de connexion Google (à appeler depuis un clic).
 * silent = true : reconnexion discrète (pas d'écran de consentement si déjà accordé).
 */
export async function connect({ silent = false } = {}) {
  const clientId = await db.get('settings', 'clientId');
  if (!clientId) throw new Error('NO_CLIENT_ID');
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (r) => {
        if (r.error) return reject(new Error(r.error_description || r.error));
        tok = { t: r.access_token, exp: Date.now() + (Number(r.expires_in) - 60) * 1000, scope: r.scope || SCOPES };
        try { localStorage.setItem(TOKEN_KEY, JSON.stringify(tok)); } catch { /* stockage indisponible */ }
        window.dispatchEvent(new Event('lp-google'));
        resolve();
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Connexion annulée' : e.message || e.type)),
    });
    client.requestAccessToken(silent ? { prompt: '' } : undefined);
  });
}

/** Oublie un jeton refusé par Google (expiré ou révoqué). */
export function forget() {
  tok = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export async function disconnect() {
  if (tok && window.google?.accounts?.oauth2) {
    try { google.accounts.oauth2.revoke(tok.t, () => {}); } catch { /* ignore */ }
  }
  tok = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

async function api(path, opts = {}) {
  if (!isConnected()) throw new Error('NOT_CONNECTED');
  const r = await fetch(API + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + tok.t, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (r.status === 401) {
    tok = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    throw new Error('NOT_CONNECTED');
  }
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).error.message; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return r.status === 204 ? null : r.json();
}

/* ---------- Agendas ---------- */
export async function listCalendars() {
  const d = await api('/users/me/calendarList?minAccessRole=reader');
  return (d.items || []).map((c) => ({
    id: c.id,
    name: c.summaryOverride || c.summary,
    color: c.backgroundColor || '#4f46e5',
    primary: !!c.primary,
    writable: c.accessRole === 'owner' || c.accessRole === 'writer',
  }));
}

export async function selectedCalendars() {
  return (await db.get('settings', 'calendars')) || [{ id: 'primary', name: 'Principal', color: '#4f46e5', writable: true }];
}

/* ---------- Événements ---------- */
function normalize(e, cal) {
  const allDay = !!e.start.date;
  const start = allDay ? parseISO(e.start.date) : new Date(e.start.dateTime);
  const end = allDay ? parseISO(e.end.date) : new Date(e.end.dateTime);
  return {
    id: cal.id + '|' + e.id,
    gid: e.id,
    calId: cal.id,
    calName: cal.name,
    title: e.summary || '(Sans titre)',
    start: +start,
    end: +end,
    allDay,
    color: cal.color,
    location: e.location || '',
    description: e.description || '',
    link: e.htmlLink || '',
    lp: e.extendedProperties?.private?.lpkey || '', // rappel créé par Life Planner (caché dans l'agenda de l'app)
  };
}

/** Accès brut à l'API Agenda (pour les rappels, voir reminders.js). */
export const calApi = (path, opts) => api(path, opts);

const byStart = (a, b) => (b.allDay - a.allDay) || a.start - b.start;

export async function listEvents(from, to) {
  const cals = await selectedCalendars();
  const out = [];
  await Promise.all(cals.map(async (cal) => {
    let pageToken = '';
    do {
      const q = new URLSearchParams({
        timeMin: from.toISOString(), timeMax: to.toISOString(),
        singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
      });
      if (pageToken) q.set('pageToken', pageToken);
      const d = await api(`/calendars/${encodeURIComponent(cal.id)}/events?${q}`);
      for (const e of d.items || []) if (e.status !== 'cancelled') out.push(normalize(e, cal));
      pageToken = d.nextPageToken;
    } while (pageToken);
  }));
  out.sort(byStart);
  await updateCache(from, to, out);
  return out;
}

/* Cache local pour consulter l'agenda hors ligne */
async function updateCache(from, to, events) {
  const old = (await db.get('cache', 'events')) || [];
  const keep = old.filter((e) => !(e.start < +to && e.end > +from));
  await db.put('cache', keep.concat(events), 'events');
}

export async function cachedEvents(from, to) {
  const all = (await db.get('cache', 'events')) || [];
  return all.filter((e) => e.start < +to && e.end > +from).sort(byStart);
}

export async function createEvent({ title, date, allDay, start, end, description }) {
  const calId = (await db.get('settings', 'defaultCal')) || 'primary';
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const body = { summary: title, description: description || undefined };
  if (allDay) {
    body.start = { date };
    body.end = { date: iso(addDays(parseISO(date), 1)) };
  } else {
    const endDate = end <= start ? iso(addDays(parseISO(date), 1)) : date;
    body.start = { dateTime: `${date}T${start}:00`, timeZone };
    body.end = { dateTime: `${endDate}T${end}:00`, timeZone };
  }
  return api(`/calendars/${encodeURIComponent(calId)}/events`, { method: 'POST', body: JSON.stringify(body) });
}

export async function deleteEvent(ev) {
  await api(`/calendars/${encodeURIComponent(ev.calId)}/events/${encodeURIComponent(ev.gid)}`, { method: 'DELETE' });
  const all = (await db.get('cache', 'events')) || [];
  await db.put('cache', all.filter((e) => e.id !== ev.id), 'events');
}
