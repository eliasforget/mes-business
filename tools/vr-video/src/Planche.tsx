import React from 'react';
import { AbsoluteFill, OffthreadVideo, staticFile } from 'remotion';
import './polices';
import { TEXTE, TITRE } from './polices';
import { FPS } from './theme';

/**
 * Planche contact d'une capture de jeu : une image par seconde du passage gardé, avec la seconde de la
 * vidéo finale sous chaque image. L'Agent web la regarde pour écrire les commentaires calés sur le jeu.
 */
export type ProprietesPlanche = {
  src: string | null;
  /** Début du passage gardé dans la capture (s), durée (s) et écart entre deux images (s). */
  depuis: number;
  duree: number;
  pas: number;
  titre: string;
};

export const COLONNES = 6;
export const TUILE = { l: 320, h: 180, legende: 34 };
const ENTETE = 70;

export function nombreImages(duree: number, pas: number): number {
  return Math.max(1, Math.floor(duree / pas) + 1);
}

export function taillePlanche(duree: number, pas: number): { largeur: number; hauteur: number } {
  const lignes = Math.ceil(nombreImages(duree, pas) / COLONNES);
  return { largeur: COLONNES * TUILE.l, hauteur: ENTETE + lignes * (TUILE.h + TUILE.legende) };
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const Planche: React.FC<ProprietesPlanche> = ({ src, depuis, duree, pas, titre }) => {
  const n = nombreImages(duree, pas);
  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0d1a', color: '#fff' }}>
      <div style={{ height: ENTETE, display: 'flex', alignItems: 'center', padding: '0 24px', fontFamily: TITRE, fontSize: 38, letterSpacing: 1 }}>
        {titre} · {Math.round(duree)} s · une image toutes les {pas} s
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLONNES}, ${TUILE.l}px)` }}>
        {Array.from({ length: n }, (_, k) => {
          const t = Math.min(duree - 0.05, k * pas);
          return (
            <div key={k} style={{ width: TUILE.l, height: TUILE.h + TUILE.legende }}>
              <div style={{ width: TUILE.l, height: TUILE.h, background: '#222', overflow: 'hidden' }}>
                {src && <OffthreadVideo src={staticFile(src)} startFrom={Math.round((depuis + t) * FPS)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ height: TUILE.legende, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: TEXTE, fontWeight: 800, fontSize: 24 }}>
                {mmss(t)} ({t.toFixed(0)} s)
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
