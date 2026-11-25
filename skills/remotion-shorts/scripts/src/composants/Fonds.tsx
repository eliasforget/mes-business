import React from 'react';
import { AbsoluteFill, Easing, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { SegmentFond } from '../plan';
import { COULEURS } from '../theme';

/** Générateur pseudo-aléatoire déterministe (même rendu à chaque fois). */
function aleatoire(graine: number) {
  let s = graine >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const r = aleatoire(42);
const ETOILES = Array.from({ length: 60 }, () => ({ x: r() * 100, y: r() * 100, taille: 1.5 + r() * 3, phase: r() * Math.PI * 2 }));

/** Décor animé sans clip : dégradé, halos qui respirent, points lumineux, sol quadrillé qui défile. Jamais figé. */
export const FondAnime: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const halo = 0.55 + 0.15 * Math.sin(t * 1.3);

  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${COULEURS.nuit} 0%, ${COULEURS.marine} 50%, ${COULEURS.nuit} 100%)` }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 36%, ${COULEURS.bleu} 0%, transparent ${48 + 8 * halo}%)`, opacity: halo }} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${30 + 20 * Math.sin(t * 0.6)}% ${72 + 6 * Math.cos(t * 0.8)}%, ${COULEURS.rose}55 0%, transparent 38%)`,
        }}
      />
      {ETOILES.map((e, i) => (
        <div
          key={i}
          style={{
            position: 'absolute', left: `${e.x}%`, top: `${e.y}%`, width: e.taille, height: e.taille, borderRadius: '50%',
            background: 'white', opacity: 0.2 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + e.phase)),
          }}
        />
      ))}
      {/* Sol quadrillé en perspective */}
      <div style={{ position: 'absolute', left: -540, right: -540, top: 1480, height: 800, perspective: 600, overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute', inset: 0, transformOrigin: '50% 0%', transform: 'rotateX(62deg)',
            backgroundImage: `linear-gradient(${COULEURS.menthe}66 2px, transparent 2px), linear-gradient(90deg, ${COULEURS.menthe}44 2px, transparent 2px)`,
            backgroundSize: '90px 90px', backgroundPosition: `0 ${(t * 120) % 90}px`,
          }}
        />
      </div>
      <AbsoluteFill style={{ background: `linear-gradient(180deg, transparent 80%, ${COULEURS.nuit}e6 100%)` }} />
    </AbsoluteFill>
  );
};

/** Un plan vidéo : léger zoom continu (effet « Ken Burns ») + entrée en « punch » pour marquer la coupe. */
const PlanClip: React.FC<{ segment: SegmentFond; index: number }> = ({ segment, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const duree = Math.max(1, Math.round((segment.fin - segment.debut) * fps));
  const zoom = interpolate(frame, [0, duree], [1.1, 1.22], { extrapolateRight: 'clamp' });
  const punch = interpolate(frame, [0, 6], [1.18, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const derive = (index % 2 === 0 ? 1 : -1) * interpolate(frame, [0, duree], [-20, 20]);
  return (
    <AbsoluteFill>
      <OffthreadVideo
        src={staticFile(segment.clip!)}
        startFrom={Math.round(segment.depuis * fps)}
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom * punch}) translateX(${derive}px)` }}
      />
    </AbsoluteFill>
  );
};

/** Fonds de la vidéo : décor animé en permanence, clips par-dessus, teinte sombre pour garder le texte lisible. */
export const Fonds: React.FC<{ segments: SegmentFond[] }> = ({ segments }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const avecClips = segments.some((s) => s.clip);
  return (
    <AbsoluteFill>
      <FondAnime />
      {segments.map((s, i) => {
        const de = Math.round(s.debut * fps);
        const duree = Math.max(1, Math.round(s.fin * fps) - de);
        return s.clip ? (
          <Sequence key={i} from={de} durationInFrames={duree} layout="none">
            <PlanClip segment={s} index={i} />
          </Sequence>
        ) : null;
      })}
      {avecClips && (
        <AbsoluteFill
          style={{ background: `linear-gradient(180deg, ${COULEURS.nuit}d1 0%, ${COULEURS.marine}73 38%, ${COULEURS.marine}59 55%, ${COULEURS.nuit}e0 100%)` }}
        />
      )}
      {/* Flash bref à chaque changement de plan : la coupe se voit, l'œil reste accroché. */}
      {segments.slice(1).map((s, i) => {
        const de = Math.round(s.debut * fps);
        const o = interpolate(frame, [de, de + 5], [0.22, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return frame >= de && frame < de + 5 ? <AbsoluteFill key={i} style={{ background: 'white', opacity: o }} /> : null;
      })}
      <AbsoluteFill style={{ boxShadow: 'inset 0 0 220px rgba(0,0,0,0.65)' }} />
    </AbsoluteFill>
  );
};
