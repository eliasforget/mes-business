// Identité Vice Radar, reprise des vidéos existantes.
export const COULEURS = {
  nuit: '#070a1f',
  marine: '#0d1238',
  bleu: '#1a2470',
  blanc: '#ffffff',
  menthe: '#3de0c0',
  orange: '#ff9a3c',
  rose: '#ff3d7f',
};

export const DEGRADE_TITRE = `linear-gradient(180deg, ${COULEURS.orange} 10%, ${COULEURS.rose} 95%)`;

/** Couleurs d'accent des sous-titres, utilisées à tour de rôle. */
export const ACCENTS = [COULEURS.menthe, COULEURS.orange, COULEURS.rose];

export const LARGEUR = 1080;
export const HAUTEUR = 1920;
export const FPS = 30;
