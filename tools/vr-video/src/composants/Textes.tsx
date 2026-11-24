import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Chiffre as TChiffre, GroupeSousTitre, ScenePlanifiee } from '../plan';
import { TEXTE, TITRE } from '../polices';
import { ACCENTS, COULEURS, DEGRADE_TITRE } from '../theme';

const CONTOUR = '0 6px 24px rgba(0,0,0,0.55)';

export const Logo: React.FC<{ nom: string; accent: string }> = ({ nom, accent }) => (
  <div style={{ position: 'absolute', top: 70, left: 70, display: 'flex', alignItems: 'center', gap: 18 }}>
    <div style={{
      width: 62, height: 62, borderRadius: '50%', background: COULEURS.blanc, color: COULEURS.marine,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: TITRE, fontSize: 40,
      boxShadow: `0 0 0 4px ${COULEURS.rose}`,
    }}>
      {nom.charAt(0)}
    </div>
    <div style={{ fontFamily: TITRE, fontSize: 40, letterSpacing: 2, color: COULEURS.blanc, textShadow: CONTOUR }}>
      {nom} <span style={{ color: COULEURS.rose }}>{accent}</span>
    </div>
  </div>
);

/** Formate un nombre à la française : 3,79 / 8 000 000. */
export function formaterNombre(valeur: number, decimales = 0): string {
  return valeur.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).replace(/ /g, ' ');
}

const ChiffreAnime: React.FC<{ chiffre: TChiffre; frame: number; immediat: boolean }> = ({ chiffre, frame, immediat }) => {
  const { fps } = useVideoConfig();
  // Le compteur monte en 0,8 s ; en tout début de vidéo il part déjà à 70 % pour que la 1re image soit parlante.
  const p = interpolate(frame, [0, 0.8 * fps], [immediat ? 0.7 : 0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const pop = spring({ frame, fps, config: { damping: 11, stiffness: 160 }, from: immediat ? 0.9 : 0.4, to: 1 });
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', transform: `scale(${pop})`, transformOrigin: 'left bottom', marginBottom: 10 }}>
      {chiffre.prefixe && <span style={{ fontFamily: TITRE, fontSize: 130, color: COULEURS.blanc, marginRight: 12 }}>{chiffre.prefixe}</span>}
      <span style={{
        fontFamily: TITRE, fontSize: 330, lineHeight: 0.95, backgroundImage: DEGRADE_TITRE, WebkitBackgroundClip: 'text',
        backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 0 40px rgba(255,61,127,0.45))',
      }}>
        {formaterNombre(chiffre.valeur * p, chiffre.decimales ?? 0)}
      </span>
      {chiffre.suffixe && <span style={{ fontFamily: TITRE, fontSize: 130, color: COULEURS.blanc, marginLeft: 16 }}>{chiffre.suffixe}</span>}
    </div>
  );
};

const STYLES: Record<string, React.CSSProperties> = {
  normal: { fontFamily: TITRE, fontSize: 150, lineHeight: 0.98, color: COULEURS.blanc, textTransform: 'uppercase', textShadow: CONTOUR },
  gros: {
    fontFamily: TITRE, fontSize: 290, lineHeight: 0.95, textTransform: 'uppercase', backgroundImage: DEGRADE_TITRE,
    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 0 40px rgba(255,61,127,0.45))',
  },
  accent: { fontFamily: TEXTE, fontWeight: 900, fontSize: 66, lineHeight: 1.15, color: COULEURS.menthe, textShadow: CONTOUR },
  petit: { fontFamily: TEXTE, fontWeight: 800, fontSize: 60, lineHeight: 1.18, color: COULEURS.blanc, textShadow: CONTOUR },
};

/** Largeur utile du bloc titre (1080 - 2 × 70 de marge). */
const LARGEUR_TITRE = 940;
/**
 * Les lignes « gros » (un mot énorme, Anton en capitales) rétrécissent si le mot est trop long pour
 * tenir sur la largeur : « AVENGERS » débordait à 290 px. ~0,46 em par caractère pour Anton en capitales.
 */
export function tailleGros(texte: string, base = 290): number {
  const plusLongMot = Math.max(1, ...texte.split(/\s+/).map((m) => m.length));
  return Math.min(base, Math.floor(LARGEUR_TITRE / (plusLongMot * 0.46)));
}

/**
 * Titre d'une scène. Chaque ligne arrive en rebond, décalée de 3 images. Sur la toute première scène,
 * tout est déjà presque en place à l'image 0 : c'est cette image que le spectateur voit en premier dans le flux.
 */
export const BlocTitre: React.FC<{ scene: ScenePlanifiee; immediat: boolean; dureeFrames: number }> = ({ scene, immediat, dureeFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sortie = interpolate(frame, [dureeFrames - 6, dureeFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const entree = (i: number) => {
    const p = spring({ frame: frame - i * 3, fps, config: { damping: 13, stiffness: 190 } });
    return immediat ? Math.max(p, interpolate(frame, [0, 8], [0.82, 1], { extrapolateRight: 'clamp' })) : p;
  };
  // Petite secousse sur le mot « gros » juste après son arrivée.
  const secousse = (i: number) => {
    const f = frame - i * 3 - 5;
    return f > 0 && f < 10 ? Math.sin(f * 2.4) * (10 - f) * 1.2 : 0;
  };

  let n = 0;
  const ligne = (contenu: React.ReactNode, cle: string, style?: string) => {
    const i = n++;
    const p = entree(i);
    return (
      <div key={cle} style={{
        opacity: Math.min(1, p * 1.4) * sortie,
        transform: `translateY(${(1 - p) * 70 - (1 - sortie) * 40}px) scale(${0.86 + 0.14 * p}) translateX(${style === 'gros' ? secousse(i) : 0}px)`,
        transformOrigin: 'left center',
      }}>
        {contenu}
      </div>
    );
  };

  return (
    <div style={{
      position: 'absolute', top: 250, left: 70, right: 70, display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
      // Le titre « respire » très légèrement : l'image n'est jamais figée.
      transform: `scale(${1 + 0.025 * Math.sin((frame / fps) * 1.6)})`, transformOrigin: 'left top',
    }}>
      {scene.tag && ligne(
        <div style={{
          fontFamily: TITRE, fontSize: 44, letterSpacing: 2, color: COULEURS.marine, background: COULEURS.menthe,
          padding: '6px 22px', borderRadius: 14, marginBottom: 18, boxShadow: '0 8px 30px rgba(61,224,192,0.35)',
        }}>
          {scene.tag}
        </div>, 'tag')}
      {scene.chiffre && ligne(<ChiffreAnime chiffre={scene.chiffre} frame={frame} immediat={immediat} />, 'chiffre')}
      {(scene.lignes ?? []).map((l, i) => ligne(
        <div style={l.style === 'gros' ? { ...STYLES.gros, fontSize: tailleGros(l.texte) } : STYLES[l.style ?? 'normal']}>{l.texte}</div>, `l${i}`, l.style))}
    </div>
  );
};

/** Sous-titres « karaoké » : 1 à 3 mots, le mot prononcé est coloré et grossit. `haut` : position verticale (px). */
export const SousTitres: React.FC<{ groupes: GroupeSousTitre[]; haut?: number }> = ({ groupes, haut = 1310 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  // Le premier groupe est déjà affiché à l'image 0 : la toute première image doit accrocher.
  const groupe = groupes.find((g, i) => t >= (i === 0 ? 0 : g.debut - 0.05) && t < g.fin + 0.05) ?? null;
  if (!groupe) return null;
  const accent = ACCENTS[groupe.couleur % ACCENTS.length]!;
  const pop = spring({ frame: frame - Math.round(groupe.debut * fps), fps, config: { damping: 12, stiffness: 220 }, from: 0.75, to: 1 });
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center' }}>
      <div style={{
        position: 'absolute', top: haut, width: 960, display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
        columnGap: 36, rowGap: 6, transform: `scale(${pop})`, fontFamily: TEXTE, fontWeight: 900, fontSize: 82, lineHeight: 1.15,
      }}>
        {groupe.mots.map((m, i) => {
          const actif = t >= m.debut - 0.03 && (t < m.fin + 0.08 || i === groupe.mots.length - 1);
          const dit = t >= m.debut - 0.03;
          return (
            <span key={i} style={{
              display: 'inline-block',
              color: actif ? accent : COULEURS.blanc, opacity: dit ? 1 : 0.85,
              transform: `scale(${actif ? 1.06 : 1}) translateY(${actif ? -4 : 0}px)`,
              WebkitTextStroke: '10px rgba(7,10,31,0.9)', paintOrder: 'stroke fill',
              textShadow: '0 8px 30px rgba(0,0,0,0.6)',
            }}>
              {m.mot}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Fine barre de progression en haut : montre que la vidéo est courte, incite à rester jusqu'au bout. */
export const BarreProgression: React.FC<{ dureeFrames: number }> = ({ dureeFrames }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, height: 10, width: `${(frame / Math.max(1, dureeFrames - 1)) * 100}%`,
      background: `linear-gradient(90deg, ${COULEURS.menthe}, ${COULEURS.orange}, ${COULEURS.rose})`, boxShadow: `0 0 18px ${COULEURS.rose}` }} />
  );
};

/** Appel à l'action en fin de vidéo, qui pulse doucement. */
export const AppelAction: React.FC<{ texte: string }> = ({ texte }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 12 } });
  const pulse = 1 + 0.04 * Math.sin((frame / fps) * 6);
  return (
    <div style={{ position: 'absolute', top: 1560, left: 70, right: 70, display: 'flex', justifyContent: 'center' }}>
      <div style={{
        // Texte long : plus petit, centré, et jamais plus large que l'écran (le rebond du ressort dépasse 1).
        fontFamily: TEXTE, fontWeight: 900, fontSize: texte.length > 30 ? 44 : 52, lineHeight: 1.2, textAlign: 'center', maxWidth: 860,
        color: COULEURS.marine, background: COULEURS.blanc,
        padding: '18px 40px', borderRadius: 60, transform: `scale(${p * pulse})`, boxShadow: `0 0 0 6px ${COULEURS.rose}, 0 12px 40px rgba(0,0,0,0.5)`,
      }}>
        {texte}
      </div>
    </div>
  );
};
