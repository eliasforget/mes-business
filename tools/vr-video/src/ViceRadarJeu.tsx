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
  /** Phrases de la voix calées sur le jeu : un fichier audio chacune, joué à partir de « depuis » (s). */
  commentaires?: { src: string; depuis: number }[];
  /** Moments où la voix parle (accroche + commentaires) : le son du jeu baisse dessous. */
  intervallesVoix?: { debut: number; fin: number }[];
  /** Débuts (s) des phrases marquées « zoom » : léger zoom sur le jeu pendant ~2,5 s. */
  zooms?: number[];
  /** Texte du chrono affiché sur le jeu (ex. « sans se faire écraser »), ou null. */
  chrono?: string | null;
  /** Accroche qui montre la suite : le moment fort (seconde `a` du passage) pendant `duree` s au tout début. */
  teaser?: { a: number; duree: number } | null;
  /** Raison de s'abonner sous l'appel à commenter. */
  appelSuite?: string | null;
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

/** 0 → 1 : force du zoom à l'instant t (montée 0,35 s, tenue ~2,2 s, retour 0,45 s), le plus fort des zooms. */
export function forceZoom(t: number, zooms: number[]): number {
  let k = 0;
  for (const z of zooms) {
    const d = t - z + 0.1;
    if (d < 0 || d > 3) continue;
    k = Math.max(k, d < 0.35 ? d / 0.35 : d < 2.55 ? 1 : 1 - (d - 2.55) / 0.45);
  }
  return Math.max(0, Math.min(1, k));
}

/** Volume du jeu : bas pendant que la voix parle, remonte en ~0,35 s entre deux phrases. */
export function niveauJeu(t: number, intervalles: { debut: number; fin: number }[], haut: number, bas: number): number {
  let d = Infinity;
  for (const i of intervalles) {
    if (t >= i.debut - 0.15 && t <= i.fin + 0.25) return bas;
    d = Math.min(d, t < i.debut ? i.debut - 0.15 - t : t - i.fin - 0.25);
  }
  const k = Math.max(0, Math.min(1, d / 0.35));
  return bas + (haut - bas) * k;
}

/** Le moment fort montré en ouverture (« tout à l'heure… »), puis flash blanc avant de revenir au début. */
const Teaser: React.FC<{ src: string; debut: number; duree: number }> = ({ src, debut, duree }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const flash = interpolate(frame, [duree - 5, duree - 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <OffthreadVideo src={staticFile(src)} startFrom={debut} muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.08 + 0.04 * (frame / Math.max(1, duree))})` }} />
      <div style={{
        position: 'absolute', top: 24, left: 24, padding: '8px 18px', borderRadius: 14, background: COULEURS.rose, color: COULEURS.blanc,
        fontFamily: TEXTE, fontWeight: 900, fontSize: 34, letterSpacing: 1, opacity: Math.floor(frame / (fps / 4)) % 2 ? 0.85 : 1,
      }}>TOUT À L’HEURE…</div>
      <AbsoluteFill style={{ background: COULEURS.blanc, opacity: flash }} />
    </AbsoluteFill>
  );
};

const Chrono: React.FC<{ texte: string; haut: number }> = ({ texte, haut }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = Math.floor(frame / fps);
  return (
    <div style={{
      position: 'absolute', top: haut, right: 28, display: 'flex', alignItems: 'baseline', gap: 12, padding: '10px 20px', borderRadius: 18,
      background: 'rgba(7,10,31,0.72)', border: `3px solid ${COULEURS.menthe}`, boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
    }}>
      <span style={{ fontFamily: TITRE, fontSize: 64, lineHeight: 1, color: COULEURS.blanc, fontVariantNumeric: 'tabular-nums' }}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>
      <span style={{ fontFamily: TEXTE, fontWeight: 800, fontSize: 30, color: COULEURS.menthe, maxWidth: 360 }}>{texte}</span>
    </div>
  );
};

export const ViceRadarJeu: React.FC<ProprietesViceRadarJeu> = ({
  plan, gameplay, audio, musique, volumeMusique, volumeJeu, volumeJeuSousVoix, finVoix, marque, appelAction, barreProgression,
  commentaires = [], intervallesVoix, zooms = [], chrono = null, teaser = null, appelSuite = null,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const scene = plan.scenes[0]!;
  const remplir = gameplay?.cadrage === 'remplir';
  const depuis = gameplay ? Math.round(gameplay.depuis * fps) : 0;
  // Le son du jeu reste bas sous la voix (l'accroche, et chaque commentaire), puis remonte.
  const intervalles = intervallesVoix ?? [{ debut: 0, fin: finVoix }];
  const volume = (f: number) => niveauJeu(f / fps, intervalles, volumeJeu, volumeJeuSousVoix);
  const zoom = 1 + 0.18 * forceZoom(frame / fps, zooms);
  const debutAppel = Math.max(Math.round(finVoix * fps) + fps, durationInFrames - Math.round(3.5 * fps));
  const teaserFrames = teaser && gameplay ? Math.round(teaser.duree * fps) : 0;
  const teaserDebut = teaser && gameplay ? depuis + Math.round(teaser.a * fps) : 0;

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
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} />
            {teaserFrames > 0 && (
              <Sequence durationInFrames={teaserFrames}>
                <Teaser src={gameplay.src} debut={teaserDebut} duree={teaserFrames} />
              </Sequence>
            )}
          </div>
          <div style={{ position: 'absolute', top: JEU_HAUT - 6, left: 0, width: '100%', height: 6, background: `linear-gradient(90deg, ${COULEURS.menthe}, ${COULEURS.orange}, ${COULEURS.rose})` }} />
          <div style={{ position: 'absolute', top: JEU_HAUT + JEU_HAUTEUR, left: 0, width: '100%', height: 6, background: `linear-gradient(90deg, ${COULEURS.rose}, ${COULEURS.orange}, ${COULEURS.menthe})` }} />
        </>
      )}
      {gameplay && remplir && (
        <>
          <AbsoluteFill>
            <OffthreadVideo src={staticFile(gameplay.src)} startFrom={depuis} volume={volume} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} />
            {teaserFrames > 0 && (
              <Sequence durationInFrames={teaserFrames}>
                <Teaser src={gameplay.src} debut={teaserDebut} duree={teaserFrames} />
              </Sequence>
            )}
          </AbsoluteFill>
          {/* Assombrit le haut et le bas pour que le titre et les sous-titres restent lisibles. */}
          <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(7,10,31,0.85) 0%, rgba(7,10,31,0.35) 30%, transparent 45%, transparent 62%, rgba(7,10,31,0.7) 85%)' }} />
        </>
      )}

      <TitreHaut scene={scene} />
      {chrono && gameplay && <Chrono texte={chrono} haut={remplir ? 560 : JEU_HAUT + 24} />}
      <SousTitres groupes={plan.sousTitres} haut={remplir ? 1310 : JEU_HAUT + JEU_HAUTEUR + 40} />

      {appelAction && (
        <Sequence from={debutAppel} layout="none">
          <AppelAction texte={appelAction} suite={appelSuite} />
        </Sequence>
      )}

      <Logo nom={marque.nom} accent={marque.accent} />
      {barreProgression && <BarreProgression dureeFrames={durationInFrames} />}

      {audio && <Audio src={staticFile(audio)} />}
      {commentaires.map((c, i) => (
        <Sequence key={`c${i}`} from={Math.round(c.depuis * fps)} layout="none">
          <Audio src={staticFile(c.src)} />
        </Sequence>
      ))}
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
