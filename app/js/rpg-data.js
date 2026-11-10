// Contenu de l'Aventure : histoire (chapitres et rencontres), objets et coffres.
// Monde original : le royaume d'Ordrelune, envahi par le Brouillard de la Procrastination.

export const STATS = [
  { id: 'force', icon: '💪', name: 'Force', from: 'entraînements et habitudes sportives' },
  { id: 'endu', icon: '❤️', name: 'Endurance', from: 'habitudes et séries de jours' },
  { id: 'disc', icon: '🎯', name: 'Discipline', from: 'missions, étapes, focus et objectifs' },
  { id: 'intel', icon: '🧠', name: 'Intelligence', from: 'cours RBQ, notes, liens et pages manuscrites' },
  { id: 'sage', icon: '🔮', name: 'Sagesse', from: 'journal, humeur et révisions' },
];

export const SLOTS = [
  { id: 'arme', icon: '🗡️', name: 'Arme' },
  { id: 'tete', icon: '🪖', name: 'Tête' },
  { id: 'armure', icon: '🛡️', name: 'Armure' },
  { id: 'bijou', icon: '💍', name: 'Bijou' },
  { id: 'compagnon', icon: '🐾', name: 'Compagnon' },
];

export const RARITY = {
  commun: { name: 'Commun', color: '#9ca3af', mult: 1, price: 30 },
  rare: { name: 'Rare', color: '#3b82f6', mult: 2, price: 90 },
  epique: { name: 'Épique', color: '#a855f7', mult: 3, price: 220 },
  legendaire: { name: 'Légendaire', color: '#f59e0b', mult: 5, price: 600 },
};

// bonus : points ajoutés aux statistiques quand l'objet est équipé
export const ITEMS = [
  // Armes
  { id: 'baton', slot: 'arme', icon: '🪵', name: 'Bâton du Débutant', rarity: 'commun', bonus: { force: 1 } },
  { id: 'dague', slot: 'arme', icon: '🗡️', name: 'Dague du Premier Pas', rarity: 'commun', bonus: { disc: 1, force: 1 } },
  { id: 'plume', slot: 'arme', icon: '🪶', name: 'Plume de Scribe', rarity: 'commun', bonus: { intel: 2 } },
  { id: 'arc', slot: 'arme', icon: '🏹', name: 'Arc de l’Aube', rarity: 'rare', bonus: { disc: 3, force: 1 } },
  { id: 'marteau', slot: 'arme', icon: '🔨', name: 'Marteau du Bâtisseur', rarity: 'rare', bonus: { force: 3, intel: 1 } },
  { id: 'baguette', slot: 'arme', icon: '🪄', name: 'Baguette des Notes Reliées', rarity: 'epique', bonus: { intel: 4, sage: 2 } },
  { id: 'lame', slot: 'arme', icon: '⚔️', name: 'Lame de l’Habitude', rarity: 'epique', bonus: { force: 3, endu: 3 } },
  { id: 'aurore', slot: 'arme', icon: '☀️', name: 'Épée Aurore, Briseuse de Brouillard', rarity: 'legendaire', bonus: { force: 5, disc: 4, endu: 3 } },
  // Tête
  { id: 'bandeau', slot: 'tete', icon: '🎗️', name: 'Bandeau de Concentration', rarity: 'commun', bonus: { disc: 1 } },
  { id: 'chapeau', slot: 'tete', icon: '🎩', name: 'Chapeau du Planificateur', rarity: 'commun', bonus: { intel: 1, sage: 1 } },
  { id: 'casque', slot: 'tete', icon: '⛑️', name: 'Casque de Chantier', rarity: 'rare', bonus: { endu: 2, intel: 2 } },
  { id: 'couronne', slot: 'tete', icon: '👑', name: 'Couronne d’Ordrelune', rarity: 'legendaire', bonus: { sage: 5, disc: 4, intel: 3 } },
  { id: 'heaume', slot: 'tete', icon: '🪖', name: 'Heaume du Lève-tôt', rarity: 'epique', bonus: { disc: 3, endu: 3 } },
  // Armures
  { id: 'tunique', slot: 'armure', icon: '👕', name: 'Tunique de Lin', rarity: 'commun', bonus: { endu: 1 } },
  { id: 'cuir', slot: 'armure', icon: '🧥', name: 'Veste de Cuir Usé', rarity: 'commun', bonus: { endu: 1, force: 1 } },
  { id: 'bouclier', slot: 'armure', icon: '🛡️', name: 'Bouclier de Routine', rarity: 'rare', bonus: { endu: 3, disc: 1 } },
  { id: 'cotte', slot: 'armure', icon: '🦺', name: 'Cotte de Mailles du Matin', rarity: 'rare', bonus: { endu: 2, force: 2 } },
  { id: 'cape', slot: 'armure', icon: '🧣', name: 'Cape du Silence Numérique', rarity: 'epique', bonus: { disc: 4, sage: 2 } },
  { id: 'armure-lune', slot: 'armure', icon: '🌙', name: 'Armure de Lune Constante', rarity: 'legendaire', bonus: { endu: 6, force: 3, sage: 2 } },
  // Bijoux
  { id: 'anneau', slot: 'bijou', icon: '💍', name: 'Anneau de Focus', rarity: 'commun', bonus: { disc: 1 } },
  { id: 'pendentif', slot: 'bijou', icon: '📿', name: 'Pendentif de Gratitude', rarity: 'rare', bonus: { sage: 3 } },
  { id: 'amulette', slot: 'bijou', icon: '🧿', name: 'Amulette Anti-Distraction', rarity: 'rare', bonus: { disc: 2, intel: 1 } },
  { id: 'sablier', slot: 'bijou', icon: '⏳', name: 'Sablier du Pomodoro', rarity: 'epique', bonus: { disc: 3, intel: 3 } },
  { id: 'etoile', slot: 'bijou', icon: '🌟', name: 'Étoile du Nord', rarity: 'legendaire', bonus: { sage: 4, intel: 4, disc: 2 } },
  // Compagnons
  { id: 'chat', slot: 'compagnon', icon: '🐈', name: 'Chat de Bibliothèque', rarity: 'commun', bonus: { sage: 1 } },
  { id: 'chien', slot: 'compagnon', icon: '🐕', name: 'Chien Joggeur', rarity: 'rare', bonus: { force: 2, endu: 1 } },
  { id: 'hibou', slot: 'compagnon', icon: '🦉', name: 'Hibou Savant', rarity: 'epique', bonus: { intel: 3, sage: 3 } },
  { id: 'phenix', slot: 'compagnon', icon: '🐦‍🔥', name: 'Phénix du Recommencement', rarity: 'legendaire', bonus: { endu: 5, sage: 3, force: 2 } },
];
export const ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/*
 * Chapitres : chaque rencontre teste une statistique. power = force de l'ennemi.
 * Le boss coûte plus d'énergie et donne un butin plus rare.
 */
export const CHAPTERS = [
  {
    id: 1, name: 'Le Village des Lève-tard', icon: '🏘️',
    intro: 'Le Brouillard de la Procrastination s’est posé sur Ordrelune. Au village, plus personne ne se lève avant midi. On dit qu’un héros capable de tenir ses promesses peut dissiper la brume. Tu enfiles tes bottes.',
    outro: 'Le soleil perce au-dessus du village. Les habitants s’étirent, étonnés d’avoir vu l’aube. La route vers la Forêt des Onglets s’ouvre devant toi.',
    steps: [
      { enemy: 'Gobelin du « Encore 5 minutes »', icon: '👺', stat: 'disc', power: 3, text: 'Il bloque la porte de l’auberge en bâillant bruyamment.' },
      { enemy: 'Rat des Tâches Oubliées', icon: '🐀', stat: 'intel', power: 4, text: 'Il grignote les listes de choses à faire affichées au mur.' },
      { enemy: 'Épouvantail de la Fatigue', icon: '🎃', stat: 'endu', power: 5, text: 'Ses bras de paille te rendent les paupières lourdes.' },
      { enemy: 'Ogre Ronfleur, gardien du clocher', icon: '👹', stat: 'force', power: 7, boss: true, text: 'Il a volé la cloche du matin et dort dessus. Il faut le réveiller… et le battre.' },
    ],
  },
  {
    id: 2, name: 'La Forêt des Onglets', icon: '🌲',
    intro: 'Dans cette forêt, chaque sentier en ouvre dix autres. Les voyageurs s’y perdent pendant des heures sans jamais arriver nulle part.',
    outro: 'Tu fermes un à un les sentiers inutiles. Le chemin devient clair, droit, silencieux. Au loin brille le Lac des Notifications.',
    steps: [
      { enemy: 'Lutin du Clic Suivant', icon: '🧚', stat: 'disc', power: 7, text: '« Juste un dernier sentier ! » chuchote-t-il en t’attirant ailleurs.' },
      { enemy: 'Loup des Distractions', icon: '🐺', stat: 'sage', power: 8, text: 'Il hurle chaque fois que tu te concentres.' },
      { enemy: 'Araignée des Abonnements', icon: '🕷️', stat: 'intel', power: 9, text: 'Sa toile est faite de cases « S’abonner » cochées par erreur.' },
      { enemy: 'Hydre aux Mille Onglets', icon: '🐉', stat: 'disc', power: 12, boss: true, text: 'Chaque tête coupée en fait repousser deux. Il faut les fermer toutes, une à une.' },
    ],
  },
  {
    id: 3, name: 'Le Lac des Notifications', icon: '🌊',
    intro: 'Le lac scintille de mille petites lumières qui clignotent sans arrêt. Ceux qui le regardent trop longtemps oublient pourquoi ils étaient venus.',
    outro: 'Une à une, les lumières s’éteignent. Le lac redevient calme comme un miroir. Sur l’autre rive se dresse la Montagne du Chantier.',
    steps: [
      { enemy: 'Sirène du Défilement Infini', icon: '🧜', stat: 'sage', power: 11, text: 'Elle chante une chanson qui ne finit jamais vraiment.' },
      { enemy: 'Banc de Pings Pirates', icon: '🐟', stat: 'disc', power: 12, text: 'Ils mordent toutes les 30 secondes, juste assez pour te déconcentrer.' },
      { enemy: 'Méduse du Doute', icon: '🪼', stat: 'endu', power: 13, text: 'Son toucher murmure « à quoi bon ? ».' },
      { enemy: 'Léviathan de la Boîte de Réception', icon: '🦑', stat: 'intel', power: 17, boss: true, text: 'Il remonte des profondeurs avec 4 812 messages non lus accrochés à ses tentacules.' },
    ],
  },
  {
    id: 4, name: 'La Montagne du Chantier', icon: '🏔️',
    intro: 'Au sommet, l’ancien Temple des Bâtisseurs tombe en ruine. Pour le reconstruire, il faut des plans, de la rigueur… et des muscles.',
    outro: 'Pierre par pierre, le temple se relève. Les plans sont en ordre, les murs droits. Du haut de la montagne, tu aperçois la Tour du Chaos.',
    steps: [
      { enemy: 'Golem de la Paperasse', icon: '🗿', stat: 'intel', power: 16, text: 'Il est fait de formulaires non remplis et de permis expirés.' },
      { enemy: 'Bélier de l’Excuse', icon: '🐏', stat: 'force', power: 17, text: 'Il fonce tête baissée en criant « Je commencerai lundi ! ».' },
      { enemy: 'Spectre du Report', icon: '👻', stat: 'disc', power: 18, text: 'Il remet tout à demain… y compris ta victoire.' },
      { enemy: 'Titan du Chantier Abandonné', icon: '🏗️', stat: 'force', power: 23, boss: true, text: 'Un géant de béton, d’échafaudages rouillés et de projets jamais finis.' },
    ],
  },
  {
    id: 5, name: 'La Tour du Chaos', icon: '🗼',
    intro: 'Au cœur du Brouillard se dresse la Tour du Chaos. Tout ce que tu as bâti jour après jour sera mis à l’épreuve.',
    outro: 'Le Dragon du Chaos s’effondre et le Brouillard se dissipe. Ordrelune retrouve ses matins clairs et ses journées pleines. On murmure ton nom dans tous les villages… mais d’autres brumes guettent. Ton aventure continue : chaque habitude tenue te rend plus fort.',
    steps: [
      { enemy: 'Chevalier de l’Agenda Vide', icon: '🤺', stat: 'disc', power: 22, text: 'Son bouclier ne porte aucun plan, seulement des cases blanches.' },
      { enemy: 'Sorcière du Perfectionnisme', icon: '🧙', stat: 'sage', power: 23, text: '« Ce n’est jamais assez bien » lance-t-elle à chaque sort.' },
      { enemy: 'Chimère de l’Épuisement', icon: '🦁', stat: 'endu', power: 24, text: 'Trois têtes : trop de travail, pas assez de sommeil, aucune pause.' },
      { enemy: 'Dragon du Chaos', icon: '🐲', stat: 'force', power: 30, boss: true, text: 'Le maître du Brouillard en personne. Ses ailes couvrent tout le ciel.' },
    ],
  },
];

// Après l'histoire : l'Arène infinie (ennemis de plus en plus forts)
export const ARENA = [
  { enemy: 'Ombre de la Procrastination', icon: '🌫️' },
  { enemy: 'Écho des Mauvaises Habitudes', icon: '🌀' },
  { enemy: 'Brume du Lundi', icon: '☁️' },
  { enemy: 'Fantôme du Défilement', icon: '👤' },
];
