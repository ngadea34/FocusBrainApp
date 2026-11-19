/**
 * Textes de l'interface, en français et en anglais. Phrases courtes et concrètes,
 * sans jargon : l'application s'adresse aussi à des personnes pour qui une
 * interface chargée est fatigante.
 */
import type { EpisodeStatus } from "@app/contracts";
import type { KnownError } from "./api";

const fr = {
  appName: "Podcasts sur mesure",
  signIn: {
    title: "Connexion",
    intro: "Connecte-toi avec ton adresse e-mail et ton mot de passe.",
    email: "Adresse e-mail",
    password: "Mot de passe (8 caractères minimum)",
    signIn: "Se connecter",
    signUp: "Créer mon compte",
    toSignUp: "Pas encore de compte ? En créer un",
    toSignIn: "J'ai déjà un compte",
    checkEmail: "Compte créé. Ouvre l'e-mail reçu à {email} et touche le lien de confirmation, puis reviens ici pour te connecter.",
    invalidEmail: "Cette adresse e-mail n'a pas l'air valide.",
    shortPassword: "Le mot de passe doit faire au moins 8 caractères.",
    wrongCredentials: "E-mail ou mot de passe incorrect.",
    notConfirmed: "Ton adresse n'est pas encore confirmée. Touche le lien dans l'e-mail reçu.",
    rateLimited: "Trop de tentatives. Réessaie dans quelques minutes.",
  },
  library: {
    title: "Mes épisodes",
    empty: "Aucun épisode pour l'instant. Crée le premier : choisis un sujet, l'application s'occupe des recherches.",
    create: "Nouvel épisode",
    refresh: "Actualiser",
    signOut: "Se déconnecter",
  },
  create: {
    title: "Nouvel épisode",
    topic: "De quoi veux-tu entendre parler ?",
    topicHint: "Par exemple : pourquoi le ciel est bleu.",
    language: "Langue de l'épisode",
    duration: "Durée",
    minutes: "{n} min",
    approval: "Je veux valider le plan avant l'écriture",
    submit: "Créer l'épisode",
    cancel: "Annuler",
    tooShort: "Écris au moins quelques mots.",
  },
  episode: {
    back: "Retour",
    status: "État",
    progress: "{done} étapes terminées sur {total}",
    outline: "Plan proposé",
    approve: "Valider ce plan",
    cancel: "Arrêter la génération",
    retry: "Relancer",
    listen: "Écouter",
    noAudio: "L'audio n'est pas encore prêt.",
    sources: "Sources",
    noSources: "Les sources apparaîtront après la recherche.",
    tier: "Fiabilité {n}/6",
    waitingWorker: "En attente. La génération démarre dès qu'un serveur de génération est disponible.",
  },
  player: {
    play: "Lecture",
    pause: "Pause",
    back15: "Reculer de 15 s",
    forward15: "Avancer de 15 s",
    speed: "Vitesse",
    part: "Partie {i} sur {n}",
  },
  languages: { "fr-FR": "Français", "en-GB": "English" } as Record<string, string>,
  status: {
    draft: "Brouillon",
    queued: "En file d'attente",
    researching: "Recherche des sources",
    outlining: "Préparation du plan",
    awaiting_approval: "Plan à valider",
    writing: "Écriture",
    verifying: "Vérification des faits",
    synthesizing: "Enregistrement de la voix",
    assembling: "Montage",
    ready: "Prêt à écouter",
    failed: "Échec",
    cancelled: "Annulé",
  } satisfies Record<EpisodeStatus, string>,
  errors: {
    quota_exceeded: "Tu as atteint la limite d'épisodes de ce mois.",
    too_many_active_jobs: "Un épisode est déjà en cours. Attends qu'il soit prêt.",
    duration_not_allowed: "Cette durée n'est pas disponible avec ton offre.",
    no_plan_configured: "Ton compte n'a pas encore d'offre. Contacte le support.",
    invalid_state: "Cette action n'est pas possible pour le moment.",
    episode_not_found: "Épisode introuvable.",
    not_authenticated: "Ta session a expiré. Reconnecte-toi.",
    episode_locked: "Cet épisode ne peut plus être modifié.",
    unknown: "Un problème est survenu. Réessaie dans un instant.",
  } satisfies Record<KnownError, string>,
};

export type Dictionary = typeof fr;

const en: Dictionary = {
  appName: "Tailored podcasts",
  signIn: {
    title: "Sign in",
    intro: "Sign in with your email address and password.",
    email: "Email address",
    password: "Password (at least 8 characters)",
    signIn: "Sign in",
    signUp: "Create my account",
    toSignUp: "No account yet? Create one",
    toSignIn: "I already have an account",
    checkEmail: "Account created. Open the email sent to {email} and tap the confirmation link, then come back here to sign in.",
    invalidEmail: "This email address doesn't look valid.",
    shortPassword: "The password must be at least 8 characters long.",
    wrongCredentials: "Wrong email or password.",
    notConfirmed: "Your address isn't confirmed yet. Tap the link in the email you received.",
    rateLimited: "Too many attempts. Try again in a few minutes.",
  },
  library: {
    title: "My episodes",
    empty: "No episodes yet. Create your first one: pick a topic and the app does the research.",
    create: "New episode",
    refresh: "Refresh",
    signOut: "Sign out",
  },
  create: {
    title: "New episode",
    topic: "What would you like to hear about?",
    topicHint: "For example: why the sky is blue.",
    language: "Episode language",
    duration: "Length",
    minutes: "{n} min",
    approval: "Let me approve the outline before writing",
    submit: "Create episode",
    cancel: "Cancel",
    tooShort: "Write at least a few words.",
  },
  episode: {
    back: "Back",
    status: "Status",
    progress: "{done} of {total} steps done",
    outline: "Proposed outline",
    approve: "Approve this outline",
    cancel: "Stop generation",
    retry: "Try again",
    listen: "Listen",
    noAudio: "The audio isn't ready yet.",
    sources: "Sources",
    noSources: "Sources will appear after the research step.",
    tier: "Reliability {n}/6",
    waitingWorker: "Waiting. Generation starts as soon as a generation server is available.",
  },
  player: {
    play: "Play",
    pause: "Pause",
    back15: "Back 15 s",
    forward15: "Forward 15 s",
    speed: "Speed",
    part: "Part {i} of {n}",
  },
  languages: { "fr-FR": "Français", "en-GB": "English" },
  status: {
    draft: "Draft",
    queued: "Queued",
    researching: "Finding sources",
    outlining: "Preparing the outline",
    awaiting_approval: "Outline to approve",
    writing: "Writing",
    verifying: "Checking facts",
    synthesizing: "Recording the voice",
    assembling: "Editing",
    ready: "Ready to listen",
    failed: "Failed",
    cancelled: "Cancelled",
  },
  errors: {
    quota_exceeded: "You have reached this month's episode limit.",
    too_many_active_jobs: "An episode is already in progress. Wait until it is ready.",
    duration_not_allowed: "This length isn't available on your plan.",
    no_plan_configured: "Your account has no plan yet. Contact support.",
    invalid_state: "This action isn't possible right now.",
    episode_not_found: "Episode not found.",
    not_authenticated: "Your session has expired. Sign in again.",
    episode_locked: "This episode can no longer be changed.",
    unknown: "Something went wrong. Try again in a moment.",
  },
};

export const DICTIONARIES = { fr, en } as const;
export type UiLanguage = keyof typeof DICTIONARIES;

/** Langue de l'interface à partir des préférences du téléphone (BCP 47). Français par défaut. */
export function uiLanguageFor(tags: readonly string[]): UiLanguage {
  for (const t of tags) {
    const lang = t.toLowerCase().split("-")[0];
    if (lang === "fr" || lang === "en") return lang;
  }
  return "fr";
}

/** Langue d'épisode proposée par défaut, alignée sur l'interface. */
export function defaultOutputLocale(ui: UiLanguage): string {
  return ui === "fr" ? "fr-FR" : "en-GB";
}

export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}
