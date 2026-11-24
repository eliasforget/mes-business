import React from 'react';
import { AbsoluteFill, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { TEXTE, TITRE } from './polices';
import { COULEURS, FPS } from './theme';

/** Compilation 16:9 (YouTube) de Shorts verticaux déjà rendus : chaque Short au centre, sur un fond flouté de lui-même. */
export type ProprietesCompilation = {
  videos: { src: string; duree: number; titre: string }[];
  marque: { nom: string; accent: string };
  /** Habillage (lu au chargement par theme.ts via getInputProps). */
  theme?: string;
};

export const dureeCompilation = (videos: ProprietesCompilation['videos']): number =>
  videos.reduce((s, v) => s + Math.max(1, Math.round(v.duree * FPS)), 0);

const Chapitre: React.FC<{ n: number; titre: string; marque: ProprietesCompilation['marque'] }> = ({ n, titre, marque }) => {
  const frame = useCurrentFrame();
  const opacite = interpolate(frame, [0, 10, 4 * FPS, 4.6 * FPS], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const glisse = interpolate(frame, [0, 12], [-40, 0], { extrapolateRight: 'clamp' });
  return (
    <>
      <div style={{ position: 'absolute', left: 70, top: 70, maxWidth: 560, opacity: opacite, transform: `translateX(${glisse}px)` }}>
        <div style={{ fontFamily: TITRE, fontSize: 34, letterSpacing: 2, color: COULEURS.menthe }}>PARTIE {n}</div>
        <div style={{ fontFamily: TEXTE, fontWeight: 800, fontSize: 44, lineHeight: 1.15, color: COULEURS.blanc, textShadow: '0 4px 24px rgba(0,0,0,.6)' }}>{titre}</div>
      </div>
      <div style={{ position: 'absolute', right: 70, bottom: 60, fontFamily: TITRE, fontSize: 40, letterSpacing: 2, color: COULEURS.blanc, opacity: 0.85 }}>
        {marque.nom} <span style={{ color: COULEURS.orange }}>{marque.accent}</span>
      </div>
    </>
  );
};

export const Compilation: React.FC<ProprietesCompilation> = ({ videos, marque }) => {
  let depart = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: COULEURS.nuit }}>
      {videos.map((v, i) => {
        const from = depart;
        const duree = Math.max(1, Math.round(v.duree * FPS));
        depart += duree;
        return (
          <Sequence key={i} from={from} durationInFrames={duree}>
            <AbsoluteFill style={{ overflow: 'hidden' }}>
              <OffthreadVideo src={staticFile(v.src)} muted style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(36px) brightness(0.45) saturate(1.2)', transform: 'scale(1.15)' }} />
            </AbsoluteFill>
            <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
              <OffthreadVideo src={staticFile(v.src)} style={{ height: '100%', width: 'auto', aspectRatio: '9 / 16', boxShadow: '0 0 90px rgba(0,0,0,.65)' }} />
            </AbsoluteFill>
            <Chapitre n={i + 1} titre={v.titre} marque={marque} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
