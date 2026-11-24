/**
 * Habillages des chaînes. Fichier pur (aucune dépendance) : lu par le rendu (Node) et par Remotion.
 * Une vidéo choisit le sien avec « "theme": "faits-animes" » dans son script.json (défaut : vice-radar).
 */

export interface Couleurs {
  nuit: string; // fond
  marine: string; // fond secondaire, texte sur pastille claire
  bleu: string;
  blanc: string; // texte
  menthe: string; // accent 1 (sous-titres, pastilles)
  orange: string; // accent 2, début du dégradé des gros titres
  rose: string; // accent 3, fin du dégradé, halos
}

export interface Theme {
  /** Nom lisible de la chaîne (logs, dossier « À publier »). */
  chaine: string;
  couleurs: Couleurs;
  /** Logo en haut de l'image : « NOM » + « ACCENT » en couleur. */
  marque: { nom: string; accent: string };
}

export const THEMES = {
  'vice-radar': {
    chaine: 'Vice Radar',
    couleurs: { nuit: '#070a1f', marine: '#0d1238', bleu: '#1a2470', blanc: '#ffffff', menthe: '#3de0c0', orange: '#ff9a3c', rose: '#ff3d7f' },
    marque: { nom: 'VICE', accent: 'RADAR' },
  },
  'faits-animes': {
    chaine: 'Faits animés',
    couleurs: { nuit: '#0b1220', marine: '#16223a', bleu: '#1e2f52', blanc: '#f5f7fa', menthe: '#22d3ee', orange: '#fbbf24', rose: '#f97316' },
    marque: { nom: 'FAITS', accent: 'ANIMÉS' },
  },
} satisfies Record<string, Theme>;

export type NomTheme = keyof typeof THEMES;
export const THEME_PAR_DEFAUT: NomTheme = 'vice-radar';

export function estTheme(nom: unknown): nom is NomTheme {
  return typeof nom === 'string' && Object.hasOwn(THEMES, nom);
}

/** Thème d'un nom (inconnu ou absent → Vice Radar). */
export function theme(nom: unknown): Theme {
  return THEMES[estTheme(nom) ? nom : THEME_PAR_DEFAUT];
}
