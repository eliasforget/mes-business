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
const ETOILES = Array.from({ length: 70 }, () => ({ x: r() * 100, y: r() * 55, taille: 1.5 + r() * 3, phase: r() * Math.PI * 2 }));
const IMMEUBLES = (() => {
  const g = aleatoire(7);
  const liste: { x: number; l: number; h: number; fenetres: { x: number; y: number; phase: number }[] }[] = [];
  let x = -40;
  while (x < 1120) {
    const l = 50 + g() * 110;
    const h = 120 + g() * 320;
    const fenetres = Array.from({ length: Math.floor(g() * 9) }, () => ({ x: 8 + g() * (l - 22), y: 14 + g() * (h - 40), phase: g() * 10 }));
    liste.push({ x, l, h, fenetres });
    x += l + 6 + g() * 14;
  }
  return liste;
})();

/** Décor synthwave animé : ciel, étoiles, soleil rayé, ville en parallaxe, sol quadrillé qui défile. */
export const FondSynthwave: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const halo = 0.55 + 0.15 * Math.sin(t * 1.3);
  const decalageRayures = (t * 18) % 40;

  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${COULEURS.nuit} 0%, ${COULEURS.marine} 45%, #1b1450 70%, ${COULEURS.nuit} 100%)` }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 38%, rgba(70,90,255,${halo * 0.45}) 0%, transparent 55%)` }} />
      {ETOILES.map((e, i) => (
        <div
          key={i}
          style={{
            position: 'absolute', left: `${e.x}%`, top: `${e.y}%`, width: e.taille, height: e.taille, borderRadius: '50%',
            background: 'white', opacity: 0.25 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 + e.phase)),
          }}
        />
      ))}
      {/* Soleil rayé */}
      <div
        style={{
          position: 'absolute', left: '50%', top: 1130, width: 520, height: 520, borderRadius: '50%',
          transform: `translate(-50%, -50%) scale(${1 + 0.03 * Math.sin(t * 0.9)})`,
          background: `linear-gradient(180deg, ${COULEURS.orange} 0%, ${COULEURS.rose} 60%, #9b2bd1 100%)`,
          WebkitMaskImage: `repeating-linear-gradient(180deg, black 0px, black ${22}px, transparent ${22}px, transparent ${40}px)`,
          WebkitMaskPosition: `0 ${-decalageRayures}px`,
          opacity: 0.85,
          filter: 'drop-shadow(0 0 60px rgba(255,61,127,0.55))',
        }}
      />
      {/* Ville en parallaxe */}
      <svg width={1080} height={560} style={{ position: 'absolute', left: 0, top: 1080, transform: `translateX(${-((t * 12) % 40)}px)` }}>
        {IMMEUBLES.map((b, i) => (
          <g key={i} transform={`translate(${b.x}, ${560 - b.h})`}>
            <rect width={b.l} height={b.h} fill="#0a0d2a" />
            {b.fenetres.map((f, j) => (
              <rect key={j} x={f.x} y={f.y} width={10} height={14} fill={j % 3 === 0 ? COULEURS.orange : '#ffd27a'}
                opacity={0.35 + 0.5 * (Math.sin(t * 1.7 + f.phase) > 0.2 ? 1 : 0.2)} />
            ))}
          </g>
        ))}
      </svg>
      {/* Sol quadrillé en perspective */}
      <div style={{ position: 'absolute', left: -540, right: -540, top: 1630, height: 700, perspective: 600, overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute', inset: 0, transformOrigin: '50% 0%', transform: 'rotateX(62deg)',
            backgroundImage: `linear-gradient(${COULEURS.rose}88 2px, transparent 2px), linear-gradient(90deg, ${COULEURS.rose}66 2px, transparent 2px)`,
            backgroundSize: '90px 90px', backgroundPosition: `0 ${(t * 120) % 90}px`,
          }}
        />
      </div>
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, transparent 80%, rgba(7,10,31,0.9) 100%)' }} />
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

/** Fonds de la vidéo : décor synthwave en permanence, clips par-dessus, teinte marine pour garder le texte lisible. */
export const Fonds: React.FC<{ segments: SegmentFond[] }> = ({ segments }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const avecClips = segments.some((s) => s.clip);
  return (
    <AbsoluteFill>
      <FondSynthwave />
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
          style={{
            background: `linear-gradient(180deg, rgba(7,10,31,0.82) 0%, rgba(13,18,56,0.45) 38%, rgba(13,18,56,0.35) 55%, rgba(7,10,31,0.88) 100%)`,
            mixBlendMode: 'normal',
          }}
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
