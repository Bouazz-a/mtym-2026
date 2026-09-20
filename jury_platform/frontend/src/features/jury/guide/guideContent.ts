// ─────────────────────────────────────────────────────────────────────────
// Textes du guide du juré : la visite guidée (bulles) et l'aide-mémoire.
//
// Repris du « Guide du Jury, MTYM 2026 — Phase Régionale » (Comité
// d'Organisation, 5 septembre 2026) : durées du §5.5, rôles des §5.1 à 5.4,
// piliers du §1.1, évaluation du travail final du §3.2, poules du §4.1.
// Si le guide officiel change, tout le texte que voient les jurés est ici —
// le reste du code n'a pas à être touché.
//
// Dans les étapes : ne modifier que `title` et `text`. `anchor` désigne
// l'élément de l'écran mis en valeur (ne pas le changer) ; une étape sans
// anchor s'affiche au centre de l'écran.
// ─────────────────────────────────────────────────────────────────────────

// Incrémenter pour remontrer la visite à tous les jurés (ex. après une grosse
// mise à jour du guide).
export const GUIDE_VERSION = 1;

export interface GuideStep {
  anchor?: string;
  title: string;
  text: string;
  // Où poser la bulle, quand le placement automatique tombe mal (élément
  // très haut, par exemple). Laisser vide dans le doute.
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

// Partie 1 — sur « Mon planning »
export const PLANNING_STEPS: GuideStep[] = [
  {
    title: "Bienvenue sur la plateforme jury",
    text: "En deux minutes : où trouver vos passages, comment noter l'oral et le rapport écrit, puis un passage d'entraînement pour essayer. Vous pouvez quitter à tout moment et revoir ce guide depuis le menu de votre compte.",
  },
  {
    anchor: "day-picker",
    title: "Vos jours",
    text: "Si vous jugez plusieurs jours, choisissez le jour ici.",
  },
  {
    anchor: "planning",
    title: "Votre planning",
    text: "Votre journée, créneau par créneau, avec les pauses. « Libre » : votre duo ne juge pas à ce créneau.",
  },
  {
    anchor: "passage-card",
    title: "Un passage",
    text: "Environ une heure : la poule, la salle, le problème défendu et les trois équipes notées — DEF défend, OPP s'oppose, RAP rapporte. Dans une poule de 4, la quatrième équipe (OBS) reste hors de la salle et n'est pas notée.",
  },
  {
    anchor: "oral-button",
    title: "Noter l'oral",
    text: "Après le passage, notez les trois équipes. Le compteur indique combien de notes d'oral vous avez enregistrées (sur 3).",
  },
  {
    anchor: "report-button",
    title: "Noter le rapport écrit",
    text: "Le rapport du défenseur sur le problème qu'il défend. Lisez-le de préférence avant le passage : il éclaire le débat.",
  },
  {
    anchor: "account-menu",
    title: "Votre compte",
    text: "Changer votre mot de passe, revoir ce guide (« Guide du juré »), vous déconnecter.",
  },
  {
    anchor: "practice-button",
    title: "À vous d'essayer",
    text: "Un passage d'entraînement, avec des équipes fictives et les vraies grilles de notation : notez librement, rien n'est enregistré.",
  },
];

// Texte du dernier bouton de la partie 1 (il ouvre l'entraînement)
export const START_PRACTICE_LABEL = "Commencer l'entraînement";

// Partie 2 — sur le passage d'entraînement
export const PRACTICE_STEPS: GuideStep[] = [
  {
    title: "Passage d'entraînement",
    text: "Les équipes sont fictives et rien n'est enregistré : essayez tout ce que vous voulez.",
  },
  {
    anchor: "passage-info",
    title: "L'essentiel du passage",
    text: "L'horaire, la salle, votre binôme et l'équipe observatrice (elle n'est pas notée).",
  },
  {
    anchor: "memo",
    title: "L'aide-mémoire",
    text: "Les repères de notation, le déroulé d'un passage (10 min de défense, 8 d'opposition, 8 de rapport, 15 de questions du jury), les rôles et les règles de salle. Ouvrez-le pendant le passage.",
  },
  {
    anchor: "tabs",
    title: "Oral et rapport écrit",
    text: "Deux onglets. Ce que vous avez tapé est conservé quand vous passez de l'un à l'autre.",
  },
  {
    anchor: "grading-card",
    title: "Une grille par équipe",
    text: "Défenseur, opposant, rapporteur : chaque équipe est notée sur la grille de son rôle.",
  },
  {
    anchor: "score",
    title: "Le taux de réussite",
    text: "Pour chaque critère, un nombre de 0 à 1. Repères : 0 · 0,25 · 0,5 · 0,75 · 1 (leur sens est dans l'aide-mémoire). La note du critère = taux × coefficient.",
  },
  {
    anchor: "coef",
    title: "Coefficients et malus",
    text: "Chaque critère a son coefficient. Un coefficient négatif, en rouge, est un malus : 0 s'il ne s'applique pas, jusqu'à 1 s'il s'applique pleinement.",
  },
  {
    anchor: "comment",
    title: "Commentaires",
    text: "Un commentaire par critère et une remarque globale : ils sont attendus, surtout pour le rapport écrit, pour aider les équipes à progresser.",
  },
  {
    anchor: "note",
    title: "La note en direct",
    text: "Le total de la grille se met à jour pendant la saisie.",
  },
  {
    anchor: "save",
    title: "Enregistrer",
    text: "Rien n'est envoyé tant que vous n'avez pas cliqué. « Enregistré · 14:32 » confirme ; vous pourrez corriger ensuite (« Mettre à jour »). Chaque équipe s'enregistre séparément.",
  },
  {
    anchor: "report-viewer",
    side: "left",
    align: "start",
    title: "Le rapport du défenseur",
    text: "Sur un grand écran, le PDF s'affiche à côté de la grille : vous lisez et vous notez en même temps, et il suit la page quand vous faites défiler. Sur un petit écran, un bouton l'ouvre en plein écran. « Ouvrir dans un onglet » dans les deux cas. Suivez le barème du problème fourni par les concepteurs : seul le fond compte, pas la présentation.",
  },
  {
    title: "C'est tout : à vous de juger !",
    text: "Ce guide reste disponible dans le menu de votre compte (« Guide du juré »), et l'entraînement sur « Mon planning ».",
  },
];

// ─── Aide-mémoire (sur la page d'un passage) ─────────────────────────────

export const SCALE: { value: string; percent: string; meaning: string }[] = [
  { value: "0", percent: "0 %", meaning: "Non traité, ou entièrement faux, sans aucun élément juste." },
  { value: "0,25", percent: "25 %", meaning: "Incorrect, mais avec des pistes ou des idées exploitables." },
  { value: "0,5", percent: "50 %", meaning: "Partiellement traité : plusieurs éléments corrects, mais incomplets." },
  { value: "0,75", percent: "75 %", meaning: "Presque parfait : il manque un peu de rigueur ou une hypothèse essentielle." },
  { value: "1", percent: "100 %", meaning: "Complet, rigoureux et parfaitement rédigé." },
];

// Les quatre piliers du rôle de juré (§1.1)
export const PRINCIPLES: string[] = [
  "Le fond prime sur la forme : c'est le contenu mathématique et méthodologique qui est noté, pas la mise en page ni le LaTeX.",
  "Honnêteté scientifique : les phases de questions servent aussi à vérifier que les élèves maîtrisent ce qu'ils présentent ; toute aide extérieure à la résolution est interdite.",
  "Climat d'échange sain : le jury fait la police de la salle — agressivité, ton hautain, critique non constructive ou opposition excessive sont sanctionnés.",
  "Évaluation bienveillante et formative : le MTYM est une initiation à la recherche ; accompagnez chaque note de commentaires précis.",
  "Un doute, un imprévu ? Prévenez l'organisation.",
];

// Déroulé d'un passage en qualification régionale (§5.5) — ~63 min
export const TIMELINE: { step: string; duration: string }[] = [
  { step: "Présentation du jury, rappel des rôles et préparation", duration: "~2 min" },
  { step: "Présentation de la solution par le défenseur", duration: "10 min" },
  { step: "Questions de l'opposant au défenseur (avec réponses)", duration: "8 min" },
  { step: "Discours de l'opposant", duration: "1 min" },
  { step: "Réponse du défenseur (facultatif)", duration: "≤ 1 min" },
  { step: "Questions du rapporteur au défenseur et à l'opposant", duration: "8 min" },
  { step: "Discours du rapporteur", duration: "1 min" },
  { step: "Remarques finales du défenseur, puis de l'opposant (facultatif)", duration: "≤ 1 min chacun" },
  { step: "Questions et remarques du jury", duration: "15 min" },
  { step: "Délibération du jury et notation", duration: "15 min" },
  { step: "Durée totale estimée", duration: "~63 min" },
];

export const ROLES: { role: string; text: string }[] = [
  {
    role: "Défenseur · 10 min",
    text: "Présente une synthèse des résultats de son équipe — exemples, schémas, figures plutôt que longues démonstrations — puis répond aux questions. Il doit rester fidèle au rapport écrit : présenter des résultats majeurs non rédigés est interdit (seules de légères corrections signalées sont admises). À sanctionner : dépassement de temps significatif, résultats inédits, réponses évasives.",
  },
  {
    role: "Opposant · 8 min",
    text: "Relève erreurs, imprécisions et points forts par des questions ciblées, puis conclut par un récapitulatif honnête et bienveillant. Interdit : orienter le débat vers sa propre solution ou présenter ses propres résultats. Une opposition agressive ou excessive est sanctionnée.",
  },
  {
    role: "Rapporteur · 8 min",
    text: "Résume le débat de manière neutre, évalue la pertinence des questions de l'opposant et la clarté des réponses du défenseur, puis pose ses propres questions sur les points majeurs non abordés. À éviter : répéter les critiques de l'opposant, s'arrêter à des détails de forme, ou se substituer à l'opposant.",
  },
];

// Règle de l'intervenant unique au tableau (§5.1)
export const BOARD_RULE: string[] = [
  "Un seul représentant par équipe se rend au tableau.",
  "Les autres membres restent assis et lèvent la main pour intervenir, exceptionnellement.",
  "La parole ne leur est accordée que par leur représentant, et leurs interventions sont courtes.",
];

// Évaluation du travail final – version 1, le jour du tournoi (§3.2)
export const REPORT_RULES: string[] = [
  "Seul le rapport présenté par l'équipe ce jour-là est évalué.",
  "La note suit le barème du problème fourni par les concepteurs : question par question, critères et points.",
  "En cas de doute sur une réponse ou sur l'application du barème, se référer aux indications des concepteurs ou demander au responsable de l'évaluation.",
  "Les commentaires doivent justifier les points attribués et signaler toute difficulté rencontrée.",
];

export const QUESTIONS: string[] = [
  "Sur le sujet : jusqu'à quel point les participants l'ont-ils bien compris ?",
  "Sur le travail présenté : est-il le fruit de leur réflexion ? Les autres équipes l'ont-elles compris ?",
  "Questions ouvertes : peuvent-ils adapter leurs méthodes à de nouvelles questions ?",
];

// Poules et rotation des rôles (§4.1)
export const POOLS_NOTE =
  "Une poule = une journée, 3 ou 4 équipes. Les rôles tournent à chaque passage : dans une poule de 4, l'équipe sans rôle reste hors de la salle (elle n'est pas notée).";
