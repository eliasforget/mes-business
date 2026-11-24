import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import './polices';
import { Fonds } from './composants/Fonds';
import { AppelAction, BarreProgression, BlocTitre, Logo, SousTitres } from './composants/Textes';
import type { PlanVideo } from './plan';
import { COULEURS } from './theme';

// « type » plutôt qu'« interface » : Remotion exige des props compatibles avec Record<string, unknown>.
export type ProprietesViceRadar = {
  plan: PlanVideo;
  /** Voix off (chemin dans public/), ou null pour une vidéo muette (aperçu). */
  audio: string | null;
  /** Musique d'ambiance (chemin dans public/), ou null. */
  musique: string | null;
  volumeMusique: number;
  marque: { nom: string; accent: string };
  appelAction: string | null;
  barreProgression: boolean;
  /** Fin en boucle : les dernières images reprennent l'accroche, le replay s'enchaîne sans coupure visible. */
  boucle: boolean;
  /** Habillage (lu au chargement par theme.ts via getInputProps). */
  theme?: string;
};

export const ViceRadar: React.FC<ProprietesViceRadar> = ({ plan, audio, musique, volumeMusique, marque, appelAction, barreProgression, boucle }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const derniere = plan.scenes[plan.scenes.length - 1]!;
  const premiere = plan.scenes[0]!;
  const dureeBoucle = 8;

  return (
    <AbsoluteFill style={{ backgroundColor: COULEURS.nuit }}>
      <Fonds segments={plan.fonds} />

      {plan.scenes.map((scene, i) => {
        const de = Math.round(scene.debut * fps);
        const duree = Math.max(1, Math.round(scene.fin * fps) - de);
        return (
          <Sequence key={i} from={de} durationInFrames={duree} layout="none">
            <BlocTitre scene={scene} immediat={i === 0} dureeFrames={i === plan.scenes.length - 1 && boucle ? duree + 10 : duree} />
          </Sequence>
        );
      })}

      {boucle && (
        <Sequence from={durationInFrames - dureeBoucle} durationInFrames={dureeBoucle} layout="none">
          <FonduEntrant duree={dureeBoucle}>
            <BlocTitre scene={premiere} immediat dureeFrames={dureeBoucle + 10} />
          </FonduEntrant>
        </Sequence>
      )}

      <SousTitres groupes={plan.sousTitres} />

      {appelAction && (
        <Sequence from={Math.round((derniere.debut + 0.6) * fps)} layout="none">
          <AppelAction texte={appelAction} />
        </Sequence>
      )}

      <Logo nom={marque.nom} accent={marque.accent} />
      {barreProgression && <BarreProgression dureeFrames={durationInFrames} />}

      {audio && <Audio src={staticFile(audio)} />}
      {musique && (
        <Audio
          src={staticFile(musique)}
          loop
          volume={(f) =>
            volumeMusique *
            interpolate(f, [0, 10, durationInFrames - fps, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
          }
        />
      )}
    </AbsoluteFill>
  );
};

/** Fait apparaître son contenu en fondu sur `duree` images (useCurrentFrame est relatif à la Sequence). */
const FonduEntrant: React.FC<{ duree: number; children: React.ReactNode }> = ({ duree, children }) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: interpolate(frame, [0, duree - 1], [0, 1], { extrapolateRight: 'clamp' }) }}>{children}</AbsoluteFill>;
};
