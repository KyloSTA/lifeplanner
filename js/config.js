// Édition de l'app. Par défaut : Life Planner. Une autre page peut définir window.LP_APP avant de
// charger app.js pour lancer une autre édition avec le même code (ex. couple/ : Couple Life Organiser),
// avec sa propre base de données et ses propres fichiers de synchro, sans toucher à ceux de Life Planner.
const c = globalThis.LP_APP || {};
export const APP = {
  id: c.id || 'lifeplanner',
  name: c.name || 'Life Planner',
  db: c.db || 'lifeplanner', // base IndexedDB
  filePrefix: c.filePrefix || 'lp-', // fichiers de synchro dans le Drive (lp-tasks.json…)
  couple: !!c.couple, // missions assignables à l'un ou l'autre
};
