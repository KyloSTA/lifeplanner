// Petites fonctions utilitaires (dates, texte, temporisation)

export const pad = (n) => String(n).padStart(2, '0');

/** Date locale -> "AAAA-MM-JJ" */
export const iso = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

/** "AAAA-MM-JJ" -> Date locale à minuit */
export const parseISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/** Lundi de la semaine */
export const startOfWeek = (d) => {
  const x = startOfDay(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};

const LOCALE = 'fr-CA';
const fmt = (o) => new Intl.DateTimeFormat(LOCALE, o);
export const fmtLong = (d) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(d);
export const fmtShort = (d) => fmt({ day: 'numeric', month: 'short' }).format(d);
export const fmtDow = (d) => fmt({ weekday: 'short' }).format(d);
export const fmtTime = (d) => fmt({ hour: '2-digit', minute: '2-digit' }).format(d);

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Debounce avec .flush() pour forcer l'exécution (ex. avant de quitter une page) */
export function debounce(fn, ms) {
  let t = null;
  let args = null;
  const run = () => {
    t = null;
    const a = args;
    args = null;
    return fn(...a);
  };
  const d = (...a) => {
    args = a;
    clearTimeout(t);
    t = setTimeout(run, ms);
  };
  d.flush = () => {
    if (t) {
      clearTimeout(t);
      return run();
    }
  };
  return d;
}
