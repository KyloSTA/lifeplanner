# Life Planner

Planificateur de vie, journal de bord et carnet manuscrit pour Surface Pro, synchronisé avec Google Agenda.

## Lancer l'app

Double-clique sur **`Lancer Life Planner.bat`**. Le script démarre un petit serveur local
(PowerShell, rien à installer) et ouvre l'app dans Edge à l'adresse `http://localhost:5173`.

### L'installer comme une vraie app (recommandé)
Dans Edge : menu `…` → **Applications** → **Installer Life Planner**.
L'app a ensuite sa propre icône dans le menu Démarrer et la barre des missions, s'ouvre en plein écran
sans barre d'adresse et **fonctionne hors ligne**, même quand le serveur n'est pas lancé.
(Relance le `.bat` seulement après avoir modifié le code, pour recevoir la mise à jour.)

## Sur ton cellulaire (et tous tes appareils)
1. **App en ligne** : le dossier `app/` est publié sur GitHub Pages (**https://kylosta.github.io/lifeplanner/**). Après une modification, double-clique sur
   **`Publier.bat`** : la nouvelle version est en ligne 1 à 2 minutes plus tard.
2. **Google** (une fois, sur console.cloud.google.com, dans ton projet existant) :
   - active **Google Drive API** (en plus de Google Calendar API) ;
   - dans ton ID client OAuth, ajoute l'origine `https://kylosta.github.io` aux
     *Origines JavaScript autorisées*.
3. **Synchronisation** : Réglages → **☁️ Activer la synchronisation** (sur chaque appareil).
   Tes données vont dans un dossier caché et privé de ton Google Drive ; chaque appareil envoie
   ses changements et reçoit ceux des autres (la modification la plus récente gagne).
4. **Sur le cellulaire** : scanne le code QR de Réglages → Synchronisation (ou ouvre le lien),
   active la synchro, puis « Ajouter à l'écran d'accueil » pour l'installer comme une app.

Sur cellulaire, le menu du bas montre 4 onglets (les 4 premiers de Réglages → Menu) et **Plus**
pour les autres. ⚠️ La connexion Google dure 1 h : ensuite, la synchro se reconnecte au prochain
toucher de l'écran. Les alarmes et le minuteur ne sonnent que si l'app est ouverte.

## Widget « Mes missions » sur le bureau
Double-clique sur **`Widget Taches.bat`**. Une petite fenêtre s'ouvre avec les missions du jour
(y compris celles en retard), celles de demain et ta progression. Tu peux y cocher, ajouter ou
supprimer des missions. Les changements apparaissent instantanément dans l'app, et inversement.
- Pour qu'il s'ouvre automatiquement au démarrage de Windows, double-clique une fois sur
  **`Widget au demarrage.bat`**. Relance ce même fichier pour annuler.
- Place la fenêtre où tu veux : Edge retient sa position et sa taille.

## Sections

| Section | Contenu |
|---|---|
| **Aujourd'hui** | Résumé du jour (héros, missions, habitudes, workout, série), capture rapide, puis deux colonnes : missions, agenda et objectifs à gauche ; habitudes, workout, cours RBQ, humeur, page manuscrite et citation à droite |
| **Missions** | Toutes les missions : filtres (à faire, en retard, aujourd'hui, à venir, sans date, terminées), recherche, regroupement par date ou par objectif, ajout rapide |
| **Semaine** | Les 7 jours avec événements Google et missions ; `+` pour créer un événement dans Google Agenda |
| **Journal** | Humeur, intention, récit de la journée, gratitude, leçons, plus une page manuscrite par jour |
| **Carnet** | Pages libres à écrire au Surface Pen (lignes, carreaux, points ou vierge) |
| **Cerveau** | Ton second cerveau : idées, apprentissages, ressources, personnes, projets, citations, reliés entre eux |
| **Objectifs** | Objectifs par horizon (semaine, mois, année, long terme), avec leurs missions et leur progression |
| **Ton héros** (avatar) | Niveau, évolution, badges, personnalisation, et la section **Habitudes** (rappels, suivi quotidien, séries 🔥) |
| **Workout** | Séance du jour, programme de la semaine, séances modèles et progrès |
| **Cours RBQ** | Préparation de l'examen : modules, notes de cours, points clés, cartes de révision, compte à rebours |
| **Réglages** | Connexion Google Agenda, assistant, sauvegarde/restauration, **ordre des onglets du menu**, thème |

Pour réorganiser le menu : **Réglages → Menu**, puis les flèches ↑ ↓ (Réglages reste en bas).
Un clic sur le **logo** ramène à **Aujourd'hui**. **Semaine**, **Carnet** et le **Lanceur** sont les
petites icônes à droite du logo (sur cellulaire : Aujourd'hui est dans la barre du bas, les trois autres
dans le menu **Plus**).

## Assistant (page Aujourd'hui)
Écris ce que tu veux changer dans la barre discrète de l'assistant (sous la citation), comme si tu
parlais à quelqu'un. Seul le dernier échange s'affiche ; **Historique** montre les précédents et
**Effacer** recommence.
- **Avec Claude** (recommandé) : ajoute une clé API dans **Réglages → Assistant**
  (compte sur https://console.anthropic.com, facturé à l'usage). Tu peux alors demander
  n'importe quoi : « Qu'est-ce que j'ai demain ? », « Déplace la cuisine à lundi et ajoute-lui
  3 étapes », « Crée 4 missions pour mon objectif condo », « Note dans mon journal que… »,
  « Ajoute un rendez-vous chez le dentiste jeudi à 14 h » (si Google Agenda est connecté).
  Chaque changement s'affiche en vert dans la conversation ; les suppressions te sont toujours
  demandées avant d'être faites. La clé reste sur la Surface et n'est jamais mise dans les sauvegardes.
- **Sans clé ou hors ligne** : commandes simples — « ajoute X demain », « ajoute X pour l'objectif Y »,
  « coche X », « décoche X », « déplace X à vendredi », « supprime X », « objectif X cette année »,
  « idée : … ». Tape « aide » pour la liste.

## Citation du moment
Sous ton héros, une citation en anglais change à intervalle régulier : **motivation**, **inspiration** ou
**verset biblique** (King James Version), choisis au hasard parmi une centaine. Les flèches **‹ ›** reviennent à la précédente ou passent à la suivante.
La petite icône **💾** range la citation affichée dans ton Cerveau, comme une note de type
❝ Citation (avec l'auteur ou la référence et une étiquette #motivation, #inspiration ou #bible).
Une citation déjà sauvegardée affiche un **✓** vert ; touche-le pour ouvrir la note.
Le petit bouton **⋯** permet de forcer un seul type et de choisir la fréquence (1, 2, 5, 15 min ou jamais).

## Héros, XP et niveaux
Ton avatar apparaît en haut du menu, sur la page Aujourd'hui et dans le widget. Clique dessus pour
le personnaliser (peau, coiffure, yeux, tenue, accessoire, fond).
- **Points (XP)** : mission +10, étape +3, entrée de journal +15, humeur +5, page manuscrite +10,
  chaque palier de 25 % d'un objectif +10, objectif atteint +50. Tu gagnes aussi un bonus de série
  quand tu es actif plusieurs jours de suite.
- Si tu décoches une mission, ses points sont retirés : impossible de tricher par erreur.
- **Niveaux** : chaque niveau débloque de nouveaux éléments pour l'avatar (casquette au niveau 2,
  lunettes au 4, chapeau de mage au 7, couronne au 10…).
- **Badges** : 13 badges à collectionner (séries, nombre de missions, journal, pages manuscrites…).

## Second cerveau (section Cerveau)
- **Capturer** : écris une idée dans « Capture rapide » (en haut de la page Aujourd'hui, ou page
  Cerveau), puis Ctrl + Entrée. La 1re ligne devient le titre. L'idée va dans **📥 À classer**.
- **Photos et captures d'écran** : colle une image (Ctrl + V, même sans cliquer dans le champ),
  glisse-la, ou touche **📷 Photo** (sur cellulaire, ça ouvre l'appareil photo). Dans une note, l'image
  s'insère à l'endroit du curseur (ligne `![](img:…)`) et s'affiche en mode 👁 Lire ; un clic l'agrandit.
  Les images sont réduites et compressées, puis synchronisées comme le reste. Supprimer une note
  supprime aussi ses images.
- **Documents (PDF, Word, EPUB, Excel, PowerPoint, texte)** : **📎 Fichier** dans la capture rapide ou dans une
  note (ou glisse le fichier). Un clic ouvre le PDF dans un onglet ; les autres sont téléchargés et ouverts par
  Windows. 25 Mo maximum par document. Avec la synchro, chaque document est envoyé une fois dans ton Drive
  (dossier privé de l'app) et un autre appareil le récupère quand tu l'ouvres.
- **🧷 Associé à** (panneau de droite d'une note) : relie la note à un **projet**, un **module du cours RBQ**, un
  **objectif** ou une **mission**. Elle apparaît ensuite dans le projet (« Éléments associés »), dans le module
  (« Du Cerveau »), dans l'objectif déplié et dans la fenêtre de la mission.
- **🚀 Projets** : tes projets actifs sont en vedette en haut du Cerveau, avec leur avancement.
- **Classer** : ouvre l'idée, choisis son type (💡 Idée, 📝 Note, 🎓 Apprentissage, 📚 Ressource,
  🚀 Projet, 👤 Personne, ❝ Citation), ajoute des `#étiquettes`, puis clique **Classer**.
- **Relier** : écris `[[` pour choisir une autre note. Un lien vers une note qui n'existe pas encore
  la crée quand tu cliques dessus. Chaque note montre ses liens, ses **rétroliens** (les notes qui
  pointent vers elle) et des suggestions de notes à relier (même étiquette).
  Si tu renommes une note, les liens des autres notes suivent.
- **Redécouvrir** : une ancienne note revient chaque jour pour que tu la relises.
- Mise en forme : `- ` pour une liste, `# ` pour un titre, `> ` pour une citation, `**gras**`.
  Le bouton 👁 Lire affiche la note avec ses liens cliquables.
- **✅ En faire une mission** transforme une note en mission pour aujourd'hui.

### Archives
Dans une note, **🗄 Archiver** la range dans les archives : elle garde son type (Idée, Projet…)
et ses points, mais n'apparaît plus dans la liste, les filtres, les étiquettes, « Redécouvrir »,
les suggestions de liens ni le choix de projet des objectifs. Les liens `[[…]]` vers elle
fonctionnent toujours. Pour la retrouver : **Cerveau → 🗄 Archives** (à la fin des filtres),
où tu peux filtrer par catégorie d'origine. **↩ Désarchiver** la remet avec les autres.

### Projets : objectifs et missions
Une note de type **🚀 Projet** devient un tableau de bord : en haut de la note, la section
**🎯 Objectifs du projet** permet de créer des objectifs pour ce projet, d'y associer des objectifs
existants, et d'ajouter ou cocher leurs missions directement. L'avancement du projet est la moyenne
de ses objectifs (qui suivent eux-mêmes leurs missions) ; il s'affiche aussi sur la carte du projet
dans le Cerveau.
Depuis l'onglet **Objectifs**, tu peux aussi choisir le projet d'un objectif (liste 🚀 quand
l'objectif est déplié, ou au moment de le créer). Une pastille 🚀 mène au projet.
Supprimer un projet garde ses objectifs et ses missions.

### L'avatar évolue avec ton savoir
Chaque action dans le Cerveau donne des XP **et** des points de **Savoir** : note de 30 caractères
ou plus +5, lien +2, révision +3, idée classée +2. Le Savoir fait évoluer ton avatar :

| Savoir | Stade | Ce qui change |
|---|---|---|
| 0 | 🌑 Esprit en éveil | – |
| 20 | ✨ Étincelle | des étincelles autour de la tête |
| 60 | 🦉 Compagnon hibou | un petit hibou sur l'épaule |
| 150 | 🔮 Érudit·e | une aura, le hibou grandit |
| 300 | 📜 Sage | un anneau de runes, le hibou porte des lunettes |
| 600 | 🌟 Archisage | troisième œil, aura cosmique, hibou doré |

Supprimer une note retire ses points. Tu peux masquer les effets sur la page Héros.

## Missions et objectifs
L'onglet **Objectifs** a deux parties : **📅 Par échéance** (cette semaine, ce mois-ci, cette année,
long terme) et **🚀 Par projet** (les objectifs rattachés à un projet du Cerveau, regroupés par projet,
avec l'avancement du projet). Déplie un objectif pour **changer son échéance** (ou « Sans échéance »)
ou son projet ; dans un projet, l'échéance se change aussi directement à côté de chaque objectif.

Les tâches s'appellent maintenant des **missions**. Tu peux rattacher une mission à un objectif :
- dans **Objectifs**, touche « 🎯 Ajouter des missions » sous un objectif pour créer ses missions
  (avec une date, ou sans date pour les garder en réserve), ou pour y lier une mission existante ;
- ou, partout ailleurs, touche **›** sur une mission et choisis son objectif dans la liste 🎯.

Dès qu'un objectif a des missions, sa progression se calcule toute seule (missions accomplies /
missions totales) et rapporte les XP des paliers 25/50/75/100 %. Sans mission, tu la règles au curseur.
Une mission liée affiche une pastille 🎯 avec le nom de son objectif. Supprimer un objectif garde ses
missions (elles deviennent sans objectif).

## Minuteur de focus (Pomodoro)
Ouvre une mission (**›**) et, dans **⏱ Minuteur de focus**, choisis **🍅 25 min** (pause 5 min),
**50 min** (pause 10), **15 min** (pause 3) ou une durée à toi. Un minuteur flottant apparaît en bas
à droite, sur toutes les pages et dans le widget : ⏸ pause, ⏭ passer à l'étape suivante, ■ arrêter.
À la fin d'un focus : un carillon, une notification, **+5 XP**, puis la pause démarre (une grande pause
de 15 min toutes les 4 sessions). À la fin de la pause, touche ▶ pour relancer un focus.
Le temps de focus et le nombre de 🍅 sont enregistrés sur la mission.

## Habitudes
Elles sont dans la page de ton **héros** (clique ton avatar en haut du menu), au-dessus de l'évolution du savoir.
Des « missions spéciales » qui reviennent : choisis les jours, le nombre de fois par jour (ex. 💧 3 fois)
et les heures de rappel. Elles apparaissent sur la page **Aujourd'hui** (carte « Habitudes du jour ») :
touche une habitude pour la cocher (+1 si elle se fait plusieurs fois, − pour corriger).
- **Rappels** : à l'heure prévue, une notification Windows et un petit carillon, plus un bandeau en haut de
  l'écran avec **✓ Fait**, **+10 min** et **×**. Un rappel manqué pendant que l'app était fermée s'affiche à sa
  réouverture le même jour. Comme les alarmes, les rappels ne sonnent que si Life Planner (ou le widget) est ouvert.
- **Suivi** : série 🔥 (jours prévus réussis d'affilée), record, taux de réussite sur 30 jours et les 14 derniers
  jours en cases (touche une case pour rattraper un oubli).
- **⏸ Mettre en pause** arrête les rappels sans perdre l'historique. Chaque habitude complétée donne 3 XP.
- Déjà ajoutées pour toi : 🦷 dents matin et soir (5 h 45, 21 h 30), ⛪ Église le dimanche (9 h), et du lundi au
  vendredi : ⏰ réveil 5 h 30, 🥪 lunch (5 h 45), 🚗 partir travailler à 6 h 15 (rappel à 6 h 05). Modifie-les avec ✎.

## Workout
Trois onglets :
- **Aujourd'hui** : la séance prévue dans ton programme (ou « Jour de repos »). **▶ Commencer** ouvre la séance
  en cours : chronomètre, chaque série avec reps et charge (préremplies avec ta dernière charge), case **Fait**
  qui lance le minuteur de repos, ajout de séries ou d'exercices, note. **🏁 Terminer** l'enregistre (+25 XP).
- **Programme** : ta semaine (une séance ou repos pour chaque jour), tes séances modèles (exercices, séries,
  reps, charge), l'unité lb/kg et la durée du repos. Les 3 séances de départ sont un exemple à remplacer.
- **Progrès** : séances cette semaine par rapport au programme, semaines d'affilée, graphique des 8 dernières
  semaines, progression de chaque exercice (record, dernière charge, évolution) et historique.

## Cours RBQ
Ta place pour préparer l'examen. **⚙ Examen et cours** : nom, date de l'examen (compte à rebours sur la page et
sur Aujourd'hui) et adresse du cours en ligne (bouton **📖 Ouvrir le cours**, dans sa propre fenêtre).
- **Modules** : quatre modules de départ suivent les grands volets des examens de licence d'entrepreneur
  (administration, sécurité des chantiers, gestion de projets, exécution des travaux) ; renomme-les, supprime-les
  ou ajoute ceux de ton cours. Statut : À commencer, En cours, À réviser, Maîtrisé.
- Dans un module : **📝 notes de cours** (Écrire / Lire), **⭐ points clés**, **🃏 cartes de révision** (question/réponse)
  et **🧠 Du Cerveau** : « + Ajouter depuis le Cerveau » rattache des notes capturées (idées, photos, captures d'écran),
  et **📎 Documents du cours** (PDF, Word, EPUB… ; bouton ou glisser-déposer).
- **Module en cours** : le module « En cours » (sinon « À réviser », sinon le prochain à commencer) est mis en
  vedette en haut de la page et sur Aujourd'hui, avec **Continuer →** et ses cartes à réviser.
- Les pages manuscrites ont aussi un bouton **📎** : les documents joints s'affichent au-dessus de la feuille.
- **🃏 Réviser** : les cartes du jour, en répétition espacée. Une carte ratée revient dans la séance puis le
  lendemain ; une carte connue revient après 1, 3, 7, 14 puis 30 jours.

## Lanceur
L'onglet **Lanceur** ouvre tes applications : **Edge** et **Spotify** comme applications Windows
(🌐 = version web), **YouTube, Reddit, Facebook, Messenger** chacun dans sa propre fenêtre (un 2e clic
ramène la même fenêtre). **✎ Modifier** permet d'ajouter tes raccourcis (nom, adresse, emoji),
de les réordonner ou de les retirer. La 1re fois, Edge peut demander d'autoriser les fenêtres
pop-up ou l'ouverture de Spotify : accepte.

### Reddit → Cerveau (bouton « 🧠 Cerveau » sous les posts)
Quand Reddit est ouvert depuis le Lanceur, un bouton **🧠 Cerveau** apparaît sous chaque post.
Un clic enregistre le post comme note **Ressource** dans le Cerveau : titre, lien, subreddit,
auteur, date, texte du post et étiquettes `#reddit #nomdusubreddit`. Sauvegarder deux fois le
même post met la note à jour (pas de doublon). Si Life Planner est fermé, le post attend et
arrive à sa prochaine ouverture.

Une page web ne peut pas modifier Reddit : le bouton vient d'une petite extension Edge, dans
le dossier `extension-edge`. À installer une seule fois :
1. Dans Edge, ouvre `edge://extensions`.
2. Active **Mode développeur** (en bas à gauche).
3. Clique **Charger l'extension décompressée** et choisis le dossier `LifePlanner\extension-edge`.

Elle fonctionne avec la version locale (localhost:5173) et la version en ligne. Après une mise à
jour de l'extension, clique **Recharger** sur sa carte dans `edge://extensions`.

## Alarmes
Ouvre une mission (**›**) puis, dans **⏰ Alarme**, choisis une date et une heure, ou un raccourci :
« Dans 30 min », « Dans 1 h », « Demain 9 h », « Ce soir 19 h ». La mission affiche une pastille ⏰.
À l'heure dite, une fenêtre sonne (et une notification Windows apparaît si tu l'as autorisée) :
- **😴 Snooze** : 5 min, 10 min, 30 min ou 1 h ;
- **📅 Reporter** : demain ou une autre date — la mission change de jour et l'alarme garde la même heure ;
- **Arrêter l'alarme** ou **✓ Mission accomplie** (avec ses XP).
La notification Windows propose aussi « Snooze 10 min » et « Accomplie ».

⚠️ Une app web ne peut sonner que si **l'app ou le widget est ouvert** (même en arrière-plan).
Active **`Widget au demarrage.bat`** pour que le widget soit toujours là. Une alarme manquée
pendant que tout était fermé s'affiche à la prochaine ouverture. L'assistant sait aussi poser
une alarme (« rappelle-moi d'appeler le plombier demain à 14 h »).

## Découper une mission en étapes
Touche **›** à droite d'une mission pour l'ouvrir dans une fenêtre. Tu peux y :
- renommer la mission, la cocher, changer sa **date** ou son **objectif** ;
- ajouter des **étapes** (sous-missions) et les cocher une par une ; une barre montre l'avancement ;
  quand toutes les étapes sont faites, la mission se coche toute seule ;
- écrire des **notes** (détails, liens…) ;
- la supprimer (deux touches, pour éviter les erreurs).

Tout est enregistré au fur et à mesure. Ferme avec **Terminé**, **×**, Échap ou en touchant à côté.

Cela fonctionne partout : sur la page Aujourd'hui, dans la Semaine et dans le widget.

## Écrire avec le Surface Pen
- La **pression** du stylet change l'épaisseur du trait.
- **Retourne le stylet** (bout gomme) ou maintiens le **bouton latéral** pour gommer.
- **Défiler au doigt** : par défaut le doigt fait défiler la page (avec élan), même si tu gardes
  le stylet en main. **Rejet de la paume** : pendant que tu écris, tout toucher est ignoré, et quand
  le stylet survole l'écran, une paume posée (grande surface) est ignorée. Le bouton ✋ permet de
  dessiner au doigt.
- Stylo, surligneur, 6 couleurs, 3 épaisseurs, annuler/rétablir (Ctrl+Z / Ctrl+Y),
  « + Espace » pour agrandir la page, export PNG.
- **Images (comme OneNote)** : colle une image ou une capture (Ctrl + V), glisse-la sur la page ou
  touche **🖼 Image**. Elle se place sous l'encre : tu peux écrire et surligner par-dessus. Avec l'outil
  **Sélection** (flèche), glisse l'image pour la déplacer, tire le coin pour la redimensionner,
  × ou Suppr pour la retirer. Ctrl+Z annule aussi ces changements.
- **Clic droit** (souris) sur la page : **📋 Coller** (l'image va à l'endroit cliqué), **🖼 Ajouter une image…**,
  et sur une image : déplacer/redimensionner ou retirer. La 1re fois, Edge demande l'accès au presse-papiers.
  Le bouton latéral du stylet reste la gomme.
- Enregistrement automatique.

## Connecter Google Agenda (une seule fois, environ 5 min)
Les étapes détaillées se trouvent dans **Réglages**. En résumé :
1. Crée un projet sur https://console.cloud.google.com
2. Active **Google Calendar API**
3. Configure l'écran de consentement OAuth (*Externe*) et ajoute ton adresse Gmail comme utilisateur test
4. Crée un **ID client OAuth** de type *Application Web*, avec `http://localhost:5173` comme origine JavaScript autorisée
5. Colle l'ID client dans Réglages, puis clique sur **Connecter Google Agenda**

La connexion Google dure environ 1 heure. Ensuite, un bouton « Connecter Google Agenda »
réapparaît (en un clic). Pendant ce temps, les événements restent visibles grâce à la copie locale.

## Données
Tout est stocké localement dans Edge (IndexedDB). Utilise **Réglages → Exporter une sauvegarde**
régulièrement, par exemple vers ton OneDrive. Ne désinstalle pas l'app et n'efface pas les données
de site d'Edge sans sauvegarde.

## Structure
```
serve.ps1                 serveur local
Lancer Life Planner.bat   lanceur
app/index.html            interface
app/js/app.js             vues et navigation
app/js/brain.js           second cerveau (notes, liens, révisions)
app/js/game.js            XP, niveaux, badges, évolution
app/js/avatar.js          dessin de l'avatar
app/js/ink.js             moteur d'écriture manuscrite
app/js/gcal.js            synchronisation Google Agenda
app/js/db.js              stockage local (IndexedDB)
app/sw.js                 mode hors ligne
```
