// Polices embarquées (paquets npm @fontsource) : le rendu marche hors ligne et donne toujours le même résultat.
import { continueRender, delayRender } from 'remotion';
import anton from '@fontsource/anton/files/anton-latin-400-normal.woff2';
import inter800 from '@fontsource/inter/files/inter-latin-800-normal.woff2';
import inter900 from '@fontsource/inter/files/inter-latin-900-normal.woff2';

// Sous-ensemble « latin » : couvre tout le français, y compris œ/Œ (U+0152-0153).
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

export const TITRE = '"Anton", "Impact", sans-serif';
export const TEXTE = '"Inter", "Segoe UI", sans-serif';

const attente = delayRender('Chargement des polices');
Promise.all([
  new FontFace('Anton', `url(${anton}) format("woff2")`, { weight: '400', unicodeRange: LATIN }).load(),
  new FontFace('Inter', `url(${inter800}) format("woff2")`, { weight: '800', unicodeRange: LATIN }).load(),
  new FontFace('Inter', `url(${inter900}) format("woff2")`, { weight: '900', unicodeRange: LATIN }).load(),
])
  .then((faces) => {
    faces.forEach((f) => (document.fonts as unknown as Set<FontFace>).add(f));
    continueRender(attente);
  })
  .catch((err) => {
    console.error('Polices non chargées, police de secours utilisée', err);
    continueRender(attente);
  });
