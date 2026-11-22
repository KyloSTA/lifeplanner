// 🎵 Mini lecteur Spotify dans le menu : ce qui joue (titre, artiste, appareil), lecture/pause, suivante.
// Connexion « PKCE » (sans code secret) avec ton propre identifiant d'application Spotify (gratuit).
// L'identifiant est un réglage ; les jetons de connexion restent sur cet appareil (store « cache », jamais synchronisé).
// Contrôler la lecture (pause, suivante) demande Spotify Premium ; sans Premium, le lecteur affiche seulement ce qui joue.
import { db } from './db.js';
import * as U from './util.js';

const { esc } = U;
const API = 'https://api.spotify.com/v1';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
const TOK = 'spotifyTok', VERIFIER = 'lp.spVerifier';
export const redirectUri = () => location.origin + location.pathname;

export const clientId = async () => (await db.get('settings', 'spotifyClientId')) || '';
export async function setClientId(id) { await db.put('settings', (id || '').trim(), 'spotifyClientId'); }
export const isConnected = async () => !!(await db.get('cache', TOK));
export async function disconnect() { await db.del('cache', TOK); state = null; draw(); }

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Ouvre la page de connexion Spotify (retour sur cette page avec ?code=…). */
export async function connect() {
  const id = await clientId();
  if (!id) throw new Error('Entre d’abord l’identifiant (Client ID) de ton application Spotify');
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const st = b64url(crypto.getRandomValues(new Uint8Array(12)));
  sessionStorage.setItem(VERIFIER, JSON.stringify({ verifier, st, hash: location.hash }));
  const q = new URLSearchParams({ client_id: id, response_type: 'code', redirect_uri: redirectUri(), code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPES, state: st });
  location.href = 'https://accounts.spotify.com/authorize?' + q;
}

async function tokenRequest(body) {
  const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || d.error || 'connexion refusée');
  const old = (await db.get('cache', TOK)) || {};
  const tok = { access: d.access_token, refresh: d.refresh_token || old.refresh, exp: Date.now() + (d.expires_in - 60) * 1000 };
  await db.put('cache', tok, TOK);
  return tok;
}

/** Au retour de Spotify : échange le code contre les jetons, puis nettoie l'adresse. */
async function finishLogin() {
  const p = new URLSearchParams(location.search);
  if (!p.has('code') && !p.has('error')) return;
  const saved = JSON.parse(sessionStorage.getItem(VERIFIER) || 'null');
  sessionStorage.removeItem(VERIFIER);
  history.replaceState(null, '', location.pathname + (saved?.hash || location.hash || ''));
  if (!saved || p.get('state') !== saved.st) return;
  if (p.has('error')) { window.dispatchEvent(new CustomEvent('lp-toast', { detail: 'Spotify : connexion annulée' })); return; }
  await tokenRequest({ grant_type: 'authorization_code', code: p.get('code'), redirect_uri: redirectUri(), client_id: await clientId(), code_verifier: saved.verifier });
}

async function token() {
  let t = await db.get('cache', TOK);
  if (!t) return null;
  if (Date.now() > t.exp) {
    try { t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: await clientId() }); }
    catch { await db.del('cache', TOK); return null; }
  }
  return t.access;
}
async function api(path, method = 'GET') {
  const t = await token();
  if (!t) throw new Error('NOT_CONNECTED');
  const r = await fetch(API + path, { method, headers: { Authorization: 'Bearer ' + t } });
  if (r.status === 204) return null;
  if (r.status === 401) { await db.del('cache', TOK); throw new Error('NOT_CONNECTED'); }
  if (r.status === 403) throw new Error('PREMIUM');
  if (!r.ok) throw new Error('Spotify ' + r.status);
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

/* ---------- Le mini lecteur ---------- */
let state = null; // réponse de /me/player
let at = 0;
let timer = null;

const el = () => document.getElementById('mini-player');

function draw() {
  const box = el();
  if (!box) return;
  const it = state?.item;
  if (!it) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  const art = it.album?.images?.at(-1)?.url || it.images?.at(-1)?.url || it.show?.images?.at(-1)?.url || '';
  const who = (it.artists || []).map((a) => a.name).join(', ') || it.show?.name || '';
  const dev = state.device?.name || '';
  const pct = it.duration_ms ? Math.min(100, ((state.progress_ms + (state.is_playing ? Date.now() - at : 0)) / it.duration_ms) * 100) : 0;
  box.innerHTML = `<a class="mp-art" href="${esc(it.external_urls?.spotify || 'https://open.spotify.com')}" target="_blank" rel="noopener" title="Ouvrir dans Spotify">${art ? `<img src="${esc(art)}" alt="">` : '🎵'}</a>
    <div class="mp-txt"><span class="mp-title" title="${esc(it.name)} • ${esc(who)}"><b>${esc(it.name)}</b> • ${esc(who)}</span>
      ${dev ? `<span class="mp-dev" title="Joue sur ${esc(dev)}">🔊 ${esc(dev)}</span>` : ''}</div>
    <button type="button" class="mp-btn mp-play" data-mp="${state.is_playing ? 'pause' : 'play'}" aria-label="${state.is_playing ? 'Pause' : 'Lecture'}" title="${state.is_playing ? 'Pause' : 'Lecture'}">${state.is_playing
      ? '<svg viewBox="0 0 24 24"><rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>'}</button>
    <button type="button" class="mp-btn mp-next" data-mp="next" aria-label="Suivante" title="Suivante"><svg viewBox="0 0 24 24"><path d="M6 5.5v13l9-6.5z"/><rect x="16" y="5.5" width="3" height="13" rx="1"/></svg></button>
    <i class="mp-bar" style="width:${pct}%"></i>`;
  box.querySelectorAll('[data-mp]').forEach((b) => (b.onclick = () => control(b.dataset.mp)));
}

async function control(what) {
  try {
    if (what === 'next') await api('/me/player/next', 'POST');
    else await api(what === 'pause' ? '/me/player/pause' : '/me/player/play', 'PUT');
    if (what !== 'next' && state) { state.is_playing = what === 'play'; at = Date.now(); draw(); }
    setTimeout(refresh, 600);
  } catch (e) {
    const msg = e.message === 'PREMIUM' ? 'Spotify Premium est requis pour contrôler la lecture depuis l’app' : e.message === 'NOT_CONNECTED' ? 'Spotify : reconnecte-toi dans Réglages' : e.message;
    window.dispatchEvent(new CustomEvent('lp-toast', { detail: msg }));
  }
}

export async function refresh() {
  try {
    const p = await api('/me/player?additional_types=episode');
    state = p; at = Date.now();
  } catch (e) { if (e.message === 'NOT_CONNECTED') state = null; }
  draw();
}

/** Démarrage : termine une connexion en cours, puis suit la lecture (toutes les 5 s quand l'app est visible). */
export async function start() {
  try { await finishLogin(); } catch (e) { window.dispatchEvent(new CustomEvent('lp-toast', { detail: 'Spotify : ' + e.message })); }
  if (!(await isConnected())) return;
  refresh();
  clearInterval(timer);
  timer = setInterval(() => { if (!document.hidden) refresh(); else if (state?.is_playing) draw(); }, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  setInterval(() => { if (state?.is_playing && !document.hidden) draw(); }, 1000); // barre de progression
}

/** Carte de réglage (dans Réglages). */
export async function settingsCard(box, toast) {
  const id = await clientId(), on = await isConnected();
  box.innerHTML = `<div class="card-head"><h2>🎵 Spotify</h2>${on ? '<span class="sync live">Connecté</span>' : ''}</div>
    <details class="cfg-fold" ${id && on ? '' : 'open'}><summary>${id && on ? '✓ Configuré · identifiant de l’application' : 'Configuration'}</summary>
    <p class="muted" style="margin-top:0">Un mini lecteur dans le menu : ce qui joue, lecture/pause et chanson suivante. Une seule fois (gratuit, ~3 minutes) :</p>
    <ol class="steps">
      <li>Va sur <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">developer.spotify.com/dashboard</a> et connecte-toi avec ton compte Spotify.</li>
      <li><em>Create app</em> : un nom (ex. « Life Planner »), une description, et dans <em>Redirect URIs</em> ajoute exactement <code>${esc(redirectUri())}</code>. Coche <em>Web API</em>, accepte et enregistre.</li>
      <li>Dans <em>Settings</em> de l’application, copie le <em>Client ID</em> et colle-le ci-dessous.</li>
    </ol>
    <form class="form" id="sp-form"><label>Client ID<input name="cid" value="${esc(id)}" placeholder="32 caractères" autocomplete="off" spellcheck="false"></label>
      <div class="head-actions"><button class="btn">Enregistrer</button></div></form>
    </details>
    <div class="status-line">${on ? '<button class="btn" id="sp-off">Déconnecter Spotify</button>' : `<button class="btn primary" id="sp-on" ${id ? '' : 'disabled'}>Connecter Spotify</button>`}</div>
    <p class="hint muted">Le lecteur apparaît dans le menu quand quelque chose joue sur un de tes appareils Spotify. Pause et suivante demandent Spotify Premium. Ta connexion reste sur cet appareil.</p>`;
  box.querySelector('#sp-form').onsubmit = async (e) => { e.preventDefault(); await setClientId(e.target.cid.value); toast('🎵 Identifiant Spotify enregistré'); settingsCard(box, toast); };
  box.querySelector('#sp-on')?.addEventListener('click', () => connect().catch((err) => toast(err.message, 'err')));
  box.querySelector('#sp-off')?.addEventListener('click', async () => { await disconnect(); toast('Spotify déconnecté'); settingsCard(box, toast); });
}
