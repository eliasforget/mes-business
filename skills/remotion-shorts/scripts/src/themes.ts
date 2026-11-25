/**
 * Habillage de la vidéo. Fichier pur (aucune dépendance) : lu par le rendu (Node) et par Remotion.
 * Un seul thème fourni, « defaut » ; une vidéo peut changer chaque couleur avec « couleurs » dans son script.json.
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
  couleurs: Couleurs;
  /** Logo par défaut : « NOM » + « ACCENT » en couleur. */
  marque: { nom: string; accent: string };
}

export const THEMES = {
  defaut: {
    couleurs: { nuit: '#0b0f19', marine: '#131a2b', bleu: '#1f2a44', blanc: '#ffffff', menthe: '#a3e635', orange: '#facc15', rose: '#fb7185' },
    marque: { nom: 'MA', accent: 'CHAINE' },
  },
} satisfies Record<string, Theme>;

export type NomTheme = keyof typeof THEMES;
export const THEME_PAR_DEFAUT: NomTheme = 'defaut';

export function estTheme(nom: unknown): nom is NomTheme {
  return typeof nom === 'string' && Object.hasOwn(THEMES, nom);
}

/** Thème d'un nom (inconnu ou absent : « defaut »), avec les couleurs éventuellement remplacées. */
export function theme(nom: unknown, couleurs?: Partial<Couleurs>): Theme {
  const base = THEMES[estTheme(nom) ? nom : THEME_PAR_DEFAUT];
  return { ...base, couleurs: { ...base.couleurs, ...couleurs } };
}
