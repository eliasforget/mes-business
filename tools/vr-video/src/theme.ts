import { getInputProps } from 'remotion';
import { theme } from './themes';

// Habillage de la vidéo en cours de rendu : lu une fois au chargement, depuis les props du rendu
// (« theme » vient du script.json). Dans le studio, sans props : Vice Radar.
const props = (() => {
  try {
    return getInputProps() as { theme?: string };
  } catch {
    return {};
  }
})();

export const THEME = theme(props.theme);
export const COULEURS = THEME.couleurs;

export const DEGRADE_TITRE = `linear-gradient(180deg, ${COULEURS.orange} 10%, ${COULEURS.rose} 95%)`;

/** Couleurs d'accent des sous-titres, utilisées à tour de rôle. */
export const ACCENTS = [COULEURS.menthe, COULEURS.orange, COULEURS.rose];

export const LARGEUR = 1080;
export const HAUTEUR = 1920;
export const FPS = 30;
