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
// Jeton de renouvellement (avec le code secret du client) : garde la connexion d'une ouverture à l'autre,
// sans fenêtre Google. Il reste sur cet appareil (jamais synchronisé ni exporté).
const REFRESH_KEY = 'lp.grefresh';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

let tok = null;
try { tok = JSON.parse(localStorage.getItem(TOKEN_KEY)); } catch { tok = null; }
let refresh = null;
try { refresh = localStorage.getItem(REFRESH_KEY); } catch { refresh = null; }

const valid = () => !!(tok && tok.exp > Date.now() + 30_000);
/** Connecté : jeton encore valide, ou renouvelable sans fenêtre. */
export const isConnected = () => valid() || !!refresh;
export const staysConnected = () => !!refresh;

function keep(r) {
  tok = { t: r.access_token, exp: Date.now() + (Number(r.expires_in) - 60) * 1000, scope: r.scope || tok?.scope || SCOPES };
  try { localStorage.setItem(TOKEN_KEY, JSON.stringify(tok)); } catch { /* stockage indisponible */ }
  if (r.refresh_token) {
    refresh = r.refresh_token;
    try { localStorage.setItem(REFRESH_KEY, refresh); } catch { /* ignore */ }
  }
}

function dropRefresh() {
  refresh = null;
  try { localStorage.removeItem(REFRESH_KEY); } catch { /* ignore */ }
}

async function tokenCall(params) {
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) { const e = new Error(j.error_description || j.error || 'Google a refusé la connexion'); e.code = j.error; throw e; }
  return j;
}

let renewing = null;
/** Renouvelle le jeton en silence s'il a expiré (une seule demande à la fois). */
export async function ensure() {
  if (valid() || !refresh) return valid();
  if (!renewing) {
    renewing = (async () => {
      const [cid, secret] = await Promise.all([db.get('settings', 'clientId'), db.get('settings', 'clientSecret')]);
      if (!cid || !secret) return false;
      try {
        keep(await tokenCall({ client_id: cid, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }));
        window.dispatchEvent(new Event('lp-google'));
        return true;
      } catch (err) {
        if (err.code) { // Google refuse (révoqué, expiré, code secret changé…) : on oublie ce jeton, il faudra se reconnecter
          dropRefresh();
          if (err.code === 'invalid_client') setCodeError('Code secret du client refusé par Google');
        }
        return false;
      }
    })().finally(() => { renewing = null; });
  }
  return renewing;
}

/** Jeton prêt à l'emploi (renouvelé au besoin), ou null. */
export async function freshToken() { await ensure(); return valid() ? tok.t : null; }

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
export const token = () => (valid() ? tok.t : null);

// Dernier échec de la connexion durable (code secret refusé, etc.) : affiché dans les Réglages
const CODE_ERR_KEY = 'lp.gcodeerr';
export function codeError() { try { return localStorage.getItem(CODE_ERR_KEY) || ''; } catch { return ''; } }
export function setCodeError(msg) { try { msg ? localStorage.setItem(CODE_ERR_KEY, msg) : localStorage.removeItem(CODE_ERR_KEY); } catch { /* ignore */ } }

/**
 * Ouvre la fenêtre de connexion Google (à appeler depuis un clic).
 * silent = true : reconnexion discrète (pas d'écran de consentement si déjà accordé).
 */
/**
 * Autorisation durable propre à la montre (app Galaxy Watch) : accès au seul dossier de synchro (drive.appdata).
 * Ne remplace pas la connexion de cette page. Renvoie { clientId, clientSecret, refresh } à transférer sur la montre.
 */
export async function linkWatch() {
  const [clientId, secret] = await Promise.all([db.get('settings', 'clientId'), db.get('settings', 'clientSecret')]);
  if (!clientId) throw new Error('Configure d’abord l’ID client Google ci-dessus');
  if (!secret) throw new Error('Ajoute d’abord le code secret du client ci-dessus (connexion durable)');
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      ux_mode: 'popup',
      callback: async (r) => {
        if (r.error) return reject(new Error(r.error_description || r.error));
        try {
          const j = await tokenCall({ code: r.code, client_id: clientId, client_secret: secret, redirect_uri: 'postmessage', grant_type: 'authorization_code' });
          if (!j.refresh_token) throw new Error('Google n’a pas donné d’autorisation durable : réessaie');
          resolve({ app: 'lifeplanner-watch', clientId, clientSecret: secret, refresh: j.refresh_token });
        } catch (err) { reject(err); }
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Connexion annulée' : e.message || e.type)),
    });
    client.requestCode({ prompt: 'consent' }); // l'écran d'autorisation garantit une autorisation durable
  });
}

export async function connect({ silent = false } = {}) {
  const clientId = await db.get('settings', 'clientId');
  if (!clientId) throw new Error('NO_CLIENT_ID');
  if (silent && (await ensure())) return; // renouvelé sans fenêtre
  const secret = await db.get('settings', 'clientSecret');
  await loadGis();
  // Avec le code secret : connexion « code » qui donne un jeton de renouvellement (on reste connecté).
  // Jamais en reconnexion discrète (elle ouvrirait l'écran d'autorisation à chaque toucher), ni après un échec :
  // on revient alors à la connexion simple jusqu'à ce que le code secret soit corrigé dans les Réglages.
  if (secret && !silent && !codeError()) {
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: SCOPES,
        ux_mode: 'popup',
        callback: async (r) => {
          if (r.error) return reject(new Error(r.error_description || r.error));
          try {
            keep(await tokenCall({ code: r.code, client_id: clientId, client_secret: secret, redirect_uri: 'postmessage', grant_type: 'authorization_code' }));
            setCodeError(refresh ? '' : 'Google n’a pas donné d’autorisation durable : retire l’app sur myaccount.google.com/permissions, puis reconnecte-toi.');
            window.dispatchEvent(new Event('lp-google'));
            resolve();
          } catch (err) {
            const msg = err.code === 'invalid_client' ? 'Code secret du client invalide : vérifie-le dans Réglages › Google Agenda'
              : err instanceof TypeError ? 'Google n’a pas pu être joint pour l’autorisation durable (' + err.message + ')' : err.message;
            setCodeError(msg);
            reject(new Error(msg + ' — clique « Connecter » à nouveau pour une connexion simple.'));
          }
        },
        error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Connexion annulée' : e.message || e.type)),
      });
      // Pas encore de jeton de renouvellement : Google ne le donne qu'avec l'écran d'autorisation
      client.requestCode(refresh ? {} : { prompt: 'consent' });
    });
  }
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (r) => {
        if (r.error) return reject(new Error(r.error_description || r.error));
        keep(r);
        window.dispatchEvent(new Event('lp-google'));
        resolve();
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Connexion annulée' : e.message || e.type)),
    });
    client.requestAccessToken(silent ? { prompt: '' } : undefined);
  });
}

/** Oublie un jeton refusé par Google (expiré ou révoqué) ; le jeton de renouvellement en redonnera un. */
export function forget() {
  tok = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export async function disconnect() {
  const t = refresh || tok?.t;
  if (t) fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: t }) }).catch(() => {});
  tok = null;
  dropRefresh();
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

async function api(path, opts = {}, retry = true) {
  if (!(await ensure())) throw new Error('NOT_CONNECTED');
  const r = await fetch(API + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + tok.t, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (r.status === 401) {
    forget();
    if (retry && refresh) return api(path, opts, false); // jeton refusé : on en redemande un en silence
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
