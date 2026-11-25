import React from 'react';
import { Composition } from 'remotion';
import exemple from '../exemples/demo-raccourcis/script.json';
import { construirePlan, motsSynthetiques, type ScriptVideo } from './plan';
import { FPS, HAUTEUR, LARGEUR } from './theme';
import { Short, type ProprietesShort } from './Short';

// Valeurs par défaut pour « npm run studio » : l'exemple, sans audio ni clips (fond animé).
const script = exemple as ScriptVideo;
const parDefaut: ProprietesShort = {
  plan: construirePlan(script, motsSynthetiques(script.scenes), []),
  audio: null,
  musique: null,
  volumeMusique: 0.12,
  marque: script.marque ?? { nom: 'MA', accent: 'CHAINE' },
  appelAction: script.fin ?? null,
  barreProgression: true,
  boucle: true,
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Short"
    component={Short}
    width={LARGEUR}
    height={HAUTEUR}
    fps={FPS}
    durationInFrames={Math.ceil(parDefaut.plan.duree * FPS)}
    defaultProps={parDefaut}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, Math.ceil(props.plan.duree * FPS)) })}
  />
);
