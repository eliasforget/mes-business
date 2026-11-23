import React from 'react';
import { Composition } from 'remotion';
import exemple from '../exemples/04-easter-eggs/script.json';
import { construirePlan, motsSynthetiques, type ScriptVideo } from './plan';
import { FPS, HAUTEUR, LARGEUR } from './theme';
import { ViceRadar, type ProprietesViceRadar } from './ViceRadar';

// Valeurs par défaut pour « npm run studio » : l'exemple, sans audio ni clips (fond synthwave animé).
const script = exemple as ScriptVideo;
const parDefaut: ProprietesViceRadar = {
  plan: construirePlan(script, motsSynthetiques(script.scenes), []),
  audio: null,
  musique: null,
  volumeMusique: 0.12,
  marque: { nom: 'VICE', accent: 'RADAR' },
  appelAction: script.fin ?? null,
  barreProgression: true,
  boucle: true,
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="ViceRadar"
    component={ViceRadar}
    width={LARGEUR}
    height={HAUTEUR}
    fps={FPS}
    durationInFrames={Math.ceil(parDefaut.plan.duree * FPS)}
    defaultProps={parDefaut}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, Math.ceil(props.plan.duree * FPS)) })}
  />
);
