import React from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import './polices';
import { AppelAction, BarreProgression, Logo, SousTitres, tailleGros } from './composants/Textes';
import type { PlanVideo, ScenePlanifiee } from './plan';
import { TEXTE, TITRE } from './polices';
import { COULEURS, DEGRADE_TITRE } from './theme';

// « type » plutôt qu'« interface » : Remotion exige des props compatibles avec Record<string, unknown>.
export type ProprietesViceRadarJeu = {
  plan: PlanVideo;
  /** Capture de jeu (chemin dans public/), ou null pour l'aperçu du studio (fond uni). */
  gameplay: { src: string; depuis: number; cadrage: 'flou' | 'remplir' } | null;
  /** Voix off de l'accroche (chemin dans public/), ou null. */
  audio: string | null;
  musique: string | null;
  volumeMusique: number;
  /** Volume du jeu une fois l'accroche finie, et pendant que la voix parle. */
  volumeJeu: number;
  volumeJeuSousVoix: number;
  /** Fin de la voix, en secondes : le son du jeu remonte après. */
  finVoix: number;
  marque: { nom: string; accent: string };
  appelAction: string | null;
  barreProgression: boolean;
  theme?: string;
};

const CONTOUR = '0 6px 24px rgba(0,0,0,0.6)';
/** Zone de jeu en mode « flou » : toute la largeur, 760 px de haut (l'image 16:9 perd ~10 % de chaque côté). */
const JEU_HAUT = 600;
const JEU_HAUTEUR = 760;

const STYLES: Record<string, React.CSSProperties> = {
  normal: { fontFamily: TITRE, fontSize: 100, lineHeight: 1, color: COULEURS.blanc, textTransform: 'uppercase', textShadow: CONTOUR },
  gros: {
    fontFamily: TITRE, lineHeight: 0.98, textTransform: 'uppercase', backgroundImage: DEGRADE_TITRE,
    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 0 30px rgba(255,61,127,0.45))',
  },
  accent: { fontFamily: TEXTE, fontWeight: 900, fontSize: 58, lineHeight: 1.15, color: COULEURS.menthe, textShadow: CONTOUR },
  petit: { fontFamily: TEXTE, fontWeight: 800, fontSize: 50, lineHeight: 1.18, color: COULEURS.blanc, textShadow: CONTOUR },
};

/**
 * La question de l'expérience, en haut, visible pendant toute la vidéo : c'est elle qui fait rester jusqu'au
 * bout. Déjà en place à l'image 0 (la première image vue dans le flux), puis elle « respire ».
 */
const TitreHaut: React.FC<{ scene: ScenePlanifiee }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entree = (i: number) => Math.max(spring({ frame: frame - i * 3, fps, config: { damping: 13, stiffness: 190 } }), interpolate(frame, [0, 8], [0.85, 1], { extrapolateRight: 'clamp' }));
  let n = 0;
  const ligne = (contenu: React.ReactNode, cle: string) => {
    const p = entree(n++);
    return <div key={cle} style={{ opacity: Math.min(1, p * 1.3), transform: `translateY(${(1 - p) * 50}px) scale(${0.9 + 0.1 * p})` }}>{contenu}</div>;
  };
  return (
    <div style={{
      position: 'absolute', top: 165, left: 60, right: 60, height: JEU_HAUT - 195, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 4,
      transform: `scale(${1 + 0.02 * Math.sin((frame / fps) * 1.6)})`,
    }}>
      {scene.tag && ligne(
        <div style={{
          fontFamily: TITRE, fontSize: 40, letterSpacing: 2, color: COULEURS.marine, background: COULEURS.menthe,
          padding: '5px 20px', borderRadius: 14, marginBottom: 14, boxShadow: '0 8px 30px rgba(61,224,192,0.35)',
        }}>
          {scene.tag}
        </div>, 'tag')}
      {(scene.lignes ?? []).map((l, i) => ligne(
        <div style={l.style === 'gros' ? { ...STYLES.gros, fontSize: tailleGros(l.texte, 160) } : STYLES[l.style ?? 'normal']}>{l.texte}</div>, `l${i}`))}
    </div>
  );
};

export const ViceRadarJeu: React.FC<ProprietesViceRadarJeu> = ({
  plan, gameplay, audio, musique, volumeMusique, volumeJeu, volumeJeuSousVoix, finVoix, marque, appelAction, barreProgression,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const scene = plan.scenes[0]!;
  const remplir = gameplay?.cadrage === 'remplir';
  const depuis = gameplay ? Math.round(gameplay.depuis * fps) : 0;
  // Le son du jeu reste bas sous la voix, puis remonte en 0,4 s.
  const remontee = Math.round((finVoix + 0.25) * fps);
  const volume = (f: number) => interpolate(f, [remontee, remontee + Math.round(0.4 * fps)], [volumeJeuSousVoix, volumeJeu], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const debutAppel = Math.max(Math.round(finVoix * fps) + fps, durationInFrames - Math.round(3.5 * fps));

  return (
    <AbsoluteFill style={{ backgroundColor: COULEURS.nuit }}>
      {gameplay && !remplir && (
        <>
          {/* Fond : la même image, agrandie et floutée. */}
          <AbsoluteFill style={{ overflow: 'hidden' }}>
            <OffthreadVideo src={staticFile(gameplay.src)} startFrom={depuis} muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.3)', filter: 'blur(38px) brightness(0.45) saturate(1.2)' }} />
          </AbsoluteFill>
          <div style={{ position: 'absolute', top: JEU_HAUT, left: 0, width: '100%', height: JEU_HAUTEUR, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <OffthreadVideo src={staticFile(gameplay.src)} startFrom={depuis} volume={volume}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ position: 'absolute', top: JEU_HAUT - 6, left: 0, width: '100%', height: 6, background: `linear-gradient(90deg, ${COULEURS.menthe}, ${COULEURS.orange}, ${COULEURS.rose})` }} />
          <div style={{ position: 'absolute', top: JEU_HAUT + JEU_HAUTEUR, left: 0, width: '100%', height: 6, background: `linear-gradient(90deg, ${COULEURS.rose}, ${COULEURS.orange}, ${COULEURS.menthe})` }} />
        </>
      )}
      {gameplay && remplir && (
        <>
          <AbsoluteFill>
            <OffthreadVideo src={staticFile(gameplay.src)} startFrom={depuis} volume={volume} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </AbsoluteFill>
          {/* Assombrit le haut et le bas pour que le titre et les sous-titres restent lisibles. */}
          <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(7,10,31,0.85) 0%, rgba(7,10,31,0.35) 30%, transparent 45%, transparent 62%, rgba(7,10,31,0.7) 85%)' }} />
        </>
      )}

      <TitreHaut scene={scene} />
      <SousTitres groupes={plan.sousTitres} haut={remplir ? 1310 : JEU_HAUT + JEU_HAUTEUR + 40} />

      {appelAction && (
        <Sequence from={debutAppel} layout="none">
          <AppelAction texte={appelAction} />
        </Sequence>
      )}

      <Logo nom={marque.nom} accent={marque.accent} />
      {barreProgression && <BarreProgression dureeFrames={durationInFrames} />}

      {audio && <Audio src={staticFile(audio)} />}
      {musique && volumeMusique > 0 && (
        <Audio
          src={staticFile(musique)}
          loop
          volume={(f) => volumeMusique * interpolate(f, [0, 10, durationInFrames - fps, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
        />
      )}
    </AbsoluteFill>
  );
};
