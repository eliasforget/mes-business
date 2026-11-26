import React from 'react';
import { Composition } from 'remotion';
import exemple from '../exemples/04-easter-eggs/script.json';
import { construirePlan, construirePlanJeu, motsSynthetiques, type ScriptVideo } from './plan';
import { FPS, HAUTEUR, LARGEUR } from './theme';
import { ViceRadar, type ProprietesViceRadar } from './ViceRadar';
import { ViceRadarJeu, type ProprietesViceRadarJeu } from './ViceRadarJeu';
import { Compilation, dureeCompilation, type ProprietesCompilation } from './Compilation';
import { Planche, taillePlanche, type ProprietesPlanche } from './Planche';

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

// Vidéo de gameplay : sans capture dans le studio, on voit la mise en page (titre, sous-titres, appel à l'action).
const scriptJeu: ScriptVideo = {
  scenes: [{ tag: 'EXPÉRIENCE GTA 6', lignes: [{ texte: 'Planté au milieu', style: 'normal' }, { texte: 'de la route', style: 'accent' }], voix: 'Que se passe-t-il si tu restes planté au milieu de la route dans GTA 6 ? Regarde bien la fin.' }],
  fin: 'Je teste quoi ensuite ? Dis-le en commentaire',
};
const motsJeu = motsSynthetiques(scriptJeu.scenes);
const parDefautJeu: ProprietesViceRadarJeu = {
  plan: construirePlanJeu(scriptJeu, motsJeu, { depuis: 0, duree: 35 }),
  gameplay: null,
  audio: null,
  musique: null,
  volumeMusique: 0,
  volumeJeu: 1,
  volumeJeuSousVoix: 0.25,
  finVoix: motsJeu[motsJeu.length - 1]?.fin ?? 0,
  marque: { nom: 'VICE', accent: 'RADAR' },
  appelAction: scriptJeu.fin ?? null,
  barreProgression: true,
};

// Compilation 16:9 : sans vidéos dans le studio, seulement le fond.
const parDefautCompil: ProprietesCompilation = { videos: [], marque: { nom: 'VICE', accent: 'RADAR' } };

// Planche contact d'une capture (pour l'Agent web) : rendue en image fixe par planche.ts.
const parDefautPlanche: ProprietesPlanche = { src: null, depuis: 0, duree: 35, pas: 1, titre: 'Planche' };

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Planche"
      component={Planche}
      width={taillePlanche(35, 1).largeur}
      height={taillePlanche(35, 1).hauteur}
      fps={FPS}
      durationInFrames={1}
      defaultProps={parDefautPlanche}
      calculateMetadata={({ props }) => ({ width: taillePlanche(props.duree, props.pas).largeur, height: taillePlanche(props.duree, props.pas).hauteur })}
    />
    <Composition
      id="Compilation"
      component={Compilation}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={FPS * 5}
      defaultProps={parDefautCompil}
      calculateMetadata={({ props }) => ({ durationInFrames: Math.max(FPS, dureeCompilation(props.videos)) })}
    />
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
    <Composition
      id="ViceRadarJeu"
      component={ViceRadarJeu}
      width={LARGEUR}
      height={HAUTEUR}
      fps={FPS}
      durationInFrames={Math.ceil(parDefautJeu.plan.duree * FPS)}
      defaultProps={parDefautJeu}
      calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, Math.floor(props.plan.duree * FPS)) })}
    />
  </>
);
